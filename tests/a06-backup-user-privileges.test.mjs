import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';

const backup = data => ({ app: 'Factor-easyPro', version: 7, data });

test('A06: a full backup cannot promote a local staff member or alter company grants', async () => {
  await StorageService.clearAll();
  await StorageService.put('users', {
    id: 'staff', username: 'staff', role: 'user',
    companyIds: ['allowed-c1'], pwHash: 'LOCAL_HASH', pwSalt: 'LOCAL_SALT',
    mustSetPassword: false
  });
  await StorageService.importAll(backup({ users: [{
    id: 'staff', username: 'renamed-staff', role: 'admin',
    companyIds: ['private-c2'], pwHash: 'FORGED',
    pwSalt: 'FORGED', displayName: 'Updated name'
  }] }));
  const restored = await StorageService.get('users', 'staff');
  assert.equal(restored.role, 'user');
  assert.deepEqual(restored.companyIds, ['allowed-c1']);
  assert.equal(restored.pwHash, 'LOCAL_HASH');
  assert.equal(restored.pwSalt, 'LOCAL_SALT');
  assert.equal(restored.mustSetPassword, false);
  assert.equal(restored.username, 'renamed-staff');
});

test('A06: imported new admin role is always downgraded and requires password setup', async () => {
  await StorageService.clearAll();
  await StorageService.put('users', {
    id: 'local-admin', username: 'manager', role: 'admin',
    pwHash: 'KEEP', mustSetPassword: false
  });
  await StorageService.importAll(backup({ users: [{
    id: 'from-backup', username: 'foreign-admin', role: 'admin',
    companyIds: ['other-company'], pwHash: 'FAKE', mustSetPassword: false
  }] }));
  const local = await StorageService.get('users', 'local-admin');
  const imported = await StorageService.get('users', 'from-backup');
  assert.equal(local.role, 'admin');
  assert.equal(local.pwHash, 'KEEP');
  assert.equal(imported.role, 'user');
  assert.deepEqual(imported.companyIds, []);
  assert.equal(imported.pwHash, undefined);
  assert.equal(imported.mustSetPassword, true);
});

test('A06: duplicate names and >4 combined users abort the entire backup transaction', async () => {
  await StorageService.clearAll();
  await StorageService.put('users', {
    id: 'local-admin', username: 'manager', role: 'admin',
    pwHash: 'KEEP'
  });
  await assert.rejects(StorageService.importAll(backup({
    products: [{ id: 'rollback-product', companyId: 'c1', name: 'Undo' }],
    users: [{ id: 'another', username: 'manager', role: 'user' }]
  })), /تکراری/);
  assert.equal(await StorageService.get('users', 'another'), undefined);
  assert.equal(await StorageService.get('products', 'rollback-product'), undefined);

  await assert.rejects(StorageService.importAll(backup({
    users: ['one', 'two', 'three', 'four'].map((name, i) => ({
      id: 'import-' + i, username: name, role: 'user'
    }))
  })), /چهار کاربر/);
  assert.equal((await StorageService.getAll('users')).length, 1);
});
