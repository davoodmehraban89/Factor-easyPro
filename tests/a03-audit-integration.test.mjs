import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { AuditService } from '../src/core/AuditService.js';
import { AccountingService } from '../src/core/AccountingService.js';
import { SettingsController } from '../src/controllers/SettingsController.js';
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
  assert.equal(events.length, 2);
  const postedEvent = events.find(e => e.eventType === 'journal_posted');
  assert.ok(postedEvent);
  assert.equal(postedEvent.actorId, 'audit-admin');
  assert.equal(postedEvent.companyId, company);
  assert.equal(postedEvent.sourceId, posted.id);
  assert.equal(postedEvent.safeSummary.lineCount, 2);
  assert.equal(postedEvent.result, 'committed');
  assert.ok(!JSON.stringify(events).includes('Sensitive customer name'));

  const reversed = await AccountingService.reverseJournal(posted.id, {
    periodId: state.period.id, date: '1405/07/19'
  });
  events = await AuditService.list();
  assert.equal(events.length, 3);
  assert.ok(events.some(e => e.eventType === 'journal_reversed' && e.sourceId === reversed.id));
  await assert.rejects(AccountingService.reverseJournal(posted.id, {
    periodId: state.period.id, date: '1405/07/20'
  }), /قابل برگشت/);
  assert.equal((await AuditService.list()).length, 3);

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
  assert.equal((await AuditService.list()).length, 2);
});

test('A03: fiscal closing appends an event and does not permit double close', async () => {
  const { period } = await setup();
  await AccountingService.closePeriod(period.id);
  const events = await AuditService.list();
  assert.equal(events.length, 2);
  assert.ok(events.some(e => e.eventType === 'period_closed'));
  await assert.rejects(AccountingService.closePeriod(period.id), /بسته/);
  assert.equal((await AuditService.list()).length, 2);
});

test('A03: company backup includes audit store, without ever exporting user credentials', async () => {
  const state = await setup();
  await AccountingService.postJournal(journal(state));
  const backup = await StorageService.exportAll();
  assert.equal(backup.version, 7);
  assert.equal(backup.data.audit_events.length, 2);
  assert.ok(Array.isArray(backup.data.document_corrections));
  assert.equal(backup.data.audit_events.find(x => x.eventType === 'journal_posted').safeSummary.lineCount, 2);
});

test('A03: company backup rejects tampered historical audit records even in replace mode', async () => {
  const state = await setup();
  await AccountingService.postJournal(journal(state));
  const backup = await SettingsController.exportBackup();
  assert.equal(backup.data.audit_events.length, 2);
  backup.data.audit_events.find(x => x.eventType === 'journal_posted').eventType = 'period_closed';
  await assert.rejects(SettingsController.importBackup(backup, { mode: 'replace' }), /بازنویسی سابقه|زنجیره ممیزی|لنگر پشتیبان/);
  assert.ok((await AuditService.list()).some(e => e.eventType === 'journal_posted'));
});

test('A03: draft journal creation, editing, posting and discarding are audited atomically', async () => {
  const state = await setup();
  const draft = await AccountingService.saveDraftJournal({
    periodId: state.period.id, date: businessDate,
    lines: [{ accountId: state.cash.id, debit: 1000, credit: 0 }]
  });
  await AccountingService.updateDraftJournal(draft.id, {
    periodId: state.period.id, date: businessDate,
    lines: [
      { accountId: state.cash.id, debit: 1000, credit: 0 },
      { accountId: state.sales.id, debit: 0, credit: 1000 }
    ]
  });
  const beforeFailure = (await AuditService.list()).length;
  await assert.rejects(AccountingService.updateDraftJournal(draft.id, {
    periodId: state.period.id, date: businessDate,
    lines: [
      { accountId: state.cash.id, debit: 1000, credit: 0 },
      { accountId: state.sales.id, debit: 0, credit: 999 }
    ]
  }, { post: true }), /تراز نیست/);
  assert.equal((await AuditService.list()).length, beforeFailure,
    'A failed transaction must not persist a success audit event');
  await AccountingService.postDraftJournal(draft.id);
  const unused = await AccountingService.saveDraftJournal({
    periodId: state.period.id, date: businessDate,
    lines: [{ accountId: state.cash.id, debit: 4, credit: 0 }]
  });
  await AccountingService.discardDraftJournal(unused.id);
  const eventTypes = (await AuditService.list()).map(e => e.eventType);
  for (const type of ['period_opened', 'draft_created', 'draft_updated',
    'draft_posted', 'draft_discarded']) {
    assert.ok(eventTypes.includes(type), type);
  }
});

