import { StorageService } from './StorageService.js';
import { DataScope } from './DataScope.js';
import { auditStoredInvoiceProvenance } from './InvoiceMetadataProvenance.mjs';

/**
 * Read-only, company-scoped financial consistency checks.
 * This service never repairs numbers, posts journals, updates invoice status,
 * or reads credentials. Investigate every anomaly before any corrective posting.
 */
export async function inspectSettlementConsistency({ maxIssues = 100 } = {}) {
  if (!Number.isSafeInteger(maxIssues) || maxIssues < 1 || maxIssues > 1000) {
    throw new RangeError('حداکثر تعداد مغایرت‌ها باید بین ۱ تا ۱۰۰۰ باشد');
  }
  const companyId = await DataScope.companyId();
  return StorageService.transaction(['invoices', 'settlements', 'treasury'], async tx => {
    const invoices = (await tx.getAll('invoices'))
      .filter(row => row.companyId === companyId && row.financePosted && !row.isPreInvoice);
    const settlements = (await tx.getAll('settlements'))
      .filter(row => row.companyId === companyId);
    const transactions = new Set((await tx.getAll('treasury'))
      .filter(row => row.companyId === companyId && row.recordType === 'transaction')
      .map(row => row.id));

    const invoiceById = new Map(invoices.map(row => [row.id, row]));
    const allocated = new Map();
    const issues = [];
    let issueCount = 0;
    const add = (code, documentId, details = {}) => {
      issueCount++;
      if (issues.length < maxIssues) issues.push({ code, documentId, ...details });
    };
    const validAmount = n => Number.isSafeInteger(n) && n >= 0;

    for (const s of settlements) {
      if (!invoiceById.has(s.invoiceId)) {
        add('ORPHAN_SETTLEMENT', s.id, { invoiceId: s.invoiceId });
        continue;
      }
      if (!Number.isSafeInteger(s.amount) || s.amount <= 0) {
        add('INVALID_SETTLEMENT_AMOUNT', s.id, { invoiceId: s.invoiceId });
        continue;
      }
      if (!transactions.has(s.transactionId)) {
        add('MISSING_TREASURY_TRANSACTION', s.id, { invoiceId: s.invoiceId });
      }
      const cumulative = (allocated.get(s.invoiceId) || 0) + s.amount;
      if (!Number.isSafeInteger(cumulative)) {
        add('SETTLEMENT_AMOUNT_OVERFLOW', s.id, { invoiceId: s.invoiceId });
        continue;
      }
      allocated.set(s.invoiceId, cumulative);
    }

    for (const invoice of invoices) {
      const gross = invoice.grandTotal;
      const paid = invoice.paidAmount;
      if (!validAmount(gross) || !validAmount(paid)) {
        add('INVALID_INVOICE_AMOUNT', invoice.id);
        continue;
      }
      const settled = allocated.get(invoice.id) || 0;
      if (settled !== paid) {
        add('SETTLEMENT_TOTAL_MISMATCH', invoice.id, { expected: settled, actual: paid });
      }
      if (paid > gross) add('INVOICE_OVERPAID', invoice.id, { grandTotal: gross, paid });
      const remaining = gross - paid;
      if (invoice.remaining !== remaining) {
        add('INVOICE_REMAINING_MISMATCH', invoice.id, { expected: remaining, actual: invoice.remaining });
      }
      if (['paid', 'partial', 'unpaid'].includes(invoice.status)) {
        const expected = paid === 0 ? 'unpaid' : paid === gross ? 'paid' : 'partial';
        if (invoice.status !== expected) {
          add('INVOICE_STATUS_MISMATCH', invoice.id, { expected, actual: invoice.status });
        }
      }
    }

    return Object.freeze({
      companyId,
      checkedInvoices: invoices.length,
      checkedSettlements: settlements.length,
      issueCount,
      healthy: issueCount === 0,
      truncated: issueCount > issues.length,
      issues
    });
  }, 'readonly');
}


/**
 * A01: identify missing/inconsistent legacy VAT and discount *provenance*.
 * A missing rate does NOT imply a zero tax rate, and this diagnostic must never
 * normalize historical invoices or post compensating entries automatically.
 * Reports codes + record IDs only, bounded and scoped to the active company.
 */
export async function inspectInvoiceMetadataProvenance({ maxIssues = 100 } = {}) {
  if (!Number.isSafeInteger(maxIssues) || maxIssues < 1 || maxIssues > 1000)
    throw new RangeError('حداکثر موارد بررسی باید بین ۱ تا ۱۰۰۰ باشد');
  const companyId = await DataScope.companyId();
  return StorageService.transaction(['invoices'], async tx => {
    const invoices = (await tx.getAll('invoices'))
      .filter(row => row.companyId === companyId && row.isPreInvoice !== true);
    const issues = [];
    let issueCount = 0;
    let affectedInvoices = 0;
    let legacyDirectInvoices = 0;
    for (const row of invoices) {
      if (row.financePosted !== true) legacyDirectInvoices++;
      const findings = auditStoredInvoiceProvenance(row);
      if (findings.length) affectedInvoices++;
      issueCount += findings.length;
      for (const issue of findings) {
        if (issues.length >= maxIssues) break;
        // Never add source-supplied names, descriptions, phones, amounts or notes.
        issues.push({ documentId: String(row.id ?? ''), ...issue });
      }
    }
    return Object.freeze({
      companyId,
      checkedInvoices: invoices.length,
      legacyDirectInvoices,
      affectedInvoices,
      issueCount,
      healthy: issueCount === 0,
      truncated: issueCount > issues.length,
      issues
    });
  });
}
