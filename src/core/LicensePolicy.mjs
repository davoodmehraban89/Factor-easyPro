export const TRIAL_DAYS = 15;
export const TRIAL_INVOICE_LIMIT = 20;
export const OFFLINE_LEASE_DAYS = 30;
export const WARNING_DAY = 25;
const FUTURE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

// A corrupt or missing persisted trial date/counter must never create a new
// writable 15-day trial. Newly installed clients receive a valid date/counter
// during LicenseService.init() before status() is used.
export function trialStatus(state, nowMs = Date.now()) {
  const started = typeof state?.trialStartedAt === 'string'
    ? Date.parse(state.trialStartedAt) : NaN;
  const count = state?.issuedInvoiceCount;
  const validClock = Number.isFinite(nowMs);
  const validStart = validClock && Number.isFinite(started) &&
    started <= nowMs + FUTURE_CLOCK_TOLERANCE_MS;
  const validCount = Number.isSafeInteger(count) && count >= 0;
  const elapsedDays = validStart
    ? Math.max(0, Math.floor((nowMs - started) / 86400000)) : TRIAL_DAYS;
  const invoiceCount = validCount ? count : TRIAL_INVOICE_LIMIT;
  const readOnly = !validStart || !validCount ||
    elapsedDays >= TRIAL_DAYS || invoiceCount >= TRIAL_INVOICE_LIMIT;
  return {
    mode: 'trial', elapsedDays, invoiceCount,
    daysRemaining: readOnly ? 0 : Math.max(0, TRIAL_DAYS - elapsedDays),
    invoicesRemaining: readOnly ? 0 : Math.max(0, TRIAL_INVOICE_LIMIT - invoiceCount),
    readOnly, maxCompanies: 5, maxUsers: 4, maxDevices: 1
  };
}

export function licensedStatus(license, nowMs = Date.now()) {
  const checked = typeof license?.lastOnlineCheckAt === 'string'
    ? Date.parse(license.lastOnlineCheckAt) : NaN;
  const validLease = Number.isFinite(nowMs) && Number.isFinite(checked) &&
    checked <= nowMs + FUTURE_CLOCK_TOLERANCE_MS;
  const ageDays = validLease ? Math.max(0, (nowMs - checked) / 86400000) : Infinity;
  const expiry = typeof license?.expiresAt === 'string'
    ? Date.parse(license.expiresAt) : NaN;
  const expired = license?.perpetual !== true &&
    (!Number.isFinite(expiry) || nowMs > expiry);
  return {
    mode: 'licensed',
    readOnly: !validLease || expired || ageDays > OFFLINE_LEASE_DAYS,
    warning: ageDays >= WARNING_DAY,
    maxCompanies: Math.min(5, Number(license?.maxCompanies) || 1),
    maxUsers: Math.min(4, Number(license?.maxUsers) || 1),
    maxDevices: Number(license?.maxDevices) || 1
  };
}
