import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { AccountingService } from '../src/core/AccountingService.js';
import { AuditService } from '../src/core/AuditService.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { Auth } from '../src/core/Auth.js';

async function setup() {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'manager-a05', role: 'admin', username: 'manager' };
  await StorageService.put('companies', { id: 'a05', name: 'Test A05' });
  CompanyService.activeCompanyId = 'a05';
  const period = await AccountingService.createPeriod({
    name: '1405', startDate: '1405/01/01', endDate: '1405/12/29'
  });
  await AccountingService.seedDefaultChart();
  const accounts = await AccountingService.listAccounts();
  return { period, debit: accounts.find(x => x.code === '102'),
    credit: accounts.find(x => x.code === '401') };
}

test('A05: a historically unbalanced posted journal must block fiscal close', async () => {
  const { period, debit, credit } = await setup();
  await StorageService.put('journal_entries', {
    id: 'corrupt-posted', companyId: 'a05', periodId: period.id,
    date: '1405/08/20', status: 'posted'
  });
  await StorageService.put('journal_lines', {
    id: 'line-1', companyId: 'a05', journalId: 'corrupt-posted',
    accountId: debit.id, debit: 100, credit: 0
  });
  await StorageService.put('journal_lines', {
    id: 'line-2', companyId: 'a05', journalId: 'corrupt-posted',
    accountId: credit.id, debit: 0, credit: 90
  });
  await assert.rejects(AccountingService.closePeriod(period.id), /تراز|سطرها/);
  assert.equal((await StorageService.get('fiscal_periods', period.id)).closed, false);
  assert.ok(!(await AuditService.list()).some(e => e.eventType === 'period_closed'));

  await StorageService.put('journal_lines', {
    id: 'line-2', companyId: 'a05', journalId: 'corrupt-posted',
    accountId: credit.id, debit: 0, credit: 100
  });
  await AccountingService.closePeriod(period.id);
  assert.equal((await StorageService.get('fiscal_periods', period.id)).closed, true);
  assert.equal((await AuditService.list()).filter(e => e.eventType === 'period_closed').length, 1);
});

test('A05: an open stocktake blocks period close without changing the period', async () => {
  const { period } = await setup();
  await StorageService.put('stocktakes', {
    id: 'stocktake-draft', companyId: 'a05', warehouseId: 'wh',
    status: 'draft'
  });
  await assert.rejects(AccountingService.closePeriod(period.id), /انبارگردانی باز/);
  assert.equal((await StorageService.get('fiscal_periods', period.id)).closed, false);
  assert.ok(!(await AuditService.list()).some(e => e.eventType === 'period_closed'));
  await StorageService.delete('stocktakes', 'stocktake-draft');
  await AccountingService.closePeriod(period.id);
  await assert.rejects(AccountingService.closePeriod(period.id), /بسته/);
});