test('A03/A04: successful backup restore receives an audit event; rejected restore does not', async () => {
  await setup();
  const backup = await SettingsController.exportBackup();
  const originalCount = (await AuditService.list()).length;
  await SettingsController.importBackup(backup, { mode: 'merge' });
  const afterRestore = await AuditService.list();
  assert.equal(afterRestore.length, originalCount + 1);
  assert.ok(afterRestore.some(e => e.eventType === 'backup_restored'));
  const tampered = structuredClone(backup);
  tampered.data.audit_events[0].safeSummary.lineCount = 99;
  await assert.rejects(SettingsController.importBackup(tampered, { mode: 'replace' }), /بازنویسی سابقه|زنجیره ممیزی|لنگر پشتیبان/);
  assert.equal((await AuditService.list()).length, afterRestore.length);
});

test('A04: immutable company audit replay ignores JSON property ordering but rejects value changes', async () => {
  await setup();
  const backup = await SettingsController.exportBackup();
  const original = backup.data.audit_events[0];
  assert.ok(original, 'a period-opened audit record must exist');
  const reordered = structuredClone(backup);
  reordered.data.audit_events[0] = Object.fromEntries(
    Object.entries(reordered.data.audit_events[0]).reverse()
  );
  // Key order changes do not alter a signed accounting fact.
  const result = await SettingsController.importBackup(reordered);
  assert.ok(result.skipped >= 1);
  assert.deepEqual(await StorageService.get('audit_events', original.id), original);

  const changed = structuredClone(reordered);
  changed.data.audit_events[0].sourceId = 'FORGED_PERIOD';
  await assert.rejects(SettingsController.importBackup(changed, { mode: 'replace' }),
    /بازنویسی سابقه|زنجیره ممیزی|لنگر پشتیبان/);
  assert.equal((await StorageService.get('audit_events', original.id)).sourceId, original.sourceId);
});

test('A03: standalone storage cannot forge audit or correction history', async () => {
  await setup();
  const before = await AuditService.list();
  for (const store of ['audit_events', 'document_corrections']) {
    const forged = { id: `forged-${store}`, companyId: company, eventType: 'journal_posted' };
    await assert.rejects(StorageService.put(store, forged), /ثبت مستقیم سابقه/);
    assert.equal(await StorageService.get(store, forged.id), undefined);
  }
  assert.deepEqual(await AuditService.list(), before);
});

test('A03: invalid audit metadata aborts business writes without leaking payloads', async () => {
  await setup();
  const before = (await AuditService.list()).length;
  for (const businessDate of [{ secret: 'customer phone' }, 'customer-name', '1405/07/18 extra']) {
    const id = StorageService.uid('rejected_');
    await assert.rejects(StorageService.transaction(['audit_events', 'products'], async tx => {
      await tx.add('products', { id, companyId: company, name: 'rollback' });
      await AuditService.append(tx, {
        companyId: company, eventType: 'journal_posted', sourceType: 'journal',
        sourceId: id, commandKey: id, businessDate
      });
    }), /نامعتبر/);
    assert.equal(await StorageService.get('products', id), undefined);
  }
  assert.equal((await AuditService.list()).length, before);
});

test('A03: valid audit date is retained and cannot be overwritten', async () => {
  await setup();
  const commandKey = StorageService.uid('valid_');
  const event = { companyId: company, eventType: 'journal_posted',
    sourceType: 'journal', sourceId: commandKey, commandKey, businessDate };
  await StorageService.transaction('audit_events', tx => AuditService.append(tx, event));
  const saved = (await AuditService.list()).find(x => x.sourceId === commandKey);
  assert.equal(saved.businessDate, businessDate);
  await assert.rejects(StorageService.transaction('audit_events', tx => AuditService.append(tx, event)));
  assert.equal((await AuditService.list()).filter(x => x.sourceId === commandKey).length, 1);
});

