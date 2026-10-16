import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';

test('A03: public and transaction writes cannot replace or delete persisted audit events', async () => {
  await StorageService.clearAll();
  const event = {
    id: 'history-native-1', companyId: 'c1', commandKey: 'c1:posted-1',
    eventType: 'journal_posted', actorId: 'manager', sourceId: 'j1'
  };
  await StorageService.put('audit_events', event);
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
  await StorageService.put('document_corrections', correction);
  const saved = structuredClone(await StorageService.get('document_corrections', correction.id));
  await assert.rejects(StorageService.put('document_corrections',
    { ...saved, sourceId: 'tampered-invoice' }));
  await assert.rejects(StorageService.delete('document_corrections', correction.id),
    /حذف مستقیم/);
  assert.deepEqual(await StorageService.get('document_corrections', correction.id), saved);
});
