import test from 'node:test';
import assert from 'node:assert/strict';
import coverage from '../scripts/q01-native-action-coverage.cjs';

const { annotateAudit, coverageFor } = coverage;

test('Q01 maps invoice and treasury handlers only when every required native scenario passed',()=>{
 const scenarios={
  'purchase-and-post-ledger':{},'partial-sale-and-inventory':{},
  'sale-return-immutable-stock-and-ledger':{},
  'purchase-return-and-stock-guardrails':{},
  'return-cash-settlement-net-credit':{},
  'inactive-treasury-cheque-settlement':{}
 };
 const evidence={nativeFunctional:scenarios};
 assert.equal(coverageFor('window.InvoiceFormView._save(false)',evidence).kind,'native-fixture-positive-and-negative');
 assert.equal(coverageFor("window.TreasuryView._saveTransaction('transfer')",evidence).kind,'native-negative-guard-only');
 assert.equal(coverageFor('window.ContactsView.saveContact(null)',evidence),null);
 delete scenarios['purchase-return-and-stock-guardrails'];
 assert.equal(coverageFor('window.InvoiceFormView._save(false)',evidence),null);
});

test('Q01 labels encrypted backup UI coverage only after the installed backup test passes',()=>{
 assert.equal(coverageFor('window.SettingsView.downloadBackup()',{}),null);
 assert.equal(coverageFor('window.SettingsView.restoreBackup()',{encryptedCompanyBackup:true}).kind,'native-encrypted-backup-ui');
});

test('Q01 coverage never converts an unclicked control into a clicked control',()=>{
 const audit={uniqueActions:[
  {route:'invoices',label:'ذخیره',handler:'window.InvoiceFormView._save(false)',status:'not-clicked'},
  {route:'products',label:'ذخیره',handler:'window.ProductsView.saveProduct(null)',status:'not-clicked'}
 ],controls:[]};
 const evidence={nativeFunctional:{
  'purchase-and-post-ledger':{},'partial-sale-and-inventory':{},
  'sale-return-immutable-stock-and-ledger':{},
  'purchase-return-and-stock-guardrails':{},
  'return-cash-settlement-net-credit':{}
 }};
 const summary=annotateAudit(audit,evidence);
 assert.equal(summary.notClicked,2);
 assert.equal(summary.fixtureCoveredNotClicked,1);
 assert.equal(summary.withoutFixtureEvidence,1);
 assert.equal(audit.uniqueActions[0].status,'not-clicked');
 assert.equal(audit.uniqueActions[0].fixtureCoverage.kind,'native-fixture-positive-and-negative');
 assert.equal(audit.uniqueActions[1].fixtureCoverage,null);
});
