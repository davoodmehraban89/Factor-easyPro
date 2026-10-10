import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';

test('migration: upgrading legacy IndexedDB v4 preserves invoices and creates V2 accounting stores', async () => {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('finora_pro_db', 4);
    r.onupgradeneeded = () => {
      const legacy = r.result.createObjectStore('invoices', { keyPath: 'id' });
      legacy.put({ id: 'legacy-inv-1', number: 120, kind: 'sale', companyId: 'company_default', grandTotal: 2000 });
      r.result.createObjectStore('products', { keyPath: 'id' })
        .put({ id: 'legacy-product', name: 'کالای قبلی', sellPrice: 2000 });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  db.close();
  const upgraded = await StorageService.init();
  assert.equal(upgraded.version, 6);
  assert.deepEqual((await StorageService.get('invoices', 'legacy-inv-1')).number, 120);
  assert.equal((await StorageService.get('products', 'legacy-product')).name, 'کالای قبلی');
  for (const name of ['account_chart', 'fiscal_periods', 'journal_entries', 'journal_lines']) {
    assert.ok(upgraded.objectStoreNames.contains(name), name);
  }
  await StorageService.put('account_chart', {
    id: 'acc-old-safe', companyId: 'company_default', code: '1',
    name: 'دارایی‌ها', level: 'group', type: 'asset'
  });
  assert.equal((await StorageService.getAllByIndex('account_chart', 'companyId', 'company_default')).length, 1);
  const backup = await StorageService.exportAll();
  assert.equal(backup.data.invoices.length, 1);
  assert.equal(backup.data.products.length, 1);
  assert.equal(backup.data.account_chart.length, 1);
});
