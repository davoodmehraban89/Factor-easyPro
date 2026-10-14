import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';

test('A03 migration: v6 invoices and ledgers survive an additive v7 upgrade', async () => {
  const raw = await new Promise((resolve, reject) => {
    const req = indexedDB.open('finora_pro_db', 6);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('invoices', { keyPath: 'id' })
        .put({ id: 'before-upgrade', companyId: 'c1', grandTotal: 1550 });
      db.createObjectStore('journal_entries', { keyPath: 'id' })
        .put({ id: 'historic-journal', companyId: 'c1', status: 'posted' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  raw.close();

  const db = await StorageService.init();
  assert.equal(db.version, 7);
  assert.equal((await StorageService.get('invoices', 'before-upgrade')).grandTotal, 1550);
  assert.equal((await StorageService.get('journal_entries', 'historic-journal')).status, 'posted');
  assert.ok(db.objectStoreNames.contains('audit_events'));
  assert.ok(db.objectStoreNames.contains('document_corrections'));
  assert.equal((await StorageService.getAll('audit_events')).length, 0,
    'Existing records must not be falsely presented as historically audited');

  // A v6 snapshot is accepted by the v7 importer without fabricating audit events.
  const legacy = { app: 'Factor-easyPro', version: 6,
    data: { products: [{ id: 'old-stock', companyId: 'c1', name: 'Old stock' }] } };
  await StorageService.importAll(legacy);
  assert.equal((await StorageService.get('products', 'old-stock')).name, 'Old stock');
  assert.equal((await StorageService.getAll('audit_events')).length, 0);
});
