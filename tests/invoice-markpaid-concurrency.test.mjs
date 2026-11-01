import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { LicenseService } from '../src/core/LicenseService.js';

globalThis.window ??= globalThis;
const licenseStorage = new Map();
globalThis.localStorage ??= { getItem: k => licenseStorage.get(k) ?? null, setItem: (k,v) => licenseStorage.set(k,String(v)), removeItem: k => licenseStorage.delete(k) };
const { InvoiceController } = await import('../src/controllers/InvoiceController.js');

async function seed(patch = {}) {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'markpaid-admin', username: 'admin', role: 'admin' };
  await StorageService.put('companies', { id: 'markpaid-company', name: 'Synthetic' });
  CompanyService.activeCompanyId = 'markpaid-company';
  LicenseService.state = { trialStartedAt: new Date().toISOString(), issuedInvoiceCount: 0 };
  LicenseService.verifiedPayload = null;
  LicenseService.clockRollback = false;
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
test('invoice deletion preserves cross-company stock movements even with matching reference', async () => {
  await seed();
  await StorageService.put('stock_movements', { id: 'other-company-movement', companyId: 'other-company', refId: 'markpaid-invoice', refType: 'invoice', qty: 4 });
  await StorageService.put('stock_movements', { id: 'own-invoice-movement', companyId: 'markpaid-company', refId: 'markpaid-invoice', refType: 'invoice', qty: 2 });
  await InvoiceController.delete('markpaid-invoice');
  assert.equal(await StorageService.get('stock_movements', 'own-invoice-movement'), undefined);
  assert.equal((await StorageService.get('stock_movements', 'other-company-movement')).qty, 4);
});

test('posted invoice deletion fails without changing stock or invoice', async () => {
  await seed({ financePosted: true });
  await StorageService.put('stock_movements', { id: 'posted-movement', companyId: 'markpaid-company', refId: 'markpaid-invoice', refType: 'invoice', qty: 1 });
  await assert.rejects(InvoiceController.delete('markpaid-invoice'));
  assert.ok(await StorageService.get('invoices', 'markpaid-invoice'));
  assert.ok(await StorageService.get('stock_movements', 'posted-movement'));
});

test('delete serializes against payment and leaves no orphan stock records', async () => {
  await seed();
  await StorageService.put('stock_movements', { id: 'movement', companyId: 'markpaid-company', refId: 'markpaid-invoice', refType: 'invoice', qty: 1 });
  await Promise.allSettled([InvoiceController.delete('markpaid-invoice'), InvoiceController.markPaid('markpaid-invoice', 100)]);
  assert.equal(await StorageService.get('invoices', 'markpaid-invoice'), undefined);
  assert.equal(await StorageService.get('stock_movements', 'movement'), undefined);
});
test('legacy stock rebuild never deletes another company movement with same invoice id', async () => {
  await seed();
  await StorageService.put('stock_movements', { id: 'foreign-rebuild-movement', companyId: 'other-company', refId: 'markpaid-invoice', refType: 'invoice', qty: 9 });
  await StorageService.put('stock_movements', { id: 'local-rebuild-movement', companyId: 'markpaid-company', refId: 'markpaid-invoice', refType: 'invoice', qty: 3 });
  await InvoiceController._rebuildStockMovements({ id: 'markpaid-invoice', companyId: 'markpaid-company', kind: 'sale', number: '10', isPreInvoice: true, items: [] });
  assert.equal(await StorageService.get('stock_movements', 'local-rebuild-movement'), undefined);
  assert.equal((await StorageService.get('stock_movements', 'foreign-rebuild-movement')).qty, 9);
});
test('legacy rebuild rolls back deletions when product belongs to another company', async () => {
  await seed();
  await StorageService.put('stock_movements', { id: 'rollback-existing', companyId: 'markpaid-company', refId: 'markpaid-invoice', refType: 'invoice', qty: 7 });
  await StorageService.put('products', { id: 'foreign-product', companyId: 'other-company', trackInventory: true });
  await assert.rejects(InvoiceController._rebuildStockMovements({ id: 'markpaid-invoice', companyId: 'markpaid-company', kind: 'sale', number: '10', items: [{ productId: 'foreign-product', qty: 1 }] }), /outside the active company/);
  assert.equal((await StorageService.get('stock_movements', 'rollback-existing')).qty, 7);
  assert.equal((await StorageService.getAll('stock_movements')).length, 1);
});

