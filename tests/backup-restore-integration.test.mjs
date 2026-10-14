import appPackage from '../package.json' with { type: 'json' };
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { Auth } from '../src/core/Auth.js';
import { SettingsController } from '../src/controllers/SettingsController.js';

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
