import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { DataScope } from '../src/core/DataScope.js';
import { SettingsController } from '../src/controllers/SettingsController.js';
import { AccountingService as ledger } from '../src/core/AccountingService.js';
import {
  validateAccount, validateFiscalPeriod, validateJournal, validateJournalLines,
  assertJalaliDate, reversingLines
} from '../src/core/AccountingCore.mjs';

const year = { startDate: '1405/01/01', endDate: '1405/12/29' };
const select = companyId => { CompanyService.activeCompanyId = companyId; };
const entries = async store => StorageService.getAll(store);
const reset = async () => {
  await StorageService.clearAll();
  await StorageService.put('companies', { id: 'c1', name: 'Alpha' });
  await StorageService.put('companies', { id: 'c2', name: 'Beta' });
  Auth.currentUser = { id: 'test_admin', role: 'admin', username: 'tester' };
  select('c1');
};
const setup = async () => {
  await reset();
  const period = await ledger.createPeriod({ name: 'سال ۱۴۰۵', ...year });
  await ledger.seedDefaultChart();
  const accounts = await ledger.listAccounts();
  return { period, cash: accounts.find(a => a.code === '101'), sales: accounts.find(a => a.code === '401') };
};
const balanced = (period, cash, sales, sourceId) => ({
  periodId: period.id, date: '1405/07/18', description: 'فروش تست',
  ...(sourceId ? { sourceType: 'test_invoice', sourceId } : {}),
  lines: [
    { accountId: cash.id, debit: 10000, credit: 0 },
    { accountId: sales.id, debit: 0, credit: 10000 }
  ]
});

test('core: Jalali dates and fiscal period boundaries', () => {
  assert.equal(assertJalaliDate('1405/07/18'), '1405/07/18');
  assert.throws(() => assertJalaliDate('1405/07/31'));
  assert.throws(() => assertJalaliDate('1405/12/30'));
  assert.equal(assertJalaliDate('1403/12/30'), '1403/12/30');
  assert.throws(() => assertJalaliDate('1405/7/18'));
  assert.throws(() => validateFiscalPeriod({ companyId: 'c1', startDate: '1405/10/01', endDate: '1405/01/01' }));
  assert.throws(() => validateFiscalPeriod({ companyId: 'c1', ...year }, [{ id: 'p', companyId: 'c1', ...year }]));
  assert.doesNotThrow(() => validateFiscalPeriod({ companyId: 'c2', ...year }, [{ id: 'p', companyId: 'c1', ...year }]));
});

test('core: reject incorrect accounts, posting to parent and amount overflow', () => {
  const list = [
    { id: 'root', companyId: 'c1', code: '1', level: 'group', type: 'asset', name: 'assets' },
    { id: 'general', companyId: 'c1', code: '101', parentCode: '1', level: 'general', type: 'asset', name: 'cash' },
    { id: 'sub', companyId: 'c1', code: '10101', parentCode: '101', level: 'subsidiary', type: 'asset', name: 'box' }
  ];
  assert.throws(() => validateAccount({ ...list[0], id: 'another', parentCode: '101' }, list));
  assert.throws(() => validateAccount({ id: 'x', companyId: 'c1', code: '10102', parentCode: '101', level: 'subsidiary', type: 'expense', name: 'wrong' }, list));
  assert.throws(() => validateJournalLines({ companyId: 'c1', lines: [{ accountId: 'general', debit: 10, credit: 0 }] }, list, { requireBalance: false }));
  assert.throws(() => validateJournalLines({ companyId: 'c1', lines: [{ accountId: 'sub', debit: 9007199254740991, credit: 0 }, { accountId: 'sub', debit: 1, credit: 0 }] }, list));
  assert.deepEqual(reversingLines([{ accountId: 'x', debit: 4, credit: 0 }, { accountId: 'y', debit: 0, credit: 4 }]).map(l => [l.debit, l.credit]), [[0, 4], [4, 0]]);
});

