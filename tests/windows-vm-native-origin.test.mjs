import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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

test('A01: native installed-lab must enforce endorsement and cash guards as mandatory scenarios',()=>{
  const script=readFileSync(new URL('../scripts/windows-vm-native-lab.ps1', import.meta.url),'utf8');
  const matrix=readFileSync(new URL('./windows-vm-native-functional-matrix.cjs', import.meta.url),'utf8');
  const mandatory=script.match(/\$mandatory\s*=\s*@\(([\s\S]*?)\r?\n\s*\)/)?.[1];
  assert.ok(mandatory,'Native PowerShell mandatory scenario list must be parseable');
  for(const name of [
    'inactive-treasury-cheque-settlement',
    'cheque-third-party-endorsement',
    'treasury-cheque-reconciliation-readonly',
    'return-cash-settlement-net-credit',
    'fiscal-close-atomic-guardrails'
  ]){
    assert.ok(mandatory.includes("'"+name+"'"),
      'Installed-native gate missing mandatory scenario: '+name);
    assert.ok(matrix.includes("['"+name+"'"),
      'Native functional matrix must execute the mandatory scenario: '+name);
  }
});
