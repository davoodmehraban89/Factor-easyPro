import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { Auth } from '../src/core/Auth.js';
import { RetailPostingService } from '../src/core/RetailPostingService.js';

async function reset() {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'cashier', role: 'user', username: 'cashier', companyIds: ['c1'] };
  await StorageService.put('companies', { id: 'c1', name: 'One' });
  await StorageService.put('companies', { id: 'c2', name: 'Two' });
  CompanyService.activeCompanyId = 'c1';
}

test('A01: read-only return preview uses actual original invoice, prior returns and payments', async () => {
  await reset();
  await StorageService.put('invoices', {
    id: 'sale-1', companyId: 'c1', kind: 'sale', financePosted: true,
    grandTotal: 1_000_000, paidAmount: 400_000
  });
  await StorageService.put('invoices', {
    id: 'return-1', companyId: 'c1', kind: 'sale_return', financePosted: true,
    originalInvoiceId: 'sale-1', grandTotal: 200_000
  });
  const before = await StorageService.getAll('invoices');
  const p = await RetailPostingService.previewSaleReturn('sale-1', 600_000);
  assert.equal(p.receivableBefore, 400_000);
  assert.equal(p.allocatedToReceivable, 400_000);
  assert.equal(p.newCustomerCredit, 200_000);
  assert.equal(p.receivableAfter, 0);
  assert.equal(p.autoRefundAllowed, false);
  assert.deepEqual(await StorageService.getAll('invoices'), before);
  assert.equal((await StorageService.getAll('treasury')).length, 0);
  assert.equal((await StorageService.getAll('journal_entries')).length, 0);
});

test('A01: read-only preview rejects cross-company origin and nonfinal invoices', async () => {
  await reset();
  await StorageService.put('invoices', {
    id: 'foreign', companyId: 'c2', kind: 'sale',
    financePosted: true, grandTotal: 100, paidAmount: 0
  });
  await assert.rejects(RetailPostingService.previewSaleReturn('foreign', 50), /شرکت فعال/);
  await StorageService.put('invoices', {
    id: 'draft', companyId: 'c1', kind: 'sale',
    isPreInvoice: true, grandTotal: 100, paidAmount: 0
  });
  await assert.rejects(RetailPostingService.previewSaleReturn('draft', 50), /فروش قطعی/);
  await StorageService.put('invoices', {
    id: 'purchased', companyId: 'c1', kind: 'purchase',
    financePosted: true, grandTotal: 100, paidAmount: 0
  });
  await assert.rejects(RetailPostingService.previewSaleReturn('purchased', 50), /فروش قطعی/);
});

test('A01: read-only preview rejects return totals above source', async () => {
  await reset();
  await StorageService.put('invoices', {
    id: 'sale', companyId: 'c1', kind: 'sale',
    financePosted: true, grandTotal: 500, paidAmount: 100
  });
  await StorageService.put('invoices', {
    id: 'prior-return', companyId: 'c1', kind: 'sale_return',
    financePosted: true, originalInvoiceId: 'sale', grandTotal: 400
  });
  await assert.rejects(RetailPostingService.previewSaleReturn('sale', 101), /بیشتر/);
  assert.equal((await StorageService.getAll('invoices')).length, 2);
});
