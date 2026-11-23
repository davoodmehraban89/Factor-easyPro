import test from 'node:test';
import assert from 'node:assert/strict';
import { recordIssuanceReceipt, counterKey, createRetryStorageKey, createIssuanceIdentity } from '../src/core/IssuanceReceipt.mjs';

function store() {
  const rows = new Map();
  const tx = {
    get: async (_, id) => rows.get(id),
    put: async (_, row) => { rows.set(row.id, row); }
  };
  return { rows, tx };
}
const invoice = id => ({ id, companyId: 'c1', number: id, kind: 'sale', idempotencyKey: 'quota-test-key-' + id.padStart(8, '0'), requestHash: 'b'.repeat(64) });

test('quota counts from secure floor and rejects twenty-first issuance', async () => {
  const { rows, tx } = store();
  await recordIssuanceReceipt(tx, invoice('20'), { floor: 19, limit: 20 });
  assert.equal(rows.get(counterKey).count, 20);
  await assert.rejects(recordIssuanceReceipt(tx, invoice('21'), { floor: 19, limit: 20 }), /quota exhausted/);
  assert.equal(rows.size, 3);
});
test('stale secure floor cannot reset persisted atomic counter', async () => {
  const { rows, tx } = store();
  await recordIssuanceReceipt(tx, invoice('1'), { floor: 18, limit: 20 });
  await recordIssuanceReceipt(tx, invoice('2'), { floor: 0, limit: 20 });
  assert.equal(rows.get(counterKey).count, 20);
  await assert.rejects(recordIssuanceReceipt(tx, invoice('3'), { floor: 0, limit: 20 }), /quota exhausted/);
});
test('malformed quota and corrupt counter fail closed', async () => {
  const { rows, tx } = store();
  await assert.rejects(recordIssuanceReceipt(tx, invoice('1'), { floor: -1, limit: 20 }), /quota is mandatory/);
  rows.set(counterKey, { id: counterKey, count: -1 });
  await assert.rejects(recordIssuanceReceipt(tx, invoice('2'), { floor: 0, limit: 20 }), /Corrupt issuance counter/);
});

test('receipt cannot be written without a mandatory quota', async () => {
  const { rows, tx } = store();
  await assert.rejects(recordIssuanceReceipt(tx, invoice('missing-quota')), /quota is mandatory/);
  assert.equal(rows.size, 0);
});

test('UI retry storage keys are deterministic per payload and isolated across payloads', async () => {
  const a = await createRetryStorageKey('payload-a');
  const aRetry = await createRetryStorageKey('payload-a');
  const b = await createRetryStorageKey('payload-b');
  assert.equal(a, aRetry);
  assert.notEqual(a, b);
  assert.match(a, /^factor_easypro_pending_invoice_v2:[a-f0-9]{64}$/);
  await assert.rejects(createRetryStorageKey(''), /Invalid retry signature/);
});

test('automatic server-assigned invoice number does not break a retry fingerprint', async () => {
  const base = {
    companyId: 'c1', kind: 'sale', date: '1405/08/12', contactId: 'cust1',
    items: [{ productId: 'p1', qty: 1, price: 500, discount: 0 }],
    subtotal: 500, totalDiscount: 0, discountType: 'fixed', discountInput: 0,
    vatEnabled: false, vatRate: 0, vatAmount: 0, grandTotal: 500,
    paymentMethod: 'cash', paidAmount: 0, requestedNumber: null
  };
  const first = await createIssuanceIdentity({ ...base, number: '101' }, 'stable-retry-number-test');
  const retry = await createIssuanceIdentity({ ...base, number: '102' }, 'stable-retry-number-test');
  assert.equal(first.requestHash, retry.requestHash);
  const manualA = await createIssuanceIdentity({ ...base, requestedNumber: '500', number: '500' }, 'manual-retry-number-test');
  const manualB = await createIssuanceIdentity({ ...base, requestedNumber: '501', number: '501' }, 'manual-retry-number-test');
  assert.notEqual(manualA.requestHash, manualB.requestHash);
});
