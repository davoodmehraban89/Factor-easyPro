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


test('manual legacy stock movement rejects company/type/negative/overprecision',async()=>{
 await setup();
 const p=await ProductController.createProduct({name:'Synthetic item',buyPrice:100,minStock:0.5});
 for(const [type,qty,id] of [
  ['in',0,p.id],['out',-1,p.id],['adjust',-1,p.id],['in',1.2345,p.id],
  ['adjust','bad',p.id],['unknown',1,p.id],['in',1,'not-a-product']
 ]) {
  await assert.rejects(ProductController.addStockMovement(id,type,qty),/نامعتبر|شرکت فعال|مقدار کالا/);
  assert.deepEqual(await StorageService.getByCompany('stock_movements','product-validation-company'),[]);
 }
 await ProductController.addStockMovement(p.id,'in',1.25);
 await ProductController.addStockMovement(p.id,'adjust',0);
 const moves=await StorageService.getByCompany('stock_movements','product-validation-company');
 assert.equal(moves.length,2);
 assert.deepEqual(moves.map(m=>m.qty).sort((a,b)=>a-b),[0,1.25]);
});

test('product price and stock editors validate text strictly before writes',async()=>{
 const fs=await import('node:fs');
 const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
 for(const [path,fragment] of [
  ['src/views/ProductsView.js',"NumberInput.parseStrict(document.getElementById('pBuyPrice')"],
  ['src/views/ProductsView.js',"NumberInput.parseStrict(document.getElementById('pSellPrice')"],
  ['src/views/ProductsView.js',"NumberInput.parseStrict(document.getElementById('pMinStock')"],
  ['src/views/StockKardexModal.js',"NumberInput.parseStrict(document.getElementById('adjQty')"],
  ['src/views/InvoiceFormView.js',"NumberInput.parseStrict(document.getElementById('qpBuyPrice')"],
  ['src/views/InvoiceFormView.js',"NumberInput.parseStrict(document.getElementById('qpSellPrice')"]
 ]) assert.ok(source(path).includes(fragment),path);
});
