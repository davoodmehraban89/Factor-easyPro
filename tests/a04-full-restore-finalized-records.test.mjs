import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';

const backup = data => ({ app: 'Factor-easyPro', version: 7, data });
const C = 'historic-company';

test('A04: full backup cannot mutate posted invoices and must roll back earlier master changes', async () => {
  await StorageService.clearAll();
  await StorageService.put('invoices', {
    id: 'posted-sale', companyId: C, financePosted: true,
    kind: 'sale', grandTotal: 1000, paidAmount: 200, remaining: 800
  });
  const original = await StorageService.get('invoices', 'posted-sale');
  await assert.rejects(StorageService.importAll(backup({
    contacts: [{ id: 'rollback-contact', companyId: C, name: 'Must not remain' }],
    invoices: [{ ...original, grandTotal: 100 }]
  })), /بازنویسی سند قطعی/);
  assert.equal(await StorageService.get('contacts', 'rollback-contact'), undefined);
  assert.deepEqual(await StorageService.get('invoices', 'posted-sale'), original);

  await StorageService.importAll(backup({ invoices: [{ ...original }] }));
  assert.deepEqual(await StorageService.get('invoices', 'posted-sale'), original);
});

test('A04: full restore rejects mutation of original posted ledger lines', async () => {
  await StorageService.clearAll();
  await StorageService.put('journal_entries', {
    id: 'historic-journal', companyId: C, status: 'posted',
    date: '1405/01/01', periodId: 'old-period'
  });
  await StorageService.put('journal_lines', {
    id: 'historic-line', companyId: C, journalId: 'historic-journal',
    accountId: 'account-id', debit: 400, credit: 0
  });
  const original = await StorageService.get('journal_lines', 'historic-line');
  await assert.rejects(StorageService.importAll(backup({
    journal_lines: [{ ...original, debit: 99 }]
  })), /بازنویسی سند قطعی/);
  assert.deepEqual(await StorageService.get('journal_lines', 'historic-line'), original);
});

test('A04: full restore protects historical treasury, stock and settlement records', async () => {
  await StorageService.clearAll();
  const cases = [
    ['stock_movements', { id: 'stock-1', companyId: C, type: 'out', cost: 100 }, { cost: 999 }],
    ['settlements', { id: 'settlement-1', companyId: C, amount: 100 }, { amount: 5 }],
    ['treasury', { id: 'cash-1', companyId: C, recordType: 'transaction', amount: 100 }, { amount: 5 }],
    ['cheques', { id: 'cheque-1', companyId: C, financePosted: true, status: 'pending' }, { status: 'cleared' }],
    ['expenses', { id: 'expense-1', companyId: C, financePosted: true, amount: 100 }, { amount: 1 }]
  ];
  for (const [store, initial, changed] of cases) {
    await StorageService.put(store, { ...initial });
    const old = await StorageService.get(store, initial.id);
    await assert.rejects(StorageService.importAll(backup({
      [store]: [{ ...old, ...changed }]
    })), /بازنویسی سند قطعی/);
    assert.deepEqual(await StorageService.get(store, initial.id), old);
  }
});

test('A04: original finalized actor cannot be switched to another company by global restore', async () => {
  await StorageService.clearAll();
  await StorageService.put('invoices', {
    id: 'company-owned-sale', companyId: 'original-c1',
    financePosted: true, grandTotal: 110
  });
  const old = await StorageService.get('invoices', 'company-owned-sale');
  await assert.rejects(StorageService.importAll(backup({
    invoices: [{ ...old, companyId: 'other-c2' }]
  })), /بازنویسی سند قطعی/);
  assert.deepEqual(await StorageService.get('invoices', old.id), old);
});

test('A04: legitimate master data changes remain permitted for explicit recovery', async () => {
  await StorageService.clearAll();
  await StorageService.put('contacts', { id: 'cust', companyId: C, name: 'Before' });
  const before = await StorageService.get('contacts', 'cust');
  await StorageService.importAll(backup({
    contacts: [{ ...before, name: 'After' }]
  }));
  assert.equal((await StorageService.get('contacts', 'cust')).name, 'After');
});
