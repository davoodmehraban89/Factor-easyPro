import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTS, syntheticRecord } from '../scripts/a08-benchmark.mjs';

test('A08 synthetic fixture is stable, bounded and has no personal information', () => {
  assert.deepEqual(COUNTS, { products: 10_000, invoices: 50_000, companies: 5 });
  for (const store of ['products', 'invoices']) {
    const first = syntheticRecord(store, 0);
    const second = syntheticRecord(store, 1);
    assert.deepEqual(syntheticRecord(store, 0), first);
    assert.equal(first.companyId, 'benchmark-c0');
    assert.equal(second.companyId, 'benchmark-c1');
    assert.notEqual(first.id, second.id);
    assert.equal(first.ownerUserId, 'bench-admin');
  }
  assert.equal(syntheticRecord('invoices', 49_999).companyId, 'benchmark-c4');
  assert.throws(() => syntheticRecord('users', 0));
});
