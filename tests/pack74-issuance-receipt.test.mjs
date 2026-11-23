import test from 'node:test';
import assert from 'node:assert/strict';
import { receiptKey, recordIssuanceReceipt } from '../src/core/IssuanceReceipt.mjs';

test('receipt persists once and duplicate is rejected', async () => {
  const rows = new Map();
  const tx = { get: async (_, id) => rows.get(id), put: async (_, row) => { rows.set(row.id, row); } };
  const invoice = { id: 'inv1', companyId: 'c1', number: '5', kind: 'sale', isPreInvoice: false, idempotencyKey: 'receipt-test-key-0001', requestHash: 'a'.repeat(64) };
  await assert.rejects(recordIssuanceReceipt(tx, invoice), /quota is mandatory/);
  assert.equal(rows.size, 0);
  await recordIssuanceReceipt(tx, invoice, { floor: 0, limit: 20 });
  assert.equal(rows.get(receiptKey('c1', 'inv1')).number, '5');
  await assert.rejects(recordIssuanceReceipt(tx, invoice, { floor: 0, limit: 20 }), /Duplicate issuance receipt/);
  assert.equal(rows.get('issuance_global_counter_v1').count, 1);
});

test('receipt rejects preinvoice and missing identity', async () => {
  const tx = { get: async () => null, put: async () => { throw Error('should not write'); } };
  await assert.rejects(recordIssuanceReceipt(tx, { id: 'x', companyId: 'c', isPreInvoice: true }), /Invalid issuance receipt/);
  await assert.rejects(recordIssuanceReceipt(tx, { id: 'x', isPreInvoice: false }), /Invalid issuance receipt/);
});

test('receipt key separates company and invoice identities', () => {
  assert.notEqual(receiptKey('a', 'bc'), receiptKey('ab', 'c'));
});