test('legacy rebuild rejects cross-company invoice without touching stock', async () => {
  await seed();
  await StorageService.put('stock_movements', { id: 'protected-movement', companyId: 'other-company', refId: 'markpaid-invoice', refType: 'invoice', qty: 5 });
  await assert.rejects(InvoiceController._rebuildStockMovements({ id: 'markpaid-invoice', companyId: 'other-company', isPreInvoice: true, items: [] }), /restricted to the active company/);
  assert.equal((await StorageService.get('stock_movements', 'protected-movement')).qty, 5);
});
test('legacy invoice creation rolls back invoice when stock product belongs to another company', async () => {
  await seed();
  await StorageService.put('products', { id: 'foreign-create-product', companyId: 'other-company', trackInventory: true });
  const before = await StorageService.getAll('invoices');
  await assert.rejects(InvoiceController.save({
    kind: 'sale', isPreInvoice: false, number: '10', items: [{ productId: 'foreign-create-product', qty: 1, price: 100 }],
    vatEnabled: false, paidAmount: 0, discountInput: 0
  }), /outside the active company/);
  assert.deepEqual(await StorageService.getAll('invoices'), before);
  assert.deepEqual(await StorageService.getAll('stock_movements'), []);
});

test('legacy invoice edit rolls back both invoice and stock on invalid product', async () => {
  await seed({ isPreInvoice: true, items: [], number: '10' });
  await StorageService.put('products', { id: 'foreign-edit-product', companyId: 'other-company', trackInventory: true });
  await StorageService.put('stock_movements', { id: 'existing-stock', companyId: 'markpaid-company', refType: 'invoice', refId: 'markpaid-invoice', qty: 3 });
  const before = await StorageService.get('invoices', 'markpaid-invoice');
  await assert.rejects(InvoiceController.save({
    kind: 'sale', isPreInvoice: false, number: '10', items: [{ productId: 'foreign-edit-product', qty: 1, price: 100 }],
    vatEnabled: false, paidAmount: 0, discountInput: 0
  }, 'markpaid-invoice'), /outside the active company/);
  assert.deepEqual(await StorageService.get('invoices', 'markpaid-invoice'), before);
  assert.equal((await StorageService.get('stock_movements', 'existing-stock')).qty, 3);
});

test('legacy preinvoice conversion rolls back when product is foreign', async () => {
  await seed({ isPreInvoice: true, number: '10', items: [{ productId: 'foreign-convert-product', qty: 1 }] });
  await StorageService.put('products', { id: 'foreign-convert-product', companyId: 'other-company', trackInventory: true });
  const before = await StorageService.get('invoices', 'markpaid-invoice');
  await assert.rejects(InvoiceController.convertPreInvoice('markpaid-invoice'), /outside the active company/);
  assert.deepEqual(await StorageService.get('invoices', 'markpaid-invoice'), before);
  assert.deepEqual(await StorageService.getAll('stock_movements'), []);
});

test('legacy concurrent duplicate invoice numbers serialize and reject one save', async () => {
  await seed({ isPreInvoice: true });
  const payload = { kind: 'sale', isPreInvoice: false, number: '11', items: [], vatEnabled: false, paidAmount: 0, discountInput: 0 };
  const results = await Promise.allSettled([InvoiceController.save(payload), InvoiceController.save(payload)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1, JSON.stringify(results.map(x => x.status === 'rejected' ? String(x.reason) : x.status)));
  assert.equal(results.filter(x => x.status === 'rejected').length, 1);
  assert.equal((await StorageService.getByCompany('invoices', 'markpaid-company')).filter(x => !x.isPreInvoice).length, 1);
});