import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('A07: blocked v6-to-v7 upgrade times out rather than hanging at initial splash, then safely retries', async () => {
  const older = await new Promise((resolve, reject) => {
    const request = indexedDB.open('finora_pro_db', 6);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  StorageService.blockedTimeoutMs = 25;
  await assert.rejects(StorageService.init(), /ارتقای پایگاه داده متوقف شده/);
  assert.equal(StorageService._opening, null);
  assert.equal(StorageService.db, null);

  // Closing the stale handle may complete the first request; its on-success
  // must close the late v7 connection instead of retaining it as the active DB.
  older.close();
  await pause(10);
  const current = await StorageService.init();
  assert.equal(current.version, 7);
  assert.equal(StorageService.db, current);
  assert.equal((await StorageService.getAll('audit_events')).length, 0);
});

test('A07: repeated init calls share the same successful opening transaction', async () => {
  const [a, b] = await Promise.all([StorageService.init(), StorageService.init()]);
  assert.equal(a, b);
  assert.equal(a.version, 7);
});
