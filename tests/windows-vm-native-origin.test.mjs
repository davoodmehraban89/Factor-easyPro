import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { verifyNativeOrigin } = require('./windows-vm-native-origin.cjs');

test('A07: accepts only packaged Tauri local document origins', () => {
  assert.equal(verifyNativeOrigin('http://tauri.localhost/#dashboard'),
    'http://tauri.localhost');
  assert.equal(verifyNativeOrigin('https://tauri.localhost/invoices?test=1'),
    'https://tauri.localhost');
  const scheme = verifyNativeOrigin('tauri://localhost/index.html');
  assert.ok(scheme.startsWith('tauri:'));
});

test('A07: rejects remote origins, deceptive subdomains, credentials and malformed URLs', () => {
  for (const url of [
    'https://some-remote-service.example/login',
    'https://tauri.localhost.attack.test/',
    'http://localhost:4173/',
    'https://tauri.localhost@attacker.example/',
    'https://bob:secret@tauri.localhost/',
    'about:blank', 'file:///c:/windows/system32',
    '//tauri.localhost/dashboard',
    'bad-url'
  ]) {
    assert.throws(() => verifyNativeOrigin(url), Error, url);
  }
});
