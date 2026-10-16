import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { OpeningBalanceService } from '../src/core/OpeningBalanceService.js';
import { AccountingService } from '../src/core/AccountingService.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { Auth } from '../src/core/Auth.js';
import { AuditService } from '../src/core/AuditService.js';

const C = 'opening-c1';
const mkDate = '1405/01/01';

async function setup() {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'opening-admin', role: 'admin', username: 'manager' };
  await StorageService.put('companies', { id: C, name: 'Synthetic accounting company' });
  await StorageService.put('companies', { id: 'opening-c2', name: 'Other company' });
  CompanyService.activeCompanyId = C;
  const period = await AccountingService.createPeriod({
    name: '1405', startDate: mkDate, endDate: '1405/12/29'
  });
  await AccountingService.seedDefaultChart();
  const chart = await AccountingService.listAccounts();
  const byCode = code => {
    const account = chart.find(row => row.code === code);
    assert.ok(account, 'missing chart account ' + code);
    return account.id;
  };
  await StorageService.put('contacts', { id: 'c1-contact', companyId: C, name: 'Example customer' });
  await StorageService.put('products', { id: 'c1-stock', companyId: C, name: 'Example product', trackInventory: true });
  await StorageService.put('warehouses', { id: 'c1-warehouse', companyId: C, name: 'Example warehouse' });
  await StorageService.put('treasury', {
    id: 'c1-cash', companyId: C, name: 'Cash account', recordType: 'account', initialBalance: 100
  });
  await StorageService.put('inventory_balances', {
    id: JSON.stringify([C, 'c1-warehouse', 'c1-stock']),
    companyId: C, warehouseId: 'c1-warehouse', productId: 'c1-stock',
    quantityUnits: 1000, value: 500
  });

  return {
    period,
    input: {
      periodId: period.id, openingDate: mkDate,
      lines: [
        { accountId: byCode('102'), role: 'receivable', debit: 300, credit: 0 },
        { accountId: byCode('201'), role: 'payable', debit: 0, credit: 200 },
        { accountId: byCode('103'), role: 'inventory', debit: 500, credit: 0 },
        { accountId: byCode('101'), role: 'cash', debit: 100, credit: 0 },
        { accountId: byCode('301'), role: 'equity', debit: 0, credit: 700 }
      ],
      contacts: [{ contactId: 'c1-contact', receivable: 300, payable: 200 }],
      stock: [{ warehouseId: 'c1-warehouse', productId: 'c1-stock',
        quantityUnits: 1000, value: 500 }],
      cash: [{ accountId: 'c1-cash', balance: 100 }]
    }
  };
}

test('A02: source-scoped opening preview never modifies indexeddb', async () => {
  const { input } = await setup();
  const before = await StorageService.getAll('journal_entries');
  const report = await OpeningBalanceService.preview(input);
  assert.equal(report.readiness, 'ready-for-review');
  assert.equal(report.journal.debit, 900);
  assert.equal(report.journal.credit, 900);
  assert.equal(report.writePerformed, false);
  assert.deepEqual(await StorageService.getAll('journal_entries'), before);
  assert.equal((await AuditService.list()).filter(row => row.eventType === 'opening_posted').length, 0);
});

test('A02: controlled opening posts balanced journal, marker and audit atomically, then blocks replay', async () => {
  const { period, input } = await setup();
  await assert.rejects(OpeningBalanceService.commit(input), /تأیید صریح/);
  const posted = await OpeningBalanceService.commit(input, {
    confirmation: 'CONFIRM_OPENING_LEDGER'
  });
  assert.equal(posted.status, 'posted');
  assert.deepEqual(posted.totals, { debit: 900, credit: 900 });
  const journal = await AccountingService.getJournal(posted.journalId);
  assert.equal(journal.sourceType, 'opening_balance');
  assert.equal(journal.sourceId, period.id);
  assert.equal(journal.status, 'posted');
  assert.equal(journal.lines.length, 5);
  assert.equal(journal.debit, 900);
  assert.equal(journal.credit, 900);
  const trial = await AccountingService.trialBalance({ periodId: period.id });
  assert.deepEqual(trial.totals, { debit: 900, credit: 900 });
  const audit = await AuditService.list();
  assert.equal(audit.filter(row => row.eventType === 'opening_posted').length, 1);
  const marker = (await StorageService.getAll('settings'))
    .find(row => row.companyId === C && row.mode === 'existing-master-opening-ledger');
  assert.equal(marker.journalId, posted.journalId);
  assert.equal(marker.totals.credit, 900);
  assert.ok(!JSON.stringify(marker).includes('Example customer'));

  await assert.rejects(OpeningBalanceService.commit(input, {
    confirmation: 'CONFIRM_OPENING_LEDGER'
  }), /افتتاحیه به دلیل مغایرت/);
  assert.equal((await StorageService.getAll('journal_entries')).length, 1);
  assert.equal((await AuditService.list()).filter(row => row.eventType === 'opening_posted').length, 1);
});