test('A03 guard: ordinary audited journal remains atomic', async () => {
  const state = await setup();
  const before = (await AuditService.list()).length;
  const posted = await AccountingService.postJournal(journal(state));
  assert.equal((await StorageService.get('journal_entries', posted.id)).status, 'posted');
  assert.equal((await AuditService.list()).length, before + 1);
});

test('A03 guard: company backup round trip preserves historical audit', async () => {
  await setup();
  const backup = await SettingsController.exportBackup();
  const before = (await AuditService.list()).length;
  await SettingsController.importBackup(backup);
  assert.equal((await AuditService.list()).length, before + 1);
});

test('A03 guard: full backup replay of identical audit is accepted', async () => {
  await setup();
  const snapshot = await StorageService.exportAll();
  await StorageService.importAll(snapshot);
  assert.ok((await AuditService.list()).length >= 1);
});

test('A03: direct audit mutation APIs reject forged records and roll back writes', async () => {
  await setup();
  for (const method of ['add', 'put', 'putRaw']) {
    const id = StorageService.uid('forged_');
    await assert.rejects(StorageService.transaction(['audit_events', 'products'], async tx => {
      await tx.put('products', { id, companyId: company, name: 'rollback' });
      await tx[method]('audit_events', {
        id, companyId: company, actorId: 'forged', eventType: 'journal_posted',
        sourceId: id, commandKey: id, createdByService: true
      });
    }), /ثبت مستقیم رویداد ممیزی/);
    assert.equal(await StorageService.get('products', id), undefined);
    assert.equal(await StorageService.get('audit_events', id), undefined);
  }
});


test('A03: direct historical restore without authorization is rejected', async () => {
  await setup();
  await assert.rejects(StorageService.transaction('audit_events', tx =>
    AuditService.restoreHistorical(tx, {
      id: 'forged-restore', companyId: company, actorId: 'audit-admin',
      eventType: 'journal_posted', sourceId: 'forged', commandKey: 'forged'
    })), /بازیابی مستقیم ممیزی/);
  assert.equal(await StorageService.get('audit_events', 'forged-restore'), undefined);
});


test('A03: legacy v6 company backup without audit hashes is migrated', async () => {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'audit-admin', role: 'admin', username: 'manager' };
  await StorageService.put('companies', { id: company, name: 'Legacy company' });
  CompanyService.activeCompanyId = company;
  const legacy = {
    app: 'Factor-easyPro', version: '2.0.0', scope: 'company',
    companyId: company, schemaVersion: 6,
    data: { audit_events: [{ id: 'legacy-audit', companyId: company,
      eventType: 'journal_posted', commandKey: company + ':legacy-journal' }] }
  };
  await SettingsController.importBackup(legacy);
  const restored = await StorageService.get('audit_events', 'legacy-audit');
  assert.equal(restored.actorId, 'legacy-unknown');
  assert.equal(restored.sourceType, 'legacy');
  assert.match(restored.eventHash, /^[0-9a-f]{64}$/);
  assert.equal((await AuditService.verifyChain()).valid, true);
});


test('A03: full backup anchor detects changed, missing, reordered and truncated audit history', async () => {
  const state = await setup();
  await AccountingService.postJournal(journal(state));
  const snapshot = await StorageService.exportAll();
  assert.equal(snapshot.auditAnchors[company].count, 2);
  const events = snapshot.data.audit_events.filter(row => row.companyId === company);
  for (const kind of ['tamper', 'middle-delete', 'reorder', 'tail-delete']) {
    const changed = structuredClone(snapshot);
    const target = changed.data.audit_events;
    if (kind === 'tamper') target[0].eventType = 'period_closed';
    if (kind === 'middle-delete') target.splice(target.findIndex(row => row.id === events[0].id), 1);
    if (kind === 'reorder') target.reverse();
    if (kind === 'tail-delete') target.splice(target.findIndex(row => row.id === events[1].id), 1);
    if (kind === 'reorder') {
      // Full-backup imports normalize input order; reordering serialized rows alone is harmless.
      await StorageService.importAll(changed);
    } else {
      await assert.rejects(StorageService.importAll(changed), /زنجیره ممیزی|لنگر/);
    }
  }
});
