import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { SettingsController } from '../src/controllers/SettingsController.js';

test('A06: ordinary users cannot export company backup data', async () => {
  await StorageService.clearAll();
  await StorageService.put('companies', { id: 'c1', name: 'Company' });
  await StorageService.put('contacts', { id: 'secret-customer', companyId: 'c1', name: 'Private' });
  CompanyService.activeCompanyId = 'c1';
  Auth.currentUser = { id: 'staff', role: 'user', companyIds: ['c1'], username: 'staff' };
  await assert.rejects(SettingsController.exportBackup(), /فقط توسط مدیر/);
  assert.equal((await StorageService.get('contacts', 'secret-customer')).name, 'Private');
});

test('A06: ordinary users cannot erase company or global data', async () => {
  await StorageService.clearAll();
  await StorageService.put('companies', { id: 'c1', name: 'Company' });
  await StorageService.put('contacts', { id: 'important-customer', companyId: 'c1', name: 'Keep' });
  Auth.currentUser = { id: 'staff', role: 'user', companyIds: ['c1'], username: 'staff' };
  await assert.rejects(SettingsController.wipeAll(), /فقط توسط مدیر/);
  assert.ok(await StorageService.get('companies', 'c1'));
  assert.equal((await StorageService.get('contacts', 'important-customer')).name, 'Keep');
});

test('A06: administrator retains authorized export capability', async () => {
  await StorageService.clearAll();
  await StorageService.put('companies', { id: 'c1', name: 'Company' });
  CompanyService.activeCompanyId = 'c1';
  Auth.currentUser = { id: 'manager', role: 'admin', username: 'manager' };
  const backup = await SettingsController.exportBackup();
  assert.equal(backup.scope, 'company');
  assert.equal(backup.companyId, 'c1');
});
