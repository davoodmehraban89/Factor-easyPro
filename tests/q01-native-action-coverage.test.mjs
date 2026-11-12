import test from 'node:test';
import assert from 'node:assert/strict';
import coverage from '../scripts/q01-native-action-coverage.cjs';

const { annotateAudit, coverageFor } = coverage;

test('Q01 maps invoice and treasury handlers only when every required native scenario passed',()=>{
 const scenarios={
  'purchase-and-post-ledger':{purchasePosted:true},'partial-sale-and-inventory':{salePosted:true},
  'sale-return-immutable-stock-and-ledger':{separatePostedReturn:true,balancedLedgerAndReturnedStock:true,postedOriginalImmutable:true},
  'purchase-return-and-stock-guardrails':{postedSupplierReturn:true,balancedLedger:true,stockIssued:true,originalPurchaseImmutable:true},
  'return-cash-settlement-net-credit':{netReceiptAccepted:true},
  'inactive-treasury-cheque-settlement':{inactiveTransferRejected:true,invalidTransferRolledBack:true,validTransferPosted:true}
 };
 const evidence={nativeFunctional:scenarios};
 assert.equal(coverageFor('window.InvoiceFormView._save(false)',evidence).kind,'native-fixture-positive-and-negative');
 assert.equal(coverageFor("window.TreasuryView._saveTransaction('transfer')",evidence).kind,'native-fixture-positive-and-negative');
 assert.equal(coverageFor('window.ContactsView.saveContact(null)',evidence),null);
 delete scenarios['purchase-return-and-stock-guardrails'];
 assert.equal(coverageFor('window.InvoiceFormView._save(false)',evidence),null);
});

