import appPackage from '../package.json' with { type: 'json' };
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { Auth } from '../src/core/Auth.js';
import { SettingsController } from '../src/controllers/SettingsController.js';
import { restoreCompanyBackup } from '../src/core/CompanyBackupService.js';

async function setup() {
  await StorageService.clearAll();
  Auth.currentUser = { id: 'restore-admin', role: 'admin', username: 'restore-admin' };
  await StorageService.put('companies', { id: 'c1', name: 'Company 1' });
  await StorageService.put('companies', { id: 'c2', name: 'Company 2' });
  CompanyService.activeCompanyId = 'c1';
}

test('A04: an actual IndexedDB company backup round-trip restores records', async () => {
  await setup();
  await StorageService.put('contacts', { id: 'customer-1', companyId: 'c1', name: 'Before backup' });
  await StorageService.put('contacts', { id: 'customer-2', companyId: 'c2', name: 'Other company' });
  const backup = await SettingsController.exportBackup();
  assert.equal(backup.scope, 'company');
  assert.equal(backup.schemaVersion, 7);
  await StorageService.delete('contacts', 'customer-1');
  assert.equal(await StorageService.get('contacts', 'customer-1'), undefined);
  const result = await SettingsController.importBackup(JSON.stringify(backup));
  assert.equal(result.added, 1);
  assert.equal((await StorageService.get('contacts', 'customer-1')).name, 'Before backup');
  assert.equal((await StorageService.get('contacts', 'customer-2')).name, 'Other company');
});

test('A04: malformed or future company backup envelopes never modify IndexedDB', async () => {
  await setup();
  const example = await SettingsController.exportBackup();
  const invalid = [
    { ...example, app: 'unknown' },
    { ...example, app: undefined },
    { ...example, scope: 'global' },
    { ...example, schemaVersion: 8 },
    { ...example, schemaVersion: '6' },
    { ...example, schemaVersion: undefined },
    { ...example, companyId: '' },
    { ...example, data: [] }
  ];
  for (const backup of invalid) {
    backup.data = Array.isArray(backup.data) ? backup.data : {
      ...backup.data,
      contacts: [{ id: 'should-never-exist', companyId: 'c1' }]
    };
    await assert.rejects(SettingsController.importBackup(backup), /نامعتبر/);
    assert.equal(await StorageService.get('contacts', 'should-never-exist'), undefined);
  }
});

test('A04: cross-company restore requires explicit opt-in', async () => {
  await setup();
  const backup = await SettingsController.exportBackup();
  backup.companyId = 'c2';
  backup.data.contacts = [{ id: 'from-c2', companyId: 'c2', name: 'Imported only by permission' }];
  await assert.rejects(SettingsController.importBackup(backup), /شرکت دیگری/);
  assert.equal(await StorageService.get('contacts', 'from-c2'), undefined);
  const result = await SettingsController.importBackup(backup, { allowCrossCompany: true });
  assert.equal(result.added, 1);
  assert.equal((await StorageService.get('contacts', 'from-c2')).companyId, 'c1');
});

test('A04: mixed-company or ownerless rows are rejected before any restore writes', async () => {
  await setup();
  await StorageService.put('contacts', { id: 'source-c2', companyId: 'c2', name: 'Existing foreign' });
  const beforeAudit = (await StorageService.getAll('audit_events')).length;
  const base = await SettingsController.exportBackup();
  for (const invalidRow of [
    { id: 'mixed-foreign', companyId: 'c2', name: 'Do not reassign' },
    { id: 'missing-owner', name: 'Do not guess source company' },
    null,
    ['bad-array-row']
  ]) {
    const backup = structuredClone(base);
    backup.data.contacts = [
      { id: 'valid-first', companyId: 'c1', name: 'Must not persist' },
      invalidRow
    ];
    await assert.rejects(SettingsController.importBackup(backup), /شرکت دیگری/);
    assert.equal(await StorageService.get('contacts', 'valid-first'), undefined);
    assert.equal((await StorageService.get('contacts', 'source-c2')).name, 'Existing foreign');
    assert.equal((await StorageService.getAll('audit_events')).length, beforeAudit);
  }
});

test('A04: explicit cross-company restore cannot launder mixed-origin journal records', async () => {
  await setup();
  const backup = await SettingsController.exportBackup();
  backup.companyId = 'c2';
  backup.data.contacts = [{ id: 'valid-source', companyId: 'c2', name: 'Source company' }];
  backup.data.journal_entries = [{ id: 'mixed-journal', companyId: 'c1', status: 'draft' }];
  await assert.rejects(SettingsController.importBackup(backup, { allowCrossCompany: true }), /شرکت دیگری/);
  assert.equal(await StorageService.get('contacts', 'valid-source'), undefined);
  assert.equal(await StorageService.get('journal_entries', 'mixed-journal'), undefined);
  assert.equal((await StorageService.getAll('audit_events')).length, 0);
});

test('A04: direct service restore refuses to relabel mixed source records', async () => {
  await setup();
  const rows = [
    { id: 'new-same-company', companyId: 'c1', name: 'Must not persist' },
    { id: 'new-foreign-company', companyId: 'c2', name: 'Must not retarget' }
  ];
  await assert.rejects(restoreCompanyBackup({ contacts: rows },
    { companyId: 'c1', userId: 'restore-admin' }), /شرکت دیگری/);
  assert.equal(await StorageService.get('contacts', 'new-same-company'), undefined);
  assert.equal(await StorageService.get('contacts', 'new-foreign-company'), undefined);
  assert.equal((await StorageService.getAll('audit_events')).length, 0);
  await assert.rejects(restoreCompanyBackup({ products: [
    { id: 'ownerless', name: 'Do not guess' }
  ] }, { companyId: 'c1', userId: 'restore-admin' }), /شرکت دیگری/);
  assert.equal(await StorageService.get('products', 'ownerless'), undefined);
});