test('integration: chart seed is idempotent; parent relationships and company isolation', async () => {
  await reset();
  assert.equal((await ledger.seedDefaultChart()).added, 19);
  assert.equal((await ledger.seedDefaultChart()).added, 0);
  assert.equal((await ledger.listAccounts()).length, 19);
  await assert.rejects(ledger.addAccount({ code: '101', name: 'duplicate', type: 'asset', level: 'general', parentCode: '1' }));
  const general = await ledger.addAccount({ code: '107', name: 'دیگر دارایی', type: 'asset', level: 'general', parentCode: '1' });
  assert.equal(general.companyId, 'c1');
  select('c2');
  assert.equal((await ledger.listAccounts()).length, 0);
  assert.equal((await ledger.seedDefaultChart()).added, 19);
});

test('integration: overlapping periods rejected but same calendar interval is allowed in another company', async () => {
  await reset();
  const p = await ledger.createPeriod({ name: 'سال', ...year });
  assert.ok(p.id);
  await assert.rejects(ledger.createPeriod({ name: 'همپوشان', startDate: '1405/10/01', endDate: '1406/01/01' }), /هم‌پوشانی/);
  await ledger.createPeriod({ name: 'بعدی', startDate: '1406/01/01', endDate: '1406/12/29' });
  select('c2');
  const separate = await ledger.createPeriod({ name: 'شرکت دوم', ...year });
  assert.equal(separate.companyId, 'c2');
});

test('integration: posting account cannot gain a child after financial movements', async () => {
  const { period, cash, sales } = await setup();
  await ledger.postJournal(balanced(period, cash, sales));
  await assert.rejects(ledger.addAccount({
    code: '10101', name: 'صندوق زیرمجموعه', level: 'subsidiary', type: 'asset', parentCode: cash.code
  }), /گردش مالی/);
  assert.equal((await ledger.listAccounts()).length, 19);
});

test('integration: atomic posting, balanced trial balance and duplicate-source rejection', async () => {
  const { period, cash, sales } = await setup();
  const source = balanced(period, cash, sales, 'inv-42');
  const posted = await ledger.postJournal(source);
  assert.equal(posted.status, 'posted');
  assert.equal((await ledger.getJournal(posted.id)).lines.length, 2);
  assert.equal((await ledger.listJournals()).length, 1);
  const trial = await ledger.trialBalance({ periodId: period.id });
  assert.deepEqual(trial.totals, { debit: 10000, credit: 10000 });
  assert.equal(trial.rows.length, 2);
  await assert.rejects(ledger.postJournal(source), /تکرار|ثبت دوباره/);
  assert.equal((await entries('journal_entries')).length, 1);
  assert.equal((await entries('journal_lines')).length, 2);
});

test('integration: posting failures roll back all journal tables', async () => {
  const { period, cash, sales } = await setup();
  const invalid = balanced(period, cash, sales);
  invalid.lines[1].credit = 9000;
  await assert.rejects(ledger.postJournal(invalid), /تراز نیست/);
  assert.equal((await entries('journal_entries')).length, 0);
  assert.equal((await entries('journal_lines')).length, 0);
  invalid.lines[1].credit = 10000;
  invalid.lines[1].accountId = 'other-company-account';
  await assert.rejects(ledger.postJournal(invalid), /شرکت دیگر|غیرمجاز/);
  assert.equal((await entries('journal_entries')).length, 0);
});

test('integration: draft may be unbalanced; posting draft requires balance', async () => {
  const { period, cash } = await setup();
  const draft = await ledger.saveDraftJournal({
    periodId: period.id, date: '1405/04/22',
    lines: [{ accountId: cash.id, debit: 100, credit: 0 }]
  });
  assert.equal(draft.status, 'draft');
  await assert.rejects(ledger.postDraftJournal(draft.id), /سطرها|تراز نیست|نامعتبر/);
  assert.equal((await ledger.getJournal(draft.id)).status, 'draft');
  assert.equal((await ledger.trialBalance()).rows.length, 0);
  await assert.rejects(ledger.closePeriod(period.id), /پیش‌نویس/);
});

