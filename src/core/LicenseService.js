import { SecureState } from './SecureState.js';
import { StorageService } from './StorageService.js';
import { counterKey } from './IssuanceReceipt.mjs';
import { trialStatus, licensedStatus } from './LicensePolicy.mjs';
import { validateEntitlementPayload } from './EntitlementVerifier.mjs';
import { loadProductionLicensePublicKey, validateOfflineActivation } from './LicenseActivationCore.mjs';

const KEY = 'finora_pro_entitlement_v2';
const LEGACY_KEY = 'finora_pro_entitlement_v1';
// This public key is embedded by the release build. No private signing key
// exists in the application, its repository, or any public artifact.
const trustedPublicKey = loadProductionLicensePublicKey(
  import.meta.env?.VITE_LICENSE_PUBLIC_JWK || ''
);

class LicenseServiceImpl {
  constructor() {
    this.state = null;
    this.verifiedPayload = null;
    this.clockRollback = false;
  }

  async init() {
    let stored = await SecureState.get(KEY);
    let hadStoredState = stored !== null && stored !== undefined;
    if (!hadStoredState) {
      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw !== null) {
        hadStoredState = true;
        try { stored = JSON.parse(legacyRaw); }
        catch (_) { stored = null; /* Invalid legacy state must fail closed. */ }
      }
    }
    stored = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    const now = Date.now();
    if (!hadStoredState) {
      // Only a truly new installation receives an initial free trial.
      stored.trialStartedAt = new Date(now).toISOString();
      stored.issuedInvoiceCount = 0;
    }
    // Never rewrite malformed persisted dates/counters into a fresh trial.
    // trialStatus() leaves financial data readable but rejects further writes.
    if (!stored.installationId || typeof stored.installationId !== 'string') {
      stored.installationId = crypto.randomUUID();
    }
    const previousClock = Date.parse(stored.lastSeenAt || '');
    this.clockRollback = Number.isFinite(previousClock) && now + 5 * 60 * 1000 < previousClock;
    this.state = stored;
    this.verifiedPayload = null;
    await this.reconcileIssuedInvoices();
    if (!this.clockRollback && await validateOfflineActivation(
      stored.signedEntitlement, trustedPublicKey, stored.installationId, now
    )) {
      this.verifiedPayload = structuredClone(stored.signedEntitlement.payload);
    }
    // Preserve a previous future timestamp on rollback; do not overwrite proof.
    if (!this.clockRollback) stored.lastSeenAt = new Date(now).toISOString();
    await this._save();
    localStorage.removeItem(LEGACY_KEY);
    return this.status();
  }

  async _save() { await SecureState.set(KEY, this.state); }
  issuanceQuota() {
    this.assertWritable();
    const count = this.state?.issuedInvoiceCount;
    if (!Number.isSafeInteger(count) || count < 0)
      throw Error('Invalid persisted invoice count');
    return { floor: count, limit: this.verifiedPayload ? Number.MAX_SAFE_INTEGER : 20 };
  }
  async reconcileIssuedInvoices() {
    const previous = this.state?.issuedInvoiceCount;
    if (previous !== undefined && (!Number.isSafeInteger(previous) || previous < 0))
      throw Error('Corrupt secure invoice count');
    const reconciled = await StorageService.transaction(['invoices', 'settings'], async tx => {
      const persisted = await tx.get('settings', counterKey);
      if (persisted && (!Number.isSafeInteger(persisted.count) || persisted.count < 0))
        throw Error('Corrupt atomic issuance counter');
      const settings = await tx.getAll('settings');
      const receipts = settings.filter(row =>
        typeof row.id === 'string' && row.id.startsWith('issuance_receipt_')).length;
      const invoices = await tx.getAll('invoices');
      // If older installations have no receipt ledger, conservatively count
      // every surviving finalized invoice rather than silently granting a fresh trial.
      const historical = invoices.filter(row => row && !row.isPreInvoice).length;
      const count = Math.max(previous ?? 0, persisted?.count ?? 0, receipts, historical);
      if (!persisted || persisted.count !== count) {
        await tx.put('settings', { id: counterKey, count, schemaVersion: 1 });
      }
      return count;
    });
    this.state.issuedInvoiceCount = reconciled;
    return reconciled;
  }
  async recordIssuedInvoice() {
    await this.reconcileIssuedInvoices();
    await this._save();
    return this.status();
  }
  hasTrustedIssuer() { return Boolean(trustedPublicKey); }
  installationId() { return this.state?.installationId || null; }

  status() {
    const s = this.state || {};
    const now = Date.now();
    const previousClock = Date.parse(s.lastSeenAt || '');
    const rollback = this.clockRollback ||
      (Number.isFinite(previousClock) && now + 5 * 60 * 1000 < previousClock);
    if (this.verifiedPayload && validateEntitlementPayload(
      this.verifiedPayload, s.installationId, now
    )) {
      return { ...licensedStatus(this.verifiedPayload, now),
        readOnly: rollback || licensedStatus(this.verifiedPayload, now).readOnly,
        installationId: s.installationId };
    }
    if (s.signedEntitlement) {
      // Never treat a bad/expired signature as a renewed free trial.
      return { ...trialStatus(s, now), mode: 'license-invalid', readOnly: true,
        installationId: s.installationId };
    }
    const trial = trialStatus(s, now);
    return { ...trial, readOnly: rollback || trial.readOnly,
      installationId: s.installationId };
  }

  async activateSignedLicense(rawToken) {
    if (!this.state) throw new Error('سامانه مجوز هنوز راه‌اندازی نشده است');
    if (!trustedPublicKey) {
      throw new Error('کلید عمومی صادرکننده معتبر در این نسخه پیکربندی نشده است');
    }
    let token = rawToken;
    if (typeof rawToken === 'string') {
      try { token = JSON.parse(rawToken); }
      catch { throw new Error('ساختار فایل یا متن مجوز نامعتبر است'); }
    }
    if (!await validateOfflineActivation(token, trustedPublicKey,
      this.state.installationId)) {
      throw new Error('امضا، تاریخ یا شناسه دستگاه در مجوز معتبر نیست');
    }
    const next = { ...this.state, signedEntitlement: structuredClone(token) };
    await SecureState.set(KEY, next);
    this.state = next;
    this.verifiedPayload = structuredClone(token.payload);
    return this.status();
  }

  assertWritable() {
    if (this.status().readOnly) {
      throw new Error('دوره استفاده یا مجوز به پایان رسیده است؛ اطلاعات فقط قابل مشاهده‌اند.');
    }
  }

}
export const LicenseService = new LicenseServiceImpl();
