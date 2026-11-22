'use strict';
// Deterministic interpretation of a read-only lab snapshot; never authorizes SQL writes.
const FIELDS = ['invoiceHeaders','invoiceLines','accountingDocuments','orphanInvoiceLines','orphanInvoiceLinesExcludingCandidateSentinel','candidateSentinelRows','missingReferencedAccountingDocuments','duplicateInvoiceTypeNumberGroups','invoiceHeadersWithoutAccountingCode'];
function assessHolooIntegrity(audit) {
  const i = audit?.integrity;
  const invalid = !audit || audit.schemaVersion !== 1 || audit.complete !== true || audit.readOnlyAudit !== true || audit.database !== 'HolooBackup_050808_LAB_20261110' || audit.productionWriteGate?.status !== 'NO-GO' || audit.productionWriteGate?.productionWritesAuthorized !== false || !i || FIELDS.some(k => !Number.isSafeInteger(i[k]) || i[k] < 0) || i.orphanInvoiceLines > i.invoiceLines || i.orphanInvoiceLinesExcludingCandidateSentinel > i.orphanInvoiceLines || i.candidateSentinelRows > i.invoiceLines || i.orphanInvoiceLines - i.orphanInvoiceLinesExcludingCandidateSentinel > i.candidateSentinelRows || i.missingReferencedAccountingDocuments > i.invoiceHeaders || i.invoiceHeadersWithoutAccountingCode > i.invoiceHeaders || i.duplicateInvoiceTypeNumberGroups > Math.floor(i.invoiceHeaders / 2);
  if (invalid) return Object.freeze({status:'INVALID_EVIDENCE', productionWritesAuthorized:false, findings:[]});
  const findings = [];
  if (i.orphanInvoiceLinesExcludingCandidateSentinel > 0) findings.push('MEANINGFUL_ORPHAN_LINES');
  if (i.orphanInvoiceLines > 0) findings.push('RAW_ORPHAN_LINES_REQUIRE_REVIEW');
  if (i.candidateSentinelRows > 0) findings.push('UNVERIFIED_SENTINEL_CANDIDATE');
  if (i.missingReferencedAccountingDocuments > 0) findings.push('MISSING_ACCOUNTING_REFERENCES');
  if (i.duplicateInvoiceTypeNumberGroups > 0) findings.push('DUPLICATE_INVOICE_NUMBERS');
  if (i.invoiceHeadersWithoutAccountingCode > 0) findings.push('HEADERS_WITHOUT_ACCOUNTING_CODE');
  return Object.freeze({status:findings.length?'REVIEW_REQUIRED':'NO_ANOMALIES_IN_CHECKED_METRICS',productionWritesAuthorized:false,findings:Object.freeze(findings),counts:Object.freeze(Object.fromEntries(FIELDS.map(k=>[k,i[k]])))});
}
module.exports = {assessHolooIntegrity};
