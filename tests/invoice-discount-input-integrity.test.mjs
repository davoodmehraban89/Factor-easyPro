import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';

globalThis.window ??= globalThis;
const { InvoiceController } = await import('../src/controllers/InvoiceController.js');

async function setup() {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'fractional-discount-admin', username: 'admin', role: 'admin' };
  await StorageService.put('companies', { id: 'discount-test-company', name: 'Synthetic only' });
  CompanyService.activeCompanyId = 'discount-test-company';
}

const base = discountInput => ({
  kind: 'sale', isPreInvoice: true, date: '1405/07/18',
  contactId: 'synthetic-contact', contactName: 'Synthetic',
  items: [{productId: 'synthetic-product', productName: 'Synthetic',
    qty: 2.5, price: 1200, discountType: 'percent',
    discountInput, discount: 300}],
  discountType: 'fixed', discountInput: 0,
  vatEnabled: false, vatRate: 0, paidAmount: 0,
  paymentMethod: 'credit'
});

test('fractional invoice with 10% row discount saves 10%, not computed 300% or 100%', async () => {
  await setup();
  const invoice = await InvoiceController.save(base(10));
  assert.equal(invoice.items[0].lineSubtotal, 3000);
  assert.equal(invoice.items[0].discountInput, 10);
  assert.equal(invoice.items[0].discount, 300);
  assert.equal(invoice.items[0].lineTotal, 2700);
  assert.equal(invoice.subtotal, 2700);
  assert.equal(invoice.grandTotal, 2700);
  assert.equal((await StorageService.get('invoices', invoice.id)).grandTotal, 2700);
});

test('legacy line percent discount uses raw discount when discountInput is absent', async () => {
  await setup();
  const payload = base(10);
  delete payload.items[0].discountInput;
  payload.items[0].discount = 10;
  const invoice = await InvoiceController.save(payload);
  assert.equal(invoice.items[0].discount, 300);
  assert.equal(invoice.items[0].lineTotal, 2700);
});

test('invalid row discount must fail before creating a financial invoice or preinvoice', async () => {
  await setup();
  for (const invalid of [101, -1, Infinity, 'invalid']) {
    await assert.rejects(InvoiceController.save(base(invalid)), /تخفیف ردیف فاکتور نامعتبر/);
    assert.deepEqual(await StorageService.getByCompany('invoices', 'discount-test-company'), []);
  }
});

test('UI updates discountInput, not already-calculated rial discount, when typing', () => {
  const view = readFileSync(new URL('../src/views/InvoiceFormView.js', import.meta.url), 'utf8');
  assert.match(view, /if \(field === 'discount'\) \{[\s\S]*?ctx\.data\.items\[idx\]\.discountInput = NumberInput\.parse\(value\)/);
});