test('Q01 maps contact, product, unit and category UI writes only to installed form scenarios',()=>{
 const evidence={nativeFunctional:{
  'contacts-crud-form-and-tags':{createdThroughForm:true,tagPersisted:true,editedThroughForm:true},
  'products-crud-form-and-nested-classifiers':{createdThroughForm:true,nestedUnitSavedAndSelected:true,nestedCategorySavedAndSelected:true,editedThroughForm:true,fractionalReorderPointPreserved:true}
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
  'legacy-stock-adjustment-form-and-validation':{validAdjustmentPosted:true,overPrecisionRejectedWithoutWrites:true,negativeRejectedWithoutWrites:true,fractionalQuantityPreserved:true},
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
  'sale-return-immutable-stock-and-ledger':{separatePostedReturn:true,balancedLedgerAndReturnedStock:true,postedOriginalImmutable:true},
  'purchase-return-and-stock-guardrails':{postedSupplierReturn:true,balancedLedger:true,stockIssued:true,originalPurchaseImmutable:true},
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


test('Q01 maps quick invoice creation and print handlers only to the installed quick-add scenario',()=>{
 const evidence={nativeFunctional:{'invoice-quick-add-and-save-print':{
  quickContactCreated:true,quickProductCreated:true,saveAndPrintOpened:true,
  invoicePrintRendered:true,invoicePosted:true
 }}};
 for(const handler of [
  'window.InvoiceFormView._save(true)','window.InvoiceFormView._saveQuickContact()',
  'window.InvoiceFormView._saveQuickProduct()','window.InvoicePrint._print()'
 ]) assert.ok(coverageFor(handler,evidence),handler);
});

test('Q01 maps native print, expense and ledger operations only after their installed fixtures pass',()=>{
 const evidence={nativeFunctional:{
  'auxiliary-rtl-print-rendering':{kardexPrints:4,contactLedgerPrints:7,reportsPrintRendered:true,allDocumentsRtl:true},
  'expense-form-category-and-posting':{expenseCreatedThroughForm:true,customCategorySelected:true,expenseJournalPosted:true},
  'manual-journal-reversal-and-exports':{chartAccountCreated:true,journalRowAdded:true,draftJournalSaved:true,journalPosted:true,reversalPosted:true,ledgerCsvExported:true,reconciliationCsvExported:true}
 }};
 assert.equal(coverageFor("window.StockKardexModal._printKardex('prod_1')",evidence).kind,'native-rtl-print-render');
 assert.equal(coverageFor('window.ContactLedgerModal._printLedger("contact_1")',evidence).kind,'native-rtl-print-render');
 assert.equal(coverageFor('window.ReportsView._printReport()',evidence).kind,'native-rtl-print-render');
 assert.equal(coverageFor('window.ExpensesView._promptNewCategory()',evidence).kind,'native-ui-category-create');
 assert.equal(coverageFor('window.ExpensesView.saveExpense(null)',evidence).kind,'native-ui-financial-posting');
 assert.equal(coverageFor("window.AccountingView.saveJournal('posted')",evidence).kind,'native-ui-final-posting');
 assert.equal(coverageFor('window.AccountingView.saveReversal()',evidence).kind,'native-ui-reversal-posting');
 assert.equal(coverageFor('window.AccountingView.exportReports()',evidence).kind,'native-csv-export');
 assert.equal(coverageFor('window.AccountingView.exportReconciliation()',evidence).kind,'native-csv-export');
});

test('Q01 transfer coverage requires both rejected inactive and successful active-account transfer evidence',()=>{
 const evidence={nativeFunctional:{'inactive-treasury-cheque-settlement':{
  inactiveTransferRejected:true,invalidTransferRolledBack:true,validTransferPosted:true,treasuryAccountEditPersisted:true
 }}};
 assert.equal(coverageFor("window.TreasuryView._saveTransaction('transfer')",evidence).kind,
  'native-fixture-positive-and-negative');
 assert.equal(coverageFor('window.TreasuryView.saveAccount(null)',evidence),null);
 evidence.nativeFunctional['inactive-treasury-cheque-settlement'].treasuryAccountCreatedThroughForm=true;
 assert.equal(coverageFor('window.TreasuryView.saveAccount(null)',evidence).kind,'native-ui-create');
 assert.equal(coverageFor('window.TreasuryView.saveAccount("acc_1")',evidence).kind,
  'native-ui-update');
 evidence.nativeFunctional['inactive-treasury-cheque-settlement'].validTransferPosted=false;
 assert.equal(coverageFor("window.TreasuryView._saveTransaction('transfer')",evidence),null);
});

test('Q01 maps stock transfer and stocktake UI actions only to exact balance-preserving native evidence',()=>{
 const evidence={nativeFunctional:{'inventory-transfer-and-stocktake':{
  secondWarehouseCreated:true,transferPosted:true,exactInventoryMoved:true,
  stocktakeCreated:true,stocktakeCountsSaved:true,stocktakeFinalized:true
 }}};
 for(const handler of [
  'window.AccountingView.saveTransfer()','window.AccountingView.createStocktake()',
  'window.AccountingView.saveStocktake()','window.AccountingView.finishStocktake()'
 ]) assert.ok(coverageFor(handler,evidence),handler);
});

test('Q01 maps standalone unit/category create and delete only to explicit synthetic form evidence',()=>{
 const evidence={nativeFunctional:{'products-crud-form-and-nested-classifiers':{
  standaloneUnitCreatedAndDeleted:true,standaloneCategoryCreatedAndDeleted:true
 }}};
 for(const handler of [
  'window.ProductsView.saveUnit(false)','window.ProductsView.saveCategory(false)',
  'window.ProductsView.deleteUnit("unit_synthetic")','window.ProductsView.deleteCategory("cat_synthetic")'
 ]) assert.ok(coverageFor(handler,evidence),handler);
 evidence.nativeFunctional['products-crud-form-and-nested-classifiers'].standaloneCategoryCreatedAndDeleted=false;
 assert.equal(coverageFor('window.ProductsView.deleteCategory("cat_synthetic")',evidence),null);
});

test('Q01 maps draft expense edit and accounting read/reversal controls to installed form evidence',()=>{
 const evidence={nativeFunctional:{
  'expense-form-category-and-posting':{expenseCreatedThroughForm:true,postedExpenseEditRejected:true,draftExpenseEditedThroughForm:true},
  'manual-journal-reversal-and-exports':{
   journalDetailsOpened:true,reversalFormOpened:true,reversalPosted:true,journalRowRemoveButtonClicked:true
  }
 }};
 assert.equal(coverageFor('window.ExpensesView.editExpense("exp_synthetic")',evidence).kind,'native-ui-draft-edit');
 assert.equal(coverageFor('window.AccountingView.showJournal("jn_synthetic")',evidence).kind,'native-ui-read-only-details');
 assert.equal(coverageFor('window.AccountingView.openReversal("jn_synthetic")',evidence).kind,'native-ui-reversal-form');
 assert.equal(coverageFor("this.closest('tr').remove()",evidence).kind,'native-ui-draft-row-remove');
});

test('Q01 accounting period and warehouse form coverage requires positive installed evidence',()=>{
 const evidence={nativeFunctional:{'activate-accounting-and-inventory':{
  periodCreatedByForm:true,warehouseCreatedByForm:true
 },'fiscal-close-atomic-guardrails':{successfulCloseCommitted:true,duplicateCloseRejected:true}}};
 assert.equal(coverageFor('window.AccountingView.savePeriod()',evidence).kind,'native-ui-period-create');
 assert.equal(coverageFor('window.AccountingView.saveWarehouse()',evidence).kind,'native-ui-warehouse-create');
 evidence.nativeFunctional['activate-accounting-and-inventory'].warehouseCreatedByForm=false;
 assert.equal(coverageFor('window.AccountingView.saveWarehouse()',evidence),null);
});


test('Q01 maps shared modal-close and invoice-route actions only to exact shell probes',()=>{
 const evidence={
  routesVisited:10,
  modalKeyboard:{
   escapeClosesWithoutConfirm:true,focusReturnsToTrigger:true,
   cancelDoesNotConfirmAndRestoresFocus:true,nestedDialogIsolation:true
  }
 };
 assert.equal(coverageFor('FINORA.Modal.close()',evidence).kind,'native-shared-modal-close-contract');
 assert.equal(coverageFor("FINORA.Router.go('invoices')",evidence).kind,'native-route-navigation');
 evidence.modalKeyboard.focusReturnsToTrigger=false;
 assert.equal(coverageFor('FINORA.Modal.close()',evidence),null);
 evidence.modalKeyboard.focusReturnsToTrigger=true;
 evidence.routesVisited=9;
 assert.equal(coverageFor("FINORA.Router.go('invoices')",evidence),null);
});

test('Q01 period and warehouse form mappings require the actual form-save result, not service setup',()=>{
 const evidence={nativeFunctional:{
  'activate-accounting-and-inventory':{fiscalPeriods:1,accountCount:20,integration:'enabled',warehouse:'created'},
  'fiscal-close-atomic-guardrails':{successfulCloseCommitted:true,duplicateCloseRejected:true}
 }};
 assert.equal(coverageFor('window.AccountingView.savePeriod()',evidence),null);
 assert.equal(coverageFor('window.AccountingView.saveWarehouse()',evidence),null);
 evidence.nativeFunctional['activate-accounting-and-inventory'].periodCreatedByForm=true;
 evidence.nativeFunctional['activate-accounting-and-inventory'].warehouseCreatedByForm=true;
 assert.equal(coverageFor('window.AccountingView.savePeriod()',evidence).kind,'native-ui-period-create');
 assert.equal(coverageFor('window.AccountingView.saveWarehouse()',evidence).kind,'native-ui-warehouse-create');
});


test('Q01 cheque create mapping requires the installed cheque form, not just cheque accounting',()=>{
 const evidence={nativeFunctional:{'inactive-treasury-cheque-settlement':{
  disabledChequeClearingRejected:true,validChequeClearedExactlyOnce:true
 }}};
 assert.equal(coverageFor('window.ChequesView.saveCheque(null)',evidence),null);
 evidence.nativeFunctional['inactive-treasury-cheque-settlement'].chequeCreatedThroughForm=true;
 assert.equal(coverageFor('window.ChequesView.saveCheque(null)',evidence).kind,'native-ui-cheque-create');
});
