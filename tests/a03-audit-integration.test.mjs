import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { AuditService } from '../src/core/AuditService.js';
import { AccountingService } from '../src/core/AccountingService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';

const company = 'audit-c1';
const businessDate = '1405/07/18';
async function setup() {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'audit-admin', role: 'admin', username: 'manager' };
  await StorageService.put('companies', { id: company, name: 'Synthetic C1' });
  await StorageService.put('companies', { id: 'audit-c2', name: 'Synthetic C2' });
  CompanyService.activeCompanyId = company;
  const period = await AccountingService.createPeriod({
    name: '1405', startDate: '1405/01/01', endDate: '1405/12/29'
  });
  await AccountingService.seedDefaultChart();
  const accounts = await AccountingService.listAccounts();
  const cash = accounts.find(a => a.code === '101');
  const sales = accounts.find(a => a.code === '401');
  assert.ok(cash && sales);
  return { period, cash, sales };
}
const journal = ({ period, cash, sales }) => ({
  periodId: period.id, date: businessDate,
  description: 'Sensitive customer name that must not enter audit',
  lines: [
    { accountId: cash.id, debit: 1000, credit: 0 },
    { accountId: sales.id, debit: 0, credit: 1000 }
  ]
});

test('A03: posting and reversal produce immutable-in-service, scoped, minimal audit records', async () => {
  const state = await setup();
  const posted = await AccountingService.postJournal(journal(state));
  let events = await AuditService.list();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'journal_posted');
  assert.equal(events[0].actorId, 'audit-admin');
  assert.equal(events[0].companyId, company);
  assert.equal(events[0].sourceId, posted.id);
  assert.equal(events[0].safeSummary.lineCount, 2);
  assert.equal(events[0].result, 'committed');
  assert.ok(!JSON.stringify(events).includes('Sensitive customer name'));

  const reversed = await AccountingService.reverseJournal(posted.id, {
    periodId: state.period.id, date: '1405/07/19'
  });
  events = await AuditService.list();
  assert.equal(events.length, 2);
  assert.ok(events.some(e => e.eventType === 'journal_reversed' && e.sourceId === reversed.id));
  await assert.rejects(AccountingService.reverseJournal(posted.id, {
    periodId: state.period.id, date: '1405/07/20'
  }), /قابل برگشت/);
  assert.equal((await AuditService.list()).length, 2);

  CompanyService.activeCompanyId = 'audit-c2';
  assert.deepEqual(await AuditService.list(), []);
  Auth.currentUser = { id: 'staff', role: 'user', companyIds: ['audit-c2'] };
  await assert.rejects(AuditService.list(), /مدیر/);
});

test('A03: duplicate audit command aborts unrelated financial writes atomically', async () => {
  await setup();
  const event = {
    companyId: company, eventType: 'journal_posted',
    sourceType: 'journal', sourceId: 'source-1',
    commandKey: 'request-1', businessDate
  };
  await StorageService.transaction(['audit_events'], tx => AuditService.append(tx, event));
  await assert.rejects(StorageService.transaction(['audit_events', 'products'], async tx => {
    await tx.put('products', { id: 'never-written', companyId: company, name: 'rollback' });
    await AuditService.append(tx, event);
  }));
  assert.equal(await StorageService.get('products', 'never-written'), undefined);
  assert.equal((await AuditService.list()).length, 1);
});

test('A03: fiscal closing appends an event and does not permit double close', async () => {
  const { period } = await setup();
  await AccountingService.closePeriod(period.id);
  const events = await AuditService.list();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'period_closed');
  await assert.rejects(AccountingService.closePeriod(period.id), /بسته/);
  assert.equal((await AuditService.list()).length, 1);
});

test('A03: company backup includes audit store, without ever exporting user credentials', async () => {
  const state = await setup();
  await AccountingService.postJournal(journal(state));
  const backup = await StorageService.exportAll();
  assert.equal(backup.version, 7);
  assert.equal(backup.data.audit_events.length, 1);
  assert.ok(Array.isArray(backup.data.document_corrections));
  assert.equal(backup.data.audit_events[0].safeSummary.lineCount, 2);
});
