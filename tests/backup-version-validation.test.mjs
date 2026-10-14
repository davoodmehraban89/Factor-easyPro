import test from 'node:test';
import assert from 'node:assert/strict';
import { StorageService } from '../src/core/StorageService.js';

test('backup import rejects invalid schema versions before opening the database', async () => {
  for (const version of [undefined, null, '6', 0, -1, 1.5, NaN, Infinity, 999]) {
    await assert.rejects(
      StorageService.importAll({ app: 'Factor-easyPro', version, data: {} }),
      /نسخه فایل پشتیبان نامعتبر است|نسخه جدیدتری/
    );
  }
});

test('backup import rejects an unrelated application before database access', async () => {
  await assert.rejects(
    StorageService.importAll({ app: 'unrelated', version: 6, data: {} }),
    /فینورا پرو/
  );
});

test('backup import rejects array-shaped payloads', async () => {
  await assert.rejects(StorageService.importAll({ app: 'Factor-easyPro', version: 6, data: [] }), /فرمت فایل نامعتبر/);
});