test('A04: company backup rejects duplicate IDs before any database writes', async () => {
  await setup();
  const backup = await SettingsController.exportBackup();
  backup.data.contacts = [
    { id: 'duplicate', companyId: 'c1', name: 'first' },
    { id: 'duplicate', companyId: 'c1', name: 'second' }
  ];
  await assert.rejects(SettingsController.importBackup(backup), /شناسه تکراری/);
  assert.equal(await StorageService.get('contacts', 'duplicate'), undefined);
});

test('A04: a collision with another company rolls back earlier writes atomically', async () => {
  await setup();
  await StorageService.put('contacts', { id: 'foreign-id', companyId: 'c2', name: 'Protected' });
  const backup = await SettingsController.exportBackup();
  backup.data.contacts = [
    { id: 'new-first', companyId: 'c1', name: 'must rollback' },
    { id: 'foreign-id', companyId: 'c1', name: 'must not overwrite' }
  ];
  await assert.rejects(SettingsController.importBackup(backup), /شرکت دیگر/);
  assert.equal(await StorageService.get('contacts', 'new-first'), undefined);
  assert.equal((await StorageService.get('contacts', 'foreign-id')).name, 'Protected');
});

test('A04: full storage snapshot restores users without accepting backup credentials', async () => {
  await setup();
  await StorageService.put('users', { id: 'local-user', username: 'local', role: 'user', pwHash: 'LOCAL_HASH', pwSalt: 'LOCAL_SALT', pwIter: 600000 });
  const backup = await StorageService.exportAll();
  assert.equal(backup.data.users[0].pwHash, undefined);
  assert.equal(backup.data.users[0].pwSalt, undefined);
  backup.data.users[0].username = 'renamed';
  backup.data.users[0].pwHash = 'FORGED_HASH';
  backup.data.users.push({ id: 'new-user', username: 'new', pwHash: 'ATTACKER_HASH', role: 'user' });
  await StorageService.importAll(backup);
  const local = await StorageService.get('users', 'local-user');
  const fresh = await StorageService.get('users', 'new-user');
  assert.equal(local.username, 'renamed');
  assert.equal(local.pwHash, 'LOCAL_HASH');
  assert.equal(local.pwSalt, 'LOCAL_SALT');
  assert.equal(fresh.pwHash, undefined);
  assert.equal(fresh.mustSetPassword, true);
});

test('A04: a unique-index conflict rolls back the entire full-snapshot transaction', async () => {
  await setup();
  await StorageService.put('products', { id: 'baseline', companyId: 'c1', name: 'Existing' });
  await assert.rejects(StorageService.importAll({
    app: 'Factor-easyPro', version: 6,
    data: {
      products: [{ id: 'new-product', companyId: 'c1', name: 'Must rollback' }],
      journal_entries: [
        { id: 'journal-a', companyId: 'c1', sourceKey: 'same-key' },
        { id: 'journal-b', companyId: 'c1', sourceKey: 'same-key' }
      ]
    }
  }));
  assert.equal(await StorageService.get('products', 'new-product'), undefined);
  assert.equal((await StorageService.get('products', 'baseline')).name, 'Existing');
  assert.equal((await StorageService.getAll('journal_entries')).length, 0);
});

test('A04: exported appVersion, package and desktop installer versions agree', async () => {
  await setup();
  const backup = await SettingsController.exportBackup();
  const desktop = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  assert.equal(backup.version, appPackage.version);
  assert.equal(backup.appVersion, appPackage.version);
  assert.equal(desktop.version, appPackage.version);
  assert.equal(backup.schemaVersion, (await StorageService.exportAll()).version);
});

test('A04: checked backup restores successfully and rejects a corrupted payload before writes', async () => {
  await setup();
  const backup = await SettingsController.exportBackup();
  backup.data.contacts = [{ id: 'checksum-customer', companyId: 'c1', name: 'Original' }];
  const hashed = async data => {
    const bytes = await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(JSON.stringify(data)));
    return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
  };
  backup.integrity = { algorithm: 'SHA-256', digest: await hashed(backup.data) };
  await SettingsController.importBackup(backup);
  assert.equal((await StorageService.get('contacts', 'checksum-customer')).name, 'Original');

  await StorageService.delete('contacts', 'checksum-customer');
  const corrupted = structuredClone(backup);
  corrupted.data.contacts[0].name = 'Tampered';
  await assert.rejects(SettingsController.importBackup(corrupted), /تغییر کرده|آسیب/);
  assert.equal(await StorageService.get('contacts', 'checksum-customer'), undefined);
  await assert.rejects(SettingsController.importBackup({
    ...backup, integrity: { algorithm: 'MD5', digest: 'bad' }
  }), /نامعتبر/);
  assert.equal(await StorageService.get('contacts', 'checksum-customer'), undefined);
});

test('A04: older backup envelopes without optional checksum retain supported compatibility', async () => {
  await setup();
  const backup = await SettingsController.exportBackup();
  assert.equal(backup.integrity, undefined);
  backup.data.contacts = [{ id: 'legacy-contact', companyId: 'c1', name: 'Legacy' }];
  await SettingsController.importBackup(backup);
  assert.equal((await StorageService.get('contacts', 'legacy-contact')).name, 'Legacy');
});
