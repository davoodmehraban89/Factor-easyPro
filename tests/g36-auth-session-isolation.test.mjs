import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const authPath = fileURLToPath(new URL('../src/core/Auth.js', import.meta.url));
const source = fs.readFileSync(authPath, 'utf8');
const stripped = source
  .replace(/^import .*?;\s*$/gm, '')
  .replace(/^export (async function|function|const|class) /gm, '$1 ');
const session = new Map();
const context = vm.createContext({
  sessionStorage: {
    getItem: key => session.get(key) ?? null,
    setItem: (key, value) => session.set(key, String(value)),
    removeItem: key => session.delete(key)
  },
  StorageService: {},
  EventBus: {},
  LicenseService: {},
  TextEncoder, crypto: globalThis.crypto,
  Uint8Array, String, JSON, Promise, setTimeout, btoa, atob,
});
vm.runInContext(stripped + '\nthis.__auth = Auth;', context, { filename: authPath });
const auth = context.__auth;
const users = [
  { id: 'admin-synthetic', username: 'synthetic', pwHash: 'dummy', pwSalt: 'dummy', role: 'admin' },
  { id: 'uninitialized-synthetic', username: 'pending', mustSetPassword: true }
];
test('G36: unknown session identity is rejected', () => {
  session.set(auth.sessionKey, 'unknown');
  assert.equal(auth._restoreSession(users), null);
});
test('G36: password-uninitialized session is rejected', () => {
  session.set(auth.sessionKey, 'uninitialized-synthetic');
  assert.equal(auth._restoreSession(users), null);
});
test('G36: existing initialized session id restores without a fresh password challenge (documented risk)', () => {
  session.set(auth.sessionKey, 'admin-synthetic');
  assert.equal(auth._restoreSession(users)?.id, 'admin-synthetic');
});
test('G36: login screen form has autocomplete off, but this does not prove browser compliance', () => {
  assert.match(source, /<form id="finoraAuthForm" autocomplete="off"/);
  assert.match(source, /el\.pass\.value = ''/);
  assert.match(source, /el\.pass2\.value = ''/);
});
