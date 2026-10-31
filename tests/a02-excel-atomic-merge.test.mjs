import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';

// The Excel module registers an optional global UI controller at import time.
globalThis.window ??= globalThis;
const { ExcelController } = await import('../src/controllers/ExcelController.js');

async function reset() {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'excel-admin', role: 'admin', username: 'excel-admin',
    companyIds: ['excel-c1', 'excel-c2'] };
  await StorageService.put('companies', { id: 'excel-c1', name: 'Import Company' });
  await StorageService.put('companies', { id: 'excel-c2', name: 'Other Company' });
  CompanyService.activeCompanyId = 'excel-c1';
}

const products = () => StorageService.getByCompany('products', 'excel-c1');
const contacts = () => StorageService.getByCompany('contacts', 'excel-c1');

test('A02 Excel product import deduplicates against current company and in same workbook', async () => {
  await reset();
  await StorageService.put('products', { id: 'old-c1', companyId: 'excel-c1', code: 'OLD',
    name: 'Existing', buyPrice: 5 });
  await StorageService.put('products', { id: 'foreign-c2', companyId: 'excel-c2',
    code: 'FOREIGN', name: 'Foreign' });
  const result = await ExcelController.importProducts({ 'کالاها': [
    { 'کد': 'OLD', 'نام': 'Do not overwrite' },
    { 'کد': 'NEW', 'نام': 'First', 'قیمت خرید': '۱٬۵۰۰', 'نقطه سفارش': '۲.۵' },
    { 'کد': 'NEW', 'نام': 'Repeated' },
    { 'کد': 'FOREIGN', 'نام': 'Same code but in another company' },
    { 'کد': '', 'نام': '' }
  ] });
  assert.deepEqual(result, { added: 2, skipped: 3, mode: 'merge' });
  const list = await products();
  assert.equal(list.length, 3);
  assert.equal(list.find(p => p.id === 'old-c1').buyPrice, 5);
  assert.equal(list.find(p => p.code === 'NEW').buyPrice, 1500);
  assert.equal(list.find(p => p.code === 'NEW').minStock, 2.5);
  assert.equal(list.find(p => p.code === 'FOREIGN').companyId, 'excel-c1');
  assert.equal((await StorageService.get('products', 'foreign-c2')).name, 'Foreign');
  assert.ok(list.filter(p => p.id !== 'old-c1').every(p =>
    p.createdAt && p.updatedAt && p.ownerUserId === 'excel-admin'));
  assert.equal(list.find(p => p.id === 'old-c1').name, 'Existing');
});

test('A02 contact import preserves both-role and skips repeated company mobile', async () => {
  await reset();
  await StorageService.put('contacts', { id: 'existing', companyId: 'excel-c1',
    mobile: '09120000001', name: 'Original Contact' });
  const result = await ExcelController.importContacts({ 'اشخاص': [
    { 'نام': 'Existing Duplicate', 'موبایل': '09120000001' },
    { 'نام': 'Vendor/customer', 'موبایل': '09120000002', 'نقش': 'هر دو', 'نوع': 'حقوقی' },
    { 'نام': 'Repeated', 'موبایل': '09120000002' },
    { 'نام': 'No phone', 'نقش': 'تامین‌کننده' }
  ] }, {mode:'merge'});
  assert.deepEqual(result, { added: 2, skipped: 2, mode: 'merge' });
  const list = await contacts();
  assert.equal(list.length, 3);
  assert.equal(list.find(c => c.mobile === '09120000002').role, 'both');
  assert.equal(list.find(c => c.mobile === '09120000002').entityType, 'legal');
  assert.equal(list.find(c => c.name === 'No phone').role, 'supplier');
  assert.equal(list.find(c => c.id === 'existing').name, 'Original Contact');
});

test('A02 invalid amounts and malformed rows reject entire workbook before any writes', async () => {
  await reset();
  await assert.rejects(ExcelController.importProducts({ 'کالاها': [
    { 'کد': 'SAFE', 'نام': 'Would have been staged', 'قیمت خرید': 1200 },
    { 'کد': 'INVALID', 'نام': 'Invalid financial amount', 'قیمت فروش': '12abc' }
  ] }), /مقدار ریالی نامعتبر/);
  assert.deepEqual(await products(), []);
  await assert.rejects(ExcelController.importProducts({ 'کالاها': [
    { 'کد': 'VALID', 'نام': 'Staged' }, 'not a row object'
  ] }), /ساختار نامعتبر/);
  assert.deepEqual(await products(), []);
  await assert.rejects(ExcelController.importContacts({ 'اشخاص': [
    { 'نام': 'Would be inserted' }, ['not a keyed row']
  ] }), /ساختار نامعتبر/);
  assert.deepEqual(await contacts(), []);
  await assert.rejects(ExcelController.importProducts({ 'کالاها': [
    { 'نام': 'Overflow', 'قیمت فروش': Number.MAX_SAFE_INTEGER + 1 }
  ] }), /مقدار ریالی نامعتبر/);
});

test('A02 injected transactional write failure rolls back every staged product', async () => {
  await reset();
  const original = StorageService.transaction;
  StorageService.transaction = function(stores, fn, mode) {
    return original.call(this, stores, async tx => {
      let writes = 0;
      return fn({ ...tx, add: async (store, row) => {
        const result = await tx.add(store, row);
        if (++writes === 1) throw new Error('synthetic transaction write failure');
        return result;
      } });
    }, mode);
  };
  try {
    await assert.rejects(ExcelController.importProducts({ 'کالاها': [
      { 'کد': 'A', 'نام': 'First' }, { 'کد': 'B', 'نام': 'Second' }
    ] }), /synthetic transaction write failure/);
  } finally {
    StorageService.transaction = original;
  }
  assert.deepEqual(await products(), [], 'partial first-row insert must be rolled back');
});

test('A02 simultaneous same-company imports cannot create duplicate codes', async () => {
  await reset();
  const data = { 'کالاها': [ { 'نام': 'Race', 'کد': 'CONCURRENT' } ] };
  const [a,b] = await Promise.all([
    ExcelController.importProducts(data), ExcelController.importProducts(data)
  ]);
  assert.equal(a.added + b.added, 1);
  assert.equal(a.skipped + b.skipped, 1);
  assert.equal((await products()).filter(x => x.code === 'CONCURRENT').length, 1);
});

test('A02 unsupported replacement modes preserve data for both entities', async () => {
  await reset();
  await StorageService.put('contacts', { id: 'keep-contact', companyId: 'excel-c1', name: 'Keep' });
  await StorageService.put('products', { id: 'keep-product', companyId: 'excel-c1', name: 'Keep' });
  for(const mode of ['replace','wipe','unknown']) {
    await assert.rejects(ExcelController.importContacts({'اشخاص':[{'نام':'New'}]},{mode}),/جایگزینی گروهی/);
    await assert.rejects(ExcelController.importProducts({'کالاها':[{'نام':'New'}]},{mode}),/جایگزینی گروهی/);
  }
  assert.deepEqual((await contacts()).map(x=>x.id), ['keep-contact']);
  assert.deepEqual((await products()).map(x=>x.id), ['keep-product']);
});
