import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { StorageService } from '../src/core/StorageService.js';
import {
  createTreasuryRetryIdentity, clearTreasuryRetryIdentity
} from '../src/core/IssuanceReceipt.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
let sequence = 0;
const makeId = () => 'treasury:durable-request-' + (++sequence).toString().padStart(4, '0');
async function clear(identity) {
  await StorageService.transaction('settings', tx => tx.delete('settings', identity.storageKey));
}

test('treasury retry identity is atomic across concurrent callers and survives WebView restart', async () => {
  const signature = JSON.stringify({
    companyId: 'synthetic-company-A', type: 'receipt', date: '1405/08/18',
    amount: 200000, method: 'cash', contactId: 'synthetic-contact',
    refInvoiceId: 'synthetic-invoice', fromAccountId: null,
    toAccountId: 'synthetic-cashbox', description: 'synthetic acceptance',
    reasonCode: null
  });
  const identities = await Promise.all(Array.from({ length: 6 },
    () => createTreasuryRetryIdentity(signature, StorageService, makeId)));
  assert.equal(new Set(identities.map(x => x.idempotencyKey)).size, 1);
  assert.equal(sequence, 1);
  const first = identities[0];
  const stored = await StorageService.get('settings', first.storageKey);
  assert.equal(stored.signatureHash.length, 64);
  assert.equal(stored.idempotencyKey, first.idempotencyKey);
  assert.equal(JSON.stringify(stored).includes('200000'), false);
  assert.equal(JSON.stringify(stored).includes('synthetic-invoice'), false);

  // A fresh WebView process reads the same IndexedDB retry record.
  const afterRestart = await createTreasuryRetryIdentity(signature, StorageService, makeId);
  assert.equal(afterRestart.idempotencyKey, first.idempotencyKey);
  assert.equal(afterRestart.storageKey, first.storageKey);
  assert.equal(sequence, 1);
  await clear(first);
});

test('changed payload or company receives a distinct retry identity', async () => {
  const base = { companyId: 'synthetic-company-A', type: 'receipt', amount: 200000, invoice: 'invoice-A' };
  const a = await createTreasuryRetryIdentity(JSON.stringify(base), StorageService, makeId);
  const changedAmount = await createTreasuryRetryIdentity(JSON.stringify({ ...base, amount: 300000 }), StorageService, makeId);
  const changedCompany = await createTreasuryRetryIdentity(JSON.stringify({ ...base, companyId: 'synthetic-company-B' }), StorageService, makeId);
  assert.notEqual(a.idempotencyKey, changedAmount.idempotencyKey);
  assert.notEqual(a.idempotencyKey, changedCompany.idempotencyKey);
  await Promise.all([clear(a), clear(changedAmount), clear(changedCompany)]);
});

test('successful completion clears only its matching pending key and allows a later identical intent', async () => {
  const signature = 'same valid synthetic receipt payload';
  const first = await createTreasuryRetryIdentity(signature, StorageService, makeId);
  const wrong = await clearTreasuryRetryIdentity(StorageService, {
    storageKey: first.storageKey, idempotencyKey: 'treasury:not-the-same-key'
  });
  assert.equal(wrong, false);
  const cleared = await clearTreasuryRetryIdentity(StorageService, first);
  assert.equal(cleared, true);
  const nextIntent = await createTreasuryRetryIdentity(signature, StorageService, makeId);
  assert.notEqual(first.idempotencyKey, nextIntent.idempotencyKey);
  await clear(nextIntent);
});

test('corrupt retry metadata fails closed rather than minting a replacement key', async () => {
  const signature = 'corruption synthetic signature';
  const first = await createTreasuryRetryIdentity(signature, StorageService, makeId);
  await StorageService.put('settings', {
    id: first.storageKey, signatureHash: first.storageKey.slice('treasury_retry_v1:'.length),
    idempotencyKey: '', recordType: 'treasury_retry_pending', schemaVersion: 1
  });
  await assert.rejects(
    createTreasuryRetryIdentity(signature, StorageService, makeId),
    /Corrupt treasury retry identity/
  );
  await clear(first);
});

test('treasury UI uses the durable company-scoped IndexedDB identity through commit', async () => {
  const source = await readFile(new URL('../src/views/TreasuryView.js', import.meta.url), 'utf8');
  assert.match(source, /createTreasuryRetryIdentity\(retrySignature, StorageService\)/);
  assert.match(source, /companyId: await DataScope\.companyId\(\)/);
  assert.match(source, /data\.idempotencyKey = identity\.idempotencyKey/);
  assert.match(source, /clearTreasuryRetryIdentity\(StorageService/);
  assert.doesNotMatch(source, /txIdempotencyKey|localStorage/);
});
