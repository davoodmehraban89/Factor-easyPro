import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';

test('A03: full restore refuses to mutate prior audit events and rolls back earlier writes', async () => {
  await StorageService.clearAll();
  const audit = {
    id: 'audit-history-1', companyId: 'c1',
    commandKey: 'c1:historic', eventType: 'journal_posted',
    actorId: 'manager', sourceId: 'journal-1',
    result: 'committed', safeSummary: { lineCount: 2 }
  };
  await StorageService.put('audit_events', { ...audit });
  const before = await StorageService.get('audit_events', audit.id);
  await assert.rejects(StorageService.importAll({
    app: 'Factor-easyPro', version: 7,
    data: {
      products: [{ id: 'new-product', companyId: 'c1', name: 'must roll back' }],
      audit_events: [{ ...before, eventType: 'period_closed' }]
    }
  }), /بازنویسی سابقه/);
  assert.equal(await StorageService.get('products', 'new-product'), undefined);
  assert.deepEqual(await StorageService.get('audit_events', audit.id), before);

  // Identical replay with shuffled object keys is safe and idempotent.
  const replay = { companyId: 'c1', id: before.id, result: before.result,
    safeSummary: { lineCount: 2 }, commandKey: before.commandKey,
    eventType: before.eventType, actorId: before.actorId, sourceId: before.sourceId,
    createdAt: before.createdAt, updatedAt: before.updatedAt };
  await StorageService.importAll({
    app: 'Factor-easyPro', version: 7, data: { audit_events: [replay] }
  });
  assert.equal((await StorageService.getAll('audit_events')).length, 1);
});

test('A03: full restore preserves document corrections and rejects ID overwrite', async () => {
  await StorageService.clearAll();
  const correction = {
    id: 'correction-1', companyId: 'c1',
    idempotencyKey: 'return:invoice-1', sourceId: 'invoice-1',
    correctionType: 'return', resultId: 'return-1'
  };
  await StorageService.put('document_corrections', { ...correction });
  const before = await StorageService.get('document_corrections', correction.id);
  await assert.rejects(StorageService.importAll({
    app: 'Factor-easyPro', version: 7,
    data: { document_corrections: [{ ...before, resultId: 'forged' }] }
  }), /بازنویسی سابقه/);
  assert.deepEqual(await StorageService.get('document_corrections', correction.id), before);
});

test('A03: legitimate novel audit records may be restored without destroying existing history', async () => {
  await StorageService.clearAll();
  const newer = { id: 'new-audit', companyId: 'c1', commandKey: 'c1:novel',
    eventType: 'journal_posted', actorId: 'manager', sourceId: 'j1' };
  await StorageService.importAll({
    app: 'Factor-easyPro', version: 7,
    data: { audit_events: [newer] }
  });
  assert.equal((await StorageService.getAll('audit_events')).length, 1);
  assert.equal((await StorageService.get('audit_events', newer.id)).sourceId, 'j1');
});