test('integration: editing and finalizing a draft is atomic; failed finalization leaves draft unchanged', async () => {
  const { period, cash, sales } = await setup();
  const draft = await ledger.saveDraftJournal({
    periodId: period.id, date: '1405/07/18',
    lines: [{ accountId: cash.id, debit: 1000, credit: 0 }]
  });
  const invalid = {
    periodId: period.id, date: '1405/07/19',
    lines: [{ accountId: cash.id, debit: 2000, credit: 0 }, { accountId: sales.id, debit: 0, credit: 1000 }]
  };
  await assert.rejects(ledger.updateDraftJournal(draft.id, invalid, { post: true }), /تراز نیست/);
  const original = await ledger.getJournal(draft.id);
  assert.equal(original.status, 'draft');
  assert.equal(original.date, '1405/07/18');
  assert.equal(original.lines.length, 1);
  await ledger.updateDraftJournal(draft.id, { ...invalid, lines: [
    { accountId: cash.id, debit: 2000, credit: 0 },
    { accountId: sales.id, debit: 0, credit: 2000 }
  ] }, { post: true });
  assert.equal((await ledger.getJournal(draft.id)).status, 'posted');
  assert.equal((await ledger.getJournal(draft.id)).lines.length, 2);
  await assert.rejects(ledger.updateDraftJournal(draft.id, invalid), /پیش‌نویس/);
  assert.equal((await entries('journal_lines')).length, 2);
});

test('integration: reversal is immutable, balanced and cannot be repeated', async () => {
  const { period, cash, sales } = await setup();
  const original = await ledger.postJournal(balanced(period, cash, sales));
  const reversed = await ledger.reverseJournal(original.id, { periodId: period.id, date: '1405/07/19' });
  assert.equal(reversed.reversalOfId, original.id);
  assert.equal((await ledger.getJournal(original.id)).reversedById, reversed.id);
  const rows = (await ledger.getJournal(reversed.id)).lines;
  assert.deepEqual(rows.map(r => [r.debit, r.credit]), [[0, 10000], [10000, 0]]);
  assert.deepEqual((await ledger.trialBalance()).totals, { debit: 20000, credit: 20000 });
  assert.equal((await ledger.trialBalance()).rows.every(r => r.balance === 0), true);
  await assert.rejects(ledger.reverseJournal(original.id, { periodId: period.id, date: '1405/07/20' }), /قابل برگشت نیست/);
  assert.equal((await entries('journal_entries')).length, 2);
});

test('integration: draft removal is atomic; posted journals are immutable', async () => {
  const { period, cash, sales } = await setup();
  const draft = await ledger.saveDraftJournal({
    periodId: period.id, date: '1405/07/18',
    lines: [{ accountId: cash.id, debit: 8000, credit: 0 }]
  });
  await ledger.discardDraftJournal(draft.id);
  assert.equal((await entries('journal_entries')).length, 0);
  assert.equal((await entries('journal_lines')).length, 0);
  const posted = await ledger.postJournal(balanced(period, cash, sales));
  await assert.rejects(ledger.discardDraftJournal(posted.id), /پیش‌نویس/);
  assert.equal((await entries('journal_entries')).length, 1);
});

test('integration: reversal works when a previously posted account was deactivated', async () => {
  const { period, cash, sales } = await setup();
  const posted = await ledger.postJournal(balanced(period, cash, sales));
  await StorageService.put('account_chart', { ...cash, active: false });
  await assert.rejects(ledger.postJournal(balanced(period, cash, sales)), /غیرفعال/);
  const reversed = await ledger.reverseJournal(posted.id, { periodId: period.id, date: '1405/07/20' });
  assert.equal(reversed.status, 'posted');
  assert.equal((await ledger.trialBalance()).rows.every(r => r.balance === 0), true);
});

test('integration: closing period prevents posting and reversing; company data cannot cross', async () => {
  const { period, cash, sales } = await setup();
  const j = await ledger.postJournal(balanced(period, cash, sales));
  await ledger.closePeriod(period.id);
  await assert.rejects(ledger.postJournal(balanced(period, cash, sales)), /بسته/);
  await assert.rejects(ledger.reverseJournal(j.id, { periodId: period.id, date: '1405/07/19' }), /بسته/);
  select('c2');
  assert.equal((await ledger.listJournals()).length, 0);
  assert.equal((await DataScope.list('journal_entries')).length, 0);
  await assert.rejects(ledger.getJournal(j.id), /این شرکت/);
  await assert.rejects(ledger.reverseJournal(j.id, { periodId: period.id, date: '1405/07/19' }), /قابل برگشت نیست/);
});

