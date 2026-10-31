import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('A08 native benchmark measures installed report tabs and encrypted full-scale backup',()=>{
 const source=read('tests/windows-vm-native-performance-browser.js');
 assert.match(source,/await FINORA\.Router\.go\('reports'\)/);
 assert.match(source,/window\.ReportsView\._switchTab\(tab\)/);
 assert.match(source,/window\.SettingsView\.downloadBackup\(\)/);
 assert.match(source,/crypto\.subtle\.decrypt/);
 assert.match(source,/backup\.data\.products\.length !== productCount/);
 assert.match(source,/backup\.data\.invoices\.length !== invoiceCount/);
 assert.match(source,/iterations: 600000/);
});

test('A08 installed VM runner rejects incomplete report or encrypted-backup measurements',()=>{
 const source=read('tests/windows-vm-installed-tauri-cdp.cjs');
 assert.match(source,/measured\.reportTabs\?\.\[tab\]\?\.htmlCharacters >= 200/);
 assert.match(source,/measured\.encryptedBackup\?\.products, 10000/);
 assert.match(source,/measured\.encryptedBackup\?\.invoices, 50000/);
 const lab=read('scripts/windows-vm-native-lab.ps1');
 assert.match(lab,/\$encryptedBackup\.bytes -lt 100000/);
 assert.match(lab,/reportsRendered = 4/);
});
