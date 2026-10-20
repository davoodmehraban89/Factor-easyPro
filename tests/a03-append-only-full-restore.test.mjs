import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';

// Seed historical fixtures atomically; standalone history writes are forbidden.
const seedHistory = (store, row) => store === 'audit_events'
  ? StorageService.importAll({ app: 'Factor-easyPro', version: 6, data: { audit_events: [row] } })
  : StorageService.transaction(store, tx => tx.put(store, row));

test('A03: full restore refuses to mutate prior audit events and rolls back earlier writes', async () => {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'manager', role: 'admin', username: 'manager' };
  const audit = {
    id: 'audit-history-1', companyId: 'c1',
    commandKey: 'c1:historic', eventType: 'journal_posted',
    actorId: 'manager', sourceId: 'journal-1',
    result: 'committed', safeSummary: { lineCount: 2 }
  };
  await seedHistory('audit_events', { ...audit });
  const before = await StorageService.get('audit_events', audit.id);
  await assert.rejects(StorageService.importAll({
    app: 'Factor-easyPro', version: 7,
    data: {
      products: [{ id: 'new-product', companyId: 'c1', name: 'must roll back' }],
      audit_events: [{ ...before, eventType: 'period_closed' }]
    }
  }), /بازنویسی سابقه|زنجیره ممیزی/);
  assert.equal(await StorageService.get('products', 'new-product'), undefined);
  assert.deepEqual(await StorageService.get('audit_events', audit.id), before);

  // Identical replay with shuffled object keys is safe and idempotent.
  const replay = Object.fromEntries(Object.entries(before).reverse());
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
  await seedHistory('document_corrections', { ...correction });
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