test('integration: Settings backup contains V2 ledger and restores it atomically', async () => {
  const { period, cash, sales } = await setup();
  await ledger.postJournal(balanced(period, cash, sales, 'restore-test'));
  await StorageService.put('users', { id: 'some-user', username: 'demo', pwHash: 'test-hash', pwSalt: 'test-salt' });
  await StorageService.put('account_chart', { id: 'foreign-account', companyId: 'c2', code: '1', name: 'Foreign assets', type: 'asset', level: 'group' });
  const backup = await SettingsController.exportBackup();
  assert.equal(backup.data.users[0].pwHash, undefined);
  assert.equal((await StorageService.get('users', 'some-user')).pwHash, 'test-hash');
  assert.equal(backup.data.account_chart.length, 19);
  assert.equal(backup.data.fiscal_periods.length, 1);
  assert.equal(backup.data.journal_entries.length, 1);
  assert.equal(backup.data.journal_lines.length, 2);
  await reset();
  const first = await SettingsController.importBackup(backup, { mode: 'merge' });
  assert.ok(first.added >= 17);
  assert.deepEqual((await ledger.trialBalance()).totals, { debit: 10000, credit: 10000 });
  const again = await SettingsController.importBackup(backup, { mode: 'merge' });
  assert.ok(again.skipped >= 17);
  assert.equal((await ledger.listJournals()).length, 1);
});

test('integration: broken V2 restore rolls back all stores and rejects cross-company ID collisions', async () => {
  const { period, cash, sales } = await setup();
  await ledger.postJournal(balanced(period, cash, sales));
  const backup = await SettingsController.exportBackup();
  await reset();
  const broken = structuredClone(backup);
  broken.data.journal_lines[0].accountId = 'missing-account';
  await assert.rejects(SettingsController.importBackup(broken), /حساب|ناموجود/);
  assert.equal((await entries('account_chart')).length, 0);
  assert.equal((await entries('journal_entries')).length, 0);
  select('c2');
  await StorageService.put('account_chart', { id: backup.data.account_chart[0].id,
    companyId: 'c2', code: '1', name: 'Foreign', type: 'asset', level: 'group' });
  select('c1');
  await assert.rejects(SettingsController.importBackup(backup), /شرکت دیگر/);
  assert.equal((await ledger.listAccounts()).length, 0);
  assert.equal((await entries('journal_entries')).length, 0);
});

test('integration: backup export and restore preserves accounting records without user credentials', async () => {
  const { period, cash, sales } = await setup();
  await ledger.postJournal(balanced(period, cash, sales));
  const snapshot = await StorageService.exportAll();
  assert.equal(snapshot.data.journal_entries.length, 1);
  assert.equal(snapshot.data.journal_lines.length, 2);
  assert.equal(snapshot.data.account_chart.length, 19);
  await StorageService.clearAll();
  await StorageService.importAll(snapshot);
  select('c1');
  assert.equal((await ledger.getJournal(snapshot.data.journal_entries[0].id)).lines.length, 2);
  assert.deepEqual((await ledger.trialBalance()).totals, { debit: 10000, credit: 10000 });
});

test('role security: normal user cannot alter chart, periods, manual journals or restore backup',async()=>{
 const {period,cash,sales}=await setup();
 const backup=await SettingsController.exportBackup();
 Auth.currentUser={id:'limited-user',role:'user',username:'cashier',companyIds:['c1']};
 await assert.rejects(ledger.addAccount({code:'900',name:'unauthorized',level:'group',type:'asset'}),/مدیر/);
 await assert.rejects(ledger.createPeriod({name:'unauthorized',...year}),/مدیر/);
 await assert.rejects(ledger.seedDefaultChart(),/مدیر/);
 await assert.rejects(ledger.postJournal(balanced(period,cash,sales)),/مدیر/);
 await assert.rejects(SettingsController.importBackup(backup),/مدیر/);
 assert.equal((await ledger.listJournals()).length,0);
});
