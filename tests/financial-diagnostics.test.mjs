import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { inspectSettlementConsistency } from '../src/core/FinancialDiagnosticsService.js';

async function setup() {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'staff-c1', role: 'user', companyIds: ['c1'], username: 'staff' };
  await StorageService.put('companies', { id: 'c1', name: 'A' });
  await StorageService.put('companies', { id: 'c2', name: 'B' });
  CompanyService.activeCompanyId = 'c1';
}

test('A05 diagnostic: a consistent settlement is healthy without touching financial records', async () => {
  await setup();
  await StorageService.put('invoices', {
    id: 'i1', companyId: 'c1', financePosted: true,
    grandTotal: 100, paidAmount: 40, remaining: 60, status: 'partial'
  });
  await StorageService.put('treasury', {
    id: 't1', companyId: 'c1', recordType: 'transaction', amount: 40
  });
  await StorageService.put('settlements', {
    id: 's1', companyId: 'c1', invoiceId: 'i1', transactionId: 't1', amount: 40
  });
  await StorageService.put('invoices', {
    id: 'foreign', companyId: 'c2', financePosted: true,
    grandTotal: 1000, paidAmount: 999, remaining: 0, status: 'paid'
  });
  const before = await StorageService.get('invoices', 'i1');
  const diagnostics = await inspectSettlementConsistency();
  assert.deepEqual({
    companyId: diagnostics.companyId,
    checkedInvoices: diagnostics.checkedInvoices,
    checkedSettlements: diagnostics.checkedSettlements,
    healthy: diagnostics.healthy,
    issueCount: diagnostics.issueCount
  }, { companyId: 'c1', checkedInvoices: 1, checkedSettlements: 1, healthy: true, issueCount: 0 });
  assert.deepEqual(await StorageService.get('invoices', 'i1'), before);
});

test('A05 diagnostic: mismatched and orphan settlement records are reported but never fixed automatically', async () => {
  await setup();
  await StorageService.put('invoices', {
    id: 'i1', companyId: 'c1', financePosted: true,
    grandTotal: 100, paidAmount: 35, remaining: 25, status: 'paid'
  });
  await StorageService.put('settlements', {
    id: 's1', companyId: 'c1', invoiceId: 'i1', transactionId: 'missing', amount: 20
  });
  await StorageService.put('settlements', {
    id: 'orphan', companyId: 'c1', invoiceId: 'foreign', transactionId: 'missing', amount: 50
  });
  const result = await inspectSettlementConsistency();
  const codes = result.issues.map(x => x.code);
  assert.equal(result.healthy, false);
  for (const code of [
    'ORPHAN_SETTLEMENT', 'MISSING_TREASURY_TRANSACTION',
    'SETTLEMENT_TOTAL_MISMATCH', 'INVOICE_REMAINING_MISMATCH', 'INVOICE_STATUS_MISMATCH'
  ]) assert.ok(codes.includes(code), code);
  assert.equal((await StorageService.get('invoices', 'i1')).paidAmount, 35);
  assert.equal((await StorageService.getAll('settlements')).length, 2);
});

test('A05 diagnostic: only bounded issue identifiers and numeric facts are returned', async () => {
  await setup();
  await StorageService.put('invoices', {
    id: 'bad-i', companyId: 'c1', financePosted: true,
    grandTotal: 100, paidAmount: 10, remaining: 0, status: 'paid',
    customerPhone: 'PRIVATE_NUMBER_NOT_TO_LEAK'
  });
  const result = await inspectSettlementConsistency({ maxIssues: 1 });
  assert.equal(result.truncated, true);
  assert.equal(result.issues.length, 1);
  assert.ok(result.issueCount > 1);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_NUMBER_NOT_TO_LEAK'));
  for (const maxIssues of [0, -1, 1001, 1.5]) {
    await assert.rejects(inspectSettlementConsistency({ maxIssues }), RangeError);
  }
});
