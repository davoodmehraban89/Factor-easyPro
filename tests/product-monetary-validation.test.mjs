import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';

globalThis.window ??= globalThis;
const { ProductController } = await import('../src/controllers/ProductController.js');

async function setup() {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'product-validation-admin', username: 'admin', role: 'admin' };
  await StorageService.put('companies', { id: 'product-validation-company', name: 'Synthetic' });
  CompanyService.activeCompanyId = 'product-validation-company';
}
const list = () => StorageService.getByCompany('products', 'product-validation-company');

test('product create enforces safe nonnegative integral rial prices', async () => {
  await setup();
  for (const invalid of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, 'oops']) {
    await assert.rejects(ProductController.createProduct({
      name: 'Rejected', buyPrice: invalid, sellPrice: 10
    }), /نامعتبر|صحیح/);
    assert.deepEqual(await list(), [], 'invalid product price must never write');
    await assert.rejects(ProductController.createProduct({
      name: 'Rejected', buyPrice: 10, sellPrice: invalid
    }), /نامعتبر|صحیح/);
    assert.deepEqual(await list(), []);
  }
});

test('stock reorder point allows three decimals but rejects over-precision and negatives', async () => {
  await setup();
  for (const value of [-1, 1.2345, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(ProductController.createProduct({
      name: 'Rejected', minStock: value
    }), /نامعتبر/);
    assert.deepEqual(await list(), []);
  }
  await ProductController.createProduct({
    name: 'Valid', code: 'FRACTIONAL', buyPrice: 1500, sellPrice: 2000, minStock: 2.125
  });
  const rows = await list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].minStock, 2.125);
  assert.equal(rows[0].buyPrice, 1500);
  assert.equal(rows[0].sellPrice, 2000);
});

test('invalid product updates retain original persisted prices and reorder point', async () => {
  await setup();
  await ProductController.createProduct({
    name: 'Original', code: 'UNCHANGED', buyPrice: 1200, sellPrice: 1400, minStock: 0.25
  });
  const original = (await list())[0];
  for (const patch of [
    { buyPrice: 1.25 }, { sellPrice: -2 }, { minStock: 1.2345 }
  ]) {
    await assert.rejects(ProductController.updateProduct(original.id, {
      name: original.name, code: original.code,
      buyPrice: original.buyPrice, sellPrice: original.sellPrice,
      minStock: original.minStock, ...patch
    }), /نامعتبر|صحیح/);
    const unchanged = await StorageService.get('products', original.id);
    assert.equal(unchanged.buyPrice, 1200);
    assert.equal(unchanged.sellPrice, 1400);
    assert.equal(unchanged.minStock, 0.25);
  }
});

test('missing optional numeric values retain the zero default', async () => {
  await setup();
  await ProductController.createProduct({ name: 'No prices' });
  const row = (await list())[0];
  assert.equal(row.buyPrice, 0);
  assert.equal(row.sellPrice, 0);
  assert.equal(row.minStock, 0);
});
