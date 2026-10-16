import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';
import { restoreCompanyBackup } from '../src/core/CompanyBackupService.js';

const C = 'references-c1';
const opts = { companyId: C, userId: 'manager', mode: 'merge' };

async function reset() {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'manager', username: 'manager', role: 'admin' };
  await StorageService.put('companies', { id: C, name: 'Example company' });
  await StorageService.put('companies', { id: 'references-c2', name: 'Foreign company' });
}

test('A04: a posted invoice without a journal is rejected before any import writes', async () => {
  await reset();
  await assert.rejects(restoreCompanyBackup({
    contacts: [{ id: 'should-roll-back', companyId: C, name: 'Must not persist' }],
    invoices: [{ id: 'fake-posted', companyId: C, financePosted: true,
      kind: 'sale', journalId: 'no-journal', grandTotal: 1000 }]
  }, opts), /ارجاع دفتر کل/);
  assert.equal(await StorageService.get('contacts', 'should-roll-back'), undefined);
  assert.equal(await StorageService.get('invoices', 'fake-posted'), undefined);
  assert.equal((await StorageService.getAll('audit_events')).length, 0);
});

test('A04: a posted invoice cannot cite another company or another source journal', async () => {
  await reset();
  await StorageService.put('journal_entries', {
    id: 'foreign-journal', companyId: 'references-c2',
    status: 'posted', sourceType: 'invoice', sourceId: 'fake-posted'
  });
  await StorageService.put('journal_entries', {
    id: 'wrong-source', companyId: C,
    status: 'posted', sourceType: 'invoice', sourceId: 'unrelated-invoice'
  });
  const row = { id: 'fake-posted', companyId: C, financePosted: true,
    kind: 'sale', journalId: 'foreign-journal', grandTotal: 100 };
  await assert.rejects(restoreCompanyBackup({ invoices: [row] }, opts),
    /ارجاع دفتر کل/);
  await assert.rejects(restoreCompanyBackup({
    invoices: [{ ...row, journalId: 'wrong-source' }]
  }, opts), /ارجاع دفتر کل/);
  assert.equal(await StorageService.get('invoices', 'fake-posted'), undefined);
});

test('A04: a complete posted invoice referencing the correct journal may be recovered', async () => {
  await reset();
  await StorageService.put('journal_entries', {
    id: 'verified-source', companyId: C, status: 'posted',
    sourceType: 'invoice', sourceId: 'valid-invoice'
  });
  const restored = await restoreCompanyBackup({
    invoices: [{ id: 'valid-invoice', companyId: C,
      financePosted: true, journalId: 'verified-source',
      kind: 'sale', grandTotal: 1000 }]
  }, opts);
  assert.equal(restored.added, 1);
  assert.equal((await StorageService.get('invoices', 'valid-invoice')).journalId,
    'verified-source');
  assert.equal((await StorageService.getAll('audit_events')).length, 1);
});

test('A04: posted treasury transactions cannot cite a ledger event from another command', async () => {
  await reset();
  await StorageService.put('journal_entries', {
    id: 'posted-treasury', companyId: C, status: 'posted',
    sourceType: 'treasury', sourceId: 'other-payment'
  });
  const item = { id: 'payment-1', companyId: C, recordType: 'transaction',
    financePosted: true, type: 'receipt', journalId: 'posted-treasury', amount: 100 };
  await assert.rejects(restoreCompanyBackup({ treasury: [item] }, opts),
    /به عملیات دیگری/);
  assert.equal(await StorageService.get('treasury', 'payment-1'), undefined);

  await StorageService.put('journal_entries', {
    id: 'right-treasury', companyId: C, status: 'posted',
    sourceType: 'treasury', sourceId: 'payment-1'
  });
  const result = await restoreCompanyBackup({
    treasury: [{ ...item, journalId: 'right-treasury' }]
  }, opts);
  assert.equal(result.added, 1);
  assert.equal((await StorageService.get('treasury', 'payment-1')).journalId, 'right-treasury');
});

test('A04: cheque status restore cannot reference a foreign or missing status journal', async () => {
  await reset();
  await StorageService.put('journal_entries', {
    id: 'cheque-created', companyId: C, status: 'posted',
    sourceType: 'cheque', sourceId: 'ch-1'
  });
  const row = { id: 'ch-1', companyId: C, financePosted: true,
    journalId: 'cheque-created', status: 'cleared', statusVersion: 2 };
  await assert.rejects(restoreCompanyBackup({ cheques: [row] }, opts),
    /شناسه سند تغییر وضعیت/);
  await StorageService.put('journal_entries', {
    id: 'status-from-other', companyId: 'references-c2',
    status: 'posted', sourceType: 'cheque_status', sourceId: 'ch-1'
  });
  await assert.rejects(restoreCompanyBackup({
    cheques: [{ ...row, statusJournalId: 'status-from-other' }]
  }, opts), /ارجاع سند تغییر وضعیت/);
  assert.equal(await StorageService.get('cheques', 'ch-1'), undefined);
});
