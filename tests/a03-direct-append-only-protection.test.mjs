import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';

// Seed historical fixtures atomically; standalone history writes are forbidden.
const seedHistory = (store, row) => StorageService.transaction(store, tx => tx.put(store, row));

test('A03: public and transaction writes cannot replace or delete persisted audit events', async () => {
  await StorageService.clearAll();
  const event = {
    id: 'history-native-1', companyId: 'c1', commandKey: 'c1:posted-1',
    eventType: 'journal_posted', actorId: 'manager', sourceId: 'j1'
  };
  await seedHistory('audit_events', event);
  const original = structuredClone(await StorageService.get('audit_events', event.id));
  await assert.rejects(StorageService.put('audit_events',
    { ...original, eventType: 'period_closed' }));
  await assert.rejects(StorageService.delete('audit_events', event.id),
    /حذف مستقیم/);
  await assert.rejects(StorageService.transaction('audit_events', async tx => {
    await tx.put('audit_events', { ...original, eventType: 'period_closed' });
  }));
  await assert.rejects(StorageService.transaction('audit_events', async tx => {
    await tx.putRaw('audit_events', { ...original, sourceId: 'forged' });
  }));
  await assert.rejects(StorageService.transaction('audit_events', async tx => {
    await tx.delete('audit_events', event.id);
  }), /حذف مستقیم/);
  assert.deepEqual(await StorageService.get('audit_events', event.id), original);
  assert.equal((await StorageService.getAll('audit_events')).length, 1);
  await StorageService.transaction('audit_events', async tx => {
    await tx.putRaw('audit_events', {
      id: 'history-native-2', companyId: 'c1',
      commandKey: 'c1:posted-2', eventType: 'journal_posted'
    });
  });
  assert.equal((await StorageService.getAll('audit_events')).length, 2);
});

test('A03: document correction history refuses replay writes and deletion', async () => {
  await StorageService.clearAll();
  const correction = { id: 'fix-1', companyId: 'c1',
    idempotencyKey: 'c1:return-1', sourceId: 'invoice-1' };
  await seedHistory('document_corrections', correction);
  const saved = structuredClone(await StorageService.get('document_corrections', correction.id));
  await assert.rejects(StorageService.put('document_corrections',
    { ...saved, sourceId: 'tampered-invoice' }));
  await assert.rejects(StorageService.delete('document_corrections', correction.id),
    /حذف مستقیم/);
  assert.deepEqual(await StorageService.get('document_corrections', correction.id), saved);
});

test('A03: transaction clear cannot erase either append-only history store or commit earlier writes', async () => {
  await StorageService.clearAll();
  for (const store of ['audit_events', 'document_corrections']) {
    const historical = {
      id: 'retained-' + store,
      companyId: 'c1',
      ...(store === 'audit_events'
        ? { commandKey: 'c1:retained-audit', eventType: 'journal_posted' }
        : { idempotencyKey: 'c1:retained-correction', sourceId: 'sale-1' })
    };
    await seedHistory(store, historical);
    const original = structuredClone(await StorageService.get(store, historical.id));
    const sentinel = 'must-rollback-' + store;
    await assert.rejects(
      StorageService.transaction(['contacts', store], async tx => {
        await tx.putRaw('contacts', { id: sentinel, companyId: 'c1', name: 'Aborted write' });
        await tx.clear(store);
      }),
      /پاک‌سازی مستقیم/
    );
    assert.equal(await StorageService.get('contacts', sentinel), undefined,
      'A rejected history clear must roll back the earlier contact write');
    assert.deepEqual(await StorageService.get(store, historical.id), original,
      'Append-only history must survive the blocked bulk clear');
    assert.equal((await StorageService.getAll(store)).length, 1);
  }
  // Clearing a regular non-immutable table remains an authorized transaction.
  await StorageService.put('contacts', { id: 'temporary', companyId: 'c1', name: 'Disposable' });
  await StorageService.transaction('contacts', async tx => tx.clear('contacts'));
  assert.equal((await StorageService.getAll('contacts')).length, 0);
  // Explicit maintenance reset retains the previous full-database semantics.
  // It is NOT exposed as a normal transaction clear of immutable history.
  await StorageService.clearAll();
  assert.equal((await StorageService.getAll('audit_events')).length, 0);
  assert.equal((await StorageService.getAll('document_corrections')).length, 0);
});
