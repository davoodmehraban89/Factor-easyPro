import test from 'node:test';
import assert from 'node:assert/strict';
import coverage from '../scripts/q01-native-action-coverage.cjs';

const { annotateAudit, coverageFor } = coverage;

test('Q01 maps invoice and treasury handlers only when every required native scenario passed',()=>{
 const scenarios={
  'purchase-and-post-ledger':{purchasePosted:true},'partial-sale-and-inventory':{salePosted:true},
  'sale-return-immutable-stock-and-ledger':{separatePostedReturn:true},
  'purchase-return-and-stock-guardrails':{postedSupplierReturn:true},
  'return-cash-settlement-net-credit':{netReceiptAccepted:true},
  'inactive-treasury-cheque-settlement':{validChequeClearedExactlyOnce:true}
 };
 const evidence={nativeFunctional:scenarios};
 assert.equal(coverageFor('window.InvoiceFormView._save(false)',evidence).kind,'native-fixture-positive-and-negative');
 assert.equal(coverageFor("window.TreasuryView._saveTransaction('transfer')",evidence).kind,'native-negative-guard-only');
 assert.equal(coverageFor('window.ContactsView.saveContact(null)',evidence),null);
 delete scenarios['purchase-return-and-stock-guardrails'];
 assert.equal(coverageFor('window.InvoiceFormView._save(false)',evidence),null);
});

test('Q01 maps contact, product, unit and category UI writes only to installed form scenarios',()=>{
 const evidence={nativeFunctional:{
  'contacts-crud-form-and-tags':{createdThroughForm:true,tagPersisted:true,editedThroughForm:true},
  'products-crud-form-and-nested-classifiers':{createdThroughForm:true,nestedUnitSavedAndSelected:true,nestedCategorySavedAndSelected:true,editedThroughForm:true}
 }};
 assert.equal(coverageFor('window.ContactsView.saveContact(null)',evidence).kind,'native-ui-create-and-update');
 assert.equal(coverageFor('window.ProductsView.saveProduct(null)',evidence).kind,'native-ui-create-and-update');
 assert.equal(coverageFor('window.ProductsView.saveUnit(true)',evidence).kind,'native-ui-nested-create');
 assert.equal(coverageFor('window.ProductsView.saveCategory(true)',evidence).kind,'native-ui-nested-create');
 evidence.nativeFunctional['products-crud-form-and-nested-classifiers'].nestedCategorySavedAndSelected=false;
 assert.equal(coverageFor('window.ProductsView.saveProduct(null)',evidence),null,
  'A scenario with an explicit failed assertion must not be reported as coverage');
});

test('Q01 maps legacy stock adjustment and integrated-mode guard only to both native scenarios',()=>{
 const evidence={nativeFunctional:{
  'legacy-stock-adjustment-form-and-validation':{validAdjustmentPosted:true,overPrecisionRejectedWithoutWrites:true},
  'integrated-stock-adjustment-guard':{manualAdjustmentHidden:true,directOpenBlocked:true,directSaveBlocked:true}
 }};
 assert.equal(coverageFor("window.StockKardexModal.openAdjustModal('prod_1')",evidence).kind,'native-ui-guarded-action');
 assert.equal(coverageFor("window.StockKardexModal.saveAdjust('prod_1')",evidence).kind,'native-ui-stock-posting');
 evidence.nativeFunctional['integrated-stock-adjustment-guard'].directSaveBlocked=false;
 assert.equal(coverageFor("window.StockKardexModal.openAdjustModal('prod_1')",evidence),null);
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
  'purchase-and-post-ledger':{purchasePosted:true},'partial-sale-and-inventory':{salePosted:true},
  'sale-return-immutable-stock-and-ledger':{separatePostedReturn:true},
  'purchase-return-and-stock-guardrails':{postedSupplierReturn:true},
  'return-cash-settlement-net-credit':{netReceiptAccepted:true}
 }};
 const summary=annotateAudit(audit,evidence);
 assert.equal(summary.notClicked,2);
 assert.equal(summary.fixtureCoveredNotClicked,1);
 assert.equal(summary.withoutFixtureEvidence,1);
 assert.equal(audit.uniqueActions[0].status,'not-clicked');
 assert.equal(audit.uniqueActions[0].fixtureCoverage.kind,'native-fixture-positive-and-negative');
 assert.equal(audit.uniqueActions[1].fixtureCoverage,null);
});
