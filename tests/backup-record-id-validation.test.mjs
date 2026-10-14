import test from 'node:test';
import assert from 'node:assert/strict';
import { StorageService } from '../src/core/StorageService.js';

test('backup import rejects malformed record IDs before any IndexedDB write', async () => {
  for (const id of ['', '  ', 0, -2, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      StorageService.importAll({
        app: 'Factor-easyPro',
        version: 6,
        data: { products: [{ id }] }
      }),
      /رکورد نامعتبر/
    );
  }
});

test('backup import rejects array-valued records', async () => {
  await assert.rejects(
    StorageService.importAll({
      app: 'Factor-easyPro',
      version: 6,
      data: { products: [[]] }
    }),
    /رکورد نامعتبر/
  );
});

test('backup import rejects duplicate IDs without opening the database', async () => {
  await assert.rejects(
    StorageService.importAll({
      app: 'Factor-easyPro',
      version: 6,
      data: { products: [{ id: 'same' }, { id: 'same' }] }
    }),
    /شناسه تکراری/
  );
});