test('A02: inconsistent live inventory or cash blocks posting without touching bookkeeping', async () => {
  const { input } = await setup();
  const item = await StorageService.get('inventory_balances',
    JSON.stringify([C, 'c1-warehouse', 'c1-stock']));
  await StorageService.put('inventory_balances', { ...item, value: 499 });
  const preview = await OpeningBalanceService.preview(input);
  assert.ok(preview.issues.includes('LIVE_INVENTORY_MISMATCH'));
  await assert.rejects(OpeningBalanceService.commit(input, {
    confirmation: 'CONFIRM_OPENING_LEDGER'
  }), /LIVE_INVENTORY_MISMATCH/);
  assert.equal((await StorageService.getAll('journal_entries')).length, 0);

  await StorageService.put('inventory_balances', { ...item, value: 500 });
  const cash = await StorageService.get('treasury', 'c1-cash');
  await StorageService.put('treasury', { ...cash, initialBalance: 10 });
  assert.ok((await OpeningBalanceService.preview(input)).issues.includes('LIVE_CASH_MISMATCH'));
  assert.equal((await StorageService.getAll('journal_entries')).length, 0);
});

test('A02: commercial history and foreign-company master references block opening', async () => {
  const { input } = await setup();
  await StorageService.put('invoices', {
    id: 'historic-c1-invoice', companyId: C, kind: 'sale', grandTotal: 100
  });
  assert.ok((await OpeningBalanceService.preview(input)).issues.includes('EXISTING_INVOICES'));
  await assert.rejects(OpeningBalanceService.commit(input, {
    confirmation: 'CONFIRM_OPENING_LEDGER'
  }), /EXISTING_INVOICES/);
  await StorageService.delete('invoices', 'historic-c1-invoice');
  await StorageService.put('contacts', {
    id: 'foreign-customer', companyId: 'opening-c2', name: 'Not accessible'
  });
  const foreign = structuredClone(input);
  foreign.contacts[0].contactId = 'foreign-customer';
  await assert.rejects(OpeningBalanceService.preview(foreign), /شرکت فعال/);
  assert.equal((await StorageService.getAll('journal_entries')).length, 0);
});

test('A02: failed audit insert at transaction end rolls back already inserted journal and receipt', async () => {
  const { period, input } = await setup();
  // This unique command index simulates an audit record already committed
  // outside of this posting; the late constraint failure must roll back all.
  await StorageService.put('audit_events', {
    id: 'existing-opening-key', companyId: C,
    commandKey: C + ':opening-ledger:' + period.id,
    eventType: 'opening_posted', sourceId: 'prior-event'
  });
  await assert.rejects(OpeningBalanceService.commit(input, {
    confirmation: 'CONFIRM_OPENING_LEDGER'
  }));
  assert.equal((await StorageService.getAll('journal_entries')).length, 0);
  assert.equal((await StorageService.getAll('journal_lines')).length, 0);
  assert.equal((await StorageService.getAll('settings'))
    .filter(row => row.mode === 'existing-master-opening-ledger').length, 0);
});

test('A02: ordinary users cannot preview or post ledger opening', async () => {
  const { input } = await setup();
  Auth.currentUser = { id: 'other-staff', role: 'user', username: 'staff',
    companyIds: [C] };
  await assert.rejects(OpeningBalanceService.preview(input), /فقط برای مدیر/);
  await assert.rejects(OpeningBalanceService.commit(input, {
    confirmation: 'CONFIRM_OPENING_LEDGER'
  }), /فقط برای مدیر/);
});

test('A02: an unbalanced opening preview displays its discrepancy without ledger mutations', async () => {
  const { input } = await setup();
  input.lines[4].credit = 699;
  const report = await OpeningBalanceService.preview(input);
  assert.equal(report.readiness, 'blocked');
  assert.ok(report.issues.includes('UNBALANCED_OPENING_JOURNAL'));
  assert.deepEqual(report.journal, { debit: 900, credit: 899 });
  assert.equal((await StorageService.getAll('journal_entries')).length, 0);
  await assert.rejects(OpeningBalanceService.commit(input, {
    confirmation: 'CONFIRM_OPENING_LEDGER'
  }), /UNBALANCED_OPENING_JOURNAL/);
  assert.equal((await StorageService.getAll('journal_entries')).length, 0);
});
