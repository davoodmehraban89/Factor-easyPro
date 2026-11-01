import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';

globalThis.window ??= globalThis;
const { InvoiceController } = await import('../src/controllers/InvoiceController.js');

async function seed(patch = {}) {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'markpaid-admin', username: 'admin', role: 'admin' };
  await StorageService.put('companies', { id: 'markpaid-company', name: 'Synthetic' });
  CompanyService.activeCompanyId = 'markpaid-company';
  await StorageService.put('invoices', {
    id: 'markpaid-invoice', companyId: 'markpaid-company', kind: 'sale',
    isPreInvoice: false, grandTotal: 1000, paidAmount: 0, remaining: 1000,
    status: 'unpaid', ...patch
  });
}

test('concurrent payment attempts cannot overpay or lose updates', async () => {
  await seed();
  const results = await Promise.allSettled([
    InvoiceController.markPaid('markpaid-invoice', 600),
    InvoiceController.markPaid('markpaid-invoice', 600)
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  const invoice = await StorageService.get('invoices', 'markpaid-invoice');
  assert.equal(invoice.paidAmount, 600);
  assert.equal(invoice.remaining, 400);
  assert.equal(invoice.status, 'partial');
});

test('markPaid without amount pays only outstanding balance', async () => {
  await seed({ paidAmount: 300, remaining: 700, status: 'partial' });
  await InvoiceController.markPaid('markpaid-invoice');
  const invoice = await StorageService.get('invoices', 'markpaid-invoice');
  assert.equal(invoice.paidAmount, 1000);
  assert.equal(invoice.remaining, 0);
  assert.equal(invoice.status, 'paid');
});

test('invalid payments and preinvoices fail closed without writes', async () => {
  for (const payment of [0, -1, 1001, NaN, Infinity, '12x']) {
    await seed();
    await assert.rejects(InvoiceController.markPaid('markpaid-invoice', payment));
    assert.equal((await StorageService.get('invoices', 'markpaid-invoice')).paidAmount, 0);
  }
  await seed({ isPreInvoice: true });
  await assert.rejects(InvoiceController.markPaid('markpaid-invoice', 10), /پیش‌فاکتور/);
  await seed({ financePosted: true });
  await assert.rejects(InvoiceController.markPaid('markpaid-invoice', 10));
});

test('payment cannot modify another company invoice', async () => {
  await seed({ companyId: 'other-company' });
  await assert.rejects(InvoiceController.markPaid('markpaid-invoice', 10));
  assert.equal((await StorageService.get('invoices', 'markpaid-invoice')).paidAmount, 0);
});
test('invoice deletion preserves unrelated stock movements with matching refId', async () => {
  await seed();
  await StorageService.put('stock_movements', { id: 'invoice-movement', companyId: 'markpaid-company', refId: 'markpaid-invoice', refType: 'invoice', qty: 1 });
  await StorageService.put('stock_movements', { id: 'other-movement', companyId: 'markpaid-company', refId: 'markpaid-invoice', refType: 'stocktake', qty: 2 });
  await InvoiceController.delete('markpaid-invoice');
  assert.equal(await StorageService.get('stock_movements', 'invoice-movement'), undefined);
  assert.equal((await StorageService.get('stock_movements', 'other-movement')).qty, 2);
});