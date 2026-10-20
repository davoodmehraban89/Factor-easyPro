import { Auth } from './Auth.js';
import { DataScope } from './DataScope.js';
import { StorageService } from './StorageService.js';
import { auditHash, verifyChain as checkAuditChain } from './AuditChain.js';

const trustedAuditRows = new WeakSet();
const authorizedRestoreTransactions = new WeakMap();
const validUtc = value => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  !Number.isNaN(Date.parse(value));
export const isAuditServiceRow = row => !!row && trustedAuditRows.has(row);

const VALID_TYPES = new Set([
  'journal_posted', 'journal_reversed', 'period_closed',
  'commercial_journal_posted', 'draft_posted', 'draft_updated',
  'draft_discarded', 'draft_created', 'period_opened', 'backup_restored',
  'opening_posted'
]);
const validId = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
const validBusinessDate = value => value === null ||
  (typeof value === 'string' && /^\d{4}\/\d{2}\/\d{2}$/.test(value));

class AuditServiceImpl {
  /**
   * Must execute INSIDE the same readwrite IndexedDB transaction as the
   * audited business operation. Never call StorageService.put separately.
   */
  async append(tx, { companyId, eventType, sourceType, sourceId,
    commandKey, businessDate = null, correlationId, lineCount = 0 }) {
    const actorId = Auth.current()?.id;
    if (!validId(companyId) || !validId(actorId) ||
        !VALID_TYPES.has(eventType) || !validId(sourceType) ||
        !validId(sourceId) || !validId(commandKey) ||
        !validBusinessDate(businessDate) ||
        !Number.isSafeInteger(lineCount) || lineCount < 0) {
      throw new Error('داده رویداد ممیزی نامعتبر است');
    }
    const event = {
      id: StorageService.uid('audit_'), companyId, actorId,
      eventType, sourceType, sourceId,
      occurredAtUtc: new Date().toISOString(), businessDate,
      correlationId: validId(correlationId) ? correlationId : StorageService.uid('corr_'),
      commandKey: companyId + ':' + commandKey,
      schemaVersion: 1, documentVersion: 1,
      result: 'committed', createdByService: true,
      // No customer name, phone, free-text description, secrets or bank details.
      safeSummary: { lineCount }
    };
    // add() cannot overwrite an earlier event and a unique commandKey makes
    // replay fail atomically. No externally mutable audit status is stored.
    trustedAuditRows.add(event);
    await tx.add('audit_events', event);
    return event;
  }

  // Restore permission is scoped to a single transaction and company.
  // Only validated restore flows should invoke this entry point.
  authorizeRestore(tx, { companyId, rows }) {
    if (!Auth.isAdmin() || !validId(companyId) || !Array.isArray(rows) ||
        rows.some(row => !row || row.companyId !== companyId)) {
      throw new Error('مجوز بازیابی ممیزی نامعتبر است');
    }
    const permissions = authorizedRestoreTransactions.get(tx) || new Map();
    permissions.set(companyId, new WeakSet(rows));
    authorizedRestoreTransactions.set(tx, permissions);
  }

  async restoreHistorical(tx, row) {
    const authorization = authorizedRestoreTransactions.get(tx)?.get(row?.companyId);
    if (!authorization || !authorization.has(row) ||
        !validId(row.companyId)) {
      throw new Error('بازیابی مستقیم ممیزی خارج از جریان مجاز است');
    }
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        !validId(row.id) || !validId(row.companyId) ||
        !validId(row.actorId) || !VALID_TYPES.has(row.eventType) ||
        !validId(row.commandKey) || !validId(row.sourceId) ||
        (row.businessDate !== undefined && !validBusinessDate(row.businessDate)) ||
        (row.occurredAtUtc !== undefined && !validUtc(row.occurredAtUtc))) {
      throw new Error('رکورد تاریخچه ممیزی نامعتبر است');
    }
    authorization.delete(row);
    const copy = { ...row };
    trustedAuditRows.add(copy);
    await tx.add('audit_events', copy);
  }

  async list({ limit = 100 } = {}) {
    if (!Auth.isAdmin()) throw new Error('مشاهده ردپای حسابرسی فقط برای مدیر مجاز است');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError('محدودیت نمایش رویداد ممیزی نامعتبر است');
    }
    const companyId = await DataScope.companyId();
    const events = await StorageService.getAllByIndex('audit_events', 'companyId', companyId);
    // Read-only company scope; no user secrets or private payloads in these events.
    return events.sort((a, b) =>
      String(b.occurredAtUtc).localeCompare(String(a.occurredAtUtc)) ||
      String(b.id).localeCompare(String(a.id))).slice(0, limit);
  }
}
export const AuditService = new AuditServiceImpl();
