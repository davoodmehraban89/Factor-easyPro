import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { LicenseService } from '../src/core/LicenseService.js';
import {
  recordIssuanceReceipt, counterKey, receiptKey, createIssuanceIdentity,
  findIdempotentInvoice
} from '../src/core/IssuanceReceipt.mjs';

const invoice = (id, changes = {}) => ({
  id, companyId: 'idb-company', number: id, kind: 'sale',
  isPreInvoice: false, date: '1405/08/12', subtotal: 1000,
  totalDiscount: 0, discountType: 'fixed', discountInput: 0,
  vatEnabled: false, vatRate: 0, vatAmount: 0, grandTotal: 1000,
  paymentMethod: 'cash', paidAmount: 0, items: [],
  ...changes
});
async function issue(row, quota, key = 'integration-request-key-0001') {
  const identity = await createIssuanceIdentity(row, key);
  const request = { ...row, ...identity };
  return StorageService.transaction(['invoices', 'settings'], async tx => {
    const replay = await findIdempotentInvoice(tx, request);
    if (replay) return replay;
    await tx.put('invoices', request);
    await recordIssuanceReceipt(tx, request, quota);
    return request;
  });
}

test('real IndexedDB serializes concurrent issuance against a single remaining quota slot', async () => {
  await StorageService.clearAll();
  const attempts = Array.from({ length: 10 }, (_, i) =>
    issue(invoice('parallel-' + i), { floor: 0, limit: 1 }, 'parallel-request-' + i));
  const outcomes = await Promise.allSettled(attempts);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(x => x.status === 'rejected').length, 9);
  assert.equal(await StorageService.count('invoices'), 1);
  const counter = await StorageService.get('settings', counterKey);
  assert.equal(counter.count, 1);
});

test('same idempotency key and same payload concurrently return one committed invoice', async () => {
  await StorageService.clearAll();
  const payload = invoice('same-request');
  const outcomes = await Promise.all([
    issue(payload, { floor: 0, limit: 5 }, 'stable-request-key-000001'),
    issue({ ...payload, items: [] }, { floor: 0, limit: 5 }, 'stable-request-key-000001')
  ]);
  assert.equal(outcomes[0].id, outcomes[1].id);
  assert.equal(await StorageService.count('invoices'), 1);
  assert.equal((await StorageService.get('settings', counterKey)).count, 1);
});

test('same idempotency key with changed financial payload is rejected without a second write', async () => {
  await StorageService.clearAll();
  const key = 'stable-request-key-000002';
  await issue(invoice('same-key-original'), { floor: 0, limit: 5 }, key);
  await assert.rejects(
    issue(invoice('same-key-tampered', { grandTotal: 900, subtotal: 900 }), { floor: 0, limit: 5 }, key),
    /Idempotency key reused with different invoice content/
  );
  assert.equal(await StorageService.count('invoices'), 1);
  assert.equal((await StorageService.get('settings', counterKey)).count, 1);
});

test('idempotency records are scoped to company and cannot replay another company invoice', async () => {
  await StorageService.clearAll();
  const key = 'shared-request-key-company';
  await issue(invoice('company-a'), { floor: 0, limit: 5 }, key);
  const other = invoice('company-b', { companyId: 'other-company' });
  const result = await issue(other, { floor: 0, limit: 5 }, key);
  assert.equal(result.id, 'company-b');
  assert.equal(result.companyId, 'other-company');
  assert.equal(await StorageService.count('invoices'), 2);
  assert.equal((await StorageService.get('settings', counterKey)).count, 2);
});

test('aborted transaction leaves no partial invoice, receipt, idempotency record or counter', async () => {
  await StorageService.clearAll();
  const row = invoice('abort-before-commit');
  const identity = await createIssuanceIdentity(row, 'abort-request-key-000001');
  const request = { ...row, ...identity };
  await assert.rejects(StorageService.transaction(['invoices', 'settings'], async tx => {
    await tx.put('invoices', request);
    await recordIssuanceReceipt(tx, request, { floor: 0, limit: 2 });
    throw new Error('injected failure before commit');
  }), /injected failure/);
  assert.equal(await StorageService.get('invoices', row.id), undefined);
  assert.equal(await StorageService.get('settings', receiptKey(row.companyId, row.id)), undefined);
  assert.equal(await StorageService.get('settings', counterKey), undefined);
});

test('committed receipt and counter survive database handle close and reopen', async () => {
  await StorageService.clearAll();
  await issue(invoice('persisted-invoice'), { floor: 0, limit: 3 }, 'persist-request-key-000001');
  StorageService.db.close();
  StorageService.db = null;
  StorageService._opening = null;
  await StorageService.init();
  assert.equal((await StorageService.get('invoices', 'persisted-invoice')).id, 'persisted-invoice');
  assert.equal((await StorageService.get('settings', receiptKey('idb-company', 'persisted-invoice'))).invoiceId, 'persisted-invoice');
  assert.equal((await StorageService.get('settings', counterKey)).count, 1);
});

test('license reconciliation bootstraps a missing counter from surviving historical invoices', async () => {
  await StorageService.clearAll();
  for (let i = 0; i < 4; i++) await StorageService.put('invoices', invoice('legacy-' + i));
  await StorageService.put('invoices', invoice('draft', { isPreInvoice: true }));
  const oldState = LicenseService.state;
  try {
    LicenseService.state = { issuedInvoiceCount: 1 };
    const recovered = await LicenseService.reconcileIssuedInvoices();
    assert.equal(recovered, 4);
    assert.equal(LicenseService.state.issuedInvoiceCount, 4);
    assert.equal((await StorageService.get('settings', counterKey)).count, 4);
  } finally {
    LicenseService.state = oldState;
  }
});

test('license reconciliation never lowers a surviving secure or database high-water mark', async () => {
  await StorageService.clearAll();
  await StorageService.put('invoices', invoice('one-historical'));
  await StorageService.put('settings', { id: counterKey, count: 12, schemaVersion: 1 });
  const oldState = LicenseService.state;
  try {
    LicenseService.state = { issuedInvoiceCount: 15 };
    const recovered = await LicenseService.reconcileIssuedInvoices();
    assert.equal(recovered, 15);
    assert.equal((await StorageService.get('settings', counterKey)).count, 15);
  } finally {
    LicenseService.state = oldState;
  }
});
