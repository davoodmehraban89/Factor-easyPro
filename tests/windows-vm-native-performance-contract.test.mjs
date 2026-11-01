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


test('Q01 Windows native matrix requires the additional invoice, print, expense, ledger and stocktake workflows',()=>{
 const matrix=read('tests/windows-vm-native-functional-matrix.cjs');
 const lab=read('scripts/windows-vm-native-lab.ps1');
 const scenarios=[
  'invoice-quick-add-and-save-print',
  'auxiliary-rtl-print-rendering',
  'expense-form-category-and-posting',
  'manual-journal-reversal-and-exports',
  'inventory-transfer-and-stocktake'
 ];
 for(const scenario of scenarios){
  assert.ok(matrix.includes("['"+scenario+"'"),'Native functional matrix omitted '+scenario);
  assert.ok(lab.includes("'"+scenario+"'"),'Windows VM mandatory acceptance omitted '+scenario);
 }
 assert.match(matrix,/window\.InvoiceFormView\._save\(true\)/);
 assert.match(matrix,/window\.StockKardexModal\._printKardex/);
 assert.match(matrix,/window\.ContactLedgerModal\._printLedger/);
 assert.match(matrix,/view\.saveTransfer\(\)/);
 assert.match(matrix,/view\.finishStocktake\(\)/);
});
