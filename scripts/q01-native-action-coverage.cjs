'use strict';

const RULES = [
  { match:'window.InvoiceFormView._save(false)', checks:{
      'purchase-and-post-ledger':['purchasePosted'],
      'partial-sale-and-inventory':['salePosted'],
      'sale-return-immutable-stock-and-ledger':['separatePostedReturn','balancedLedgerAndReturnedStock','postedOriginalImmutable'],
      'purchase-return-and-stock-guardrails':['postedSupplierReturn','balancedLedger','stockIssued','originalPurchaseImmutable']
    }, kind:'native-fixture-positive-and-negative',
    note:'ثبت خرید، فروش و مرجوعی با سند متوازن، موجودی و حفظ سند اولیه در نصب واقعی' },
  { match:'window.ContactsView.saveContact(', checks:{
      'contacts-crud-form-and-tags':['createdThroughForm','editedThroughForm','tagPersisted']
    }, kind:'native-ui-create-and-update',
    note:'ثبت و ویرایش شخص از فرم واقعی و ماندگاری برچسب در WebView2' },
  { match:'window.ProductsView.saveProduct(', checks:{
      'products-crud-form-and-nested-classifiers':['createdThroughForm','editedThroughForm','fractionalReorderPointPreserved','nestedUnitSavedAndSelected','nestedCategorySavedAndSelected']
    }, kind:'native-ui-create-and-update',
    note:'ثبت و ویرایش کالا از فرم واقعی با قیمت، نقطه سفارش و طبقه‌بندی انتخاب‌شده' },
  { match:'window.ProductsView.saveUnit(true)', checks:{
      'products-crud-form-and-nested-classifiers':['nestedUnitSavedAndSelected']
    }, kind:'native-ui-nested-create',
    note:'ایجاد واحد از پنجره تو‌در‌تو و انتخاب آن در فرم والد کالا' },
  { match:'window.ProductsView.saveCategory(true)', checks:{
      'products-crud-form-and-nested-classifiers':['nestedCategorySavedAndSelected']
    }, kind:'native-ui-nested-create',
    note:'ایجاد گروه از پنجره تو‌در‌تو و انتخاب آن در فرم والد کالا' },
  { match:'window.StockKardexModal.openAdjustModal(', checks:{
      'legacy-stock-adjustment-form-and-validation':['validAdjustmentPosted'],
      'integrated-stock-adjustment-guard':['manualAdjustmentHidden','directOpenBlocked','directSaveBlocked']
    }, kind:'native-ui-guarded-action',
    note:'اصلاح دستی در حالت قدیمی و جلوگیری از نمایش و اجرای آن در حسابداری یکپارچه' },
  { match:'window.StockKardexModal.saveAdjust(', checks:{
      'legacy-stock-adjustment-form-and-validation':['overPrecisionRejectedWithoutWrites','negativeRejectedWithoutWrites','validAdjustmentPosted','fractionalQuantityPreserved']
    }, kind:'native-ui-stock-posting',
    note:'رد مقدار منفی و دقت بیش از سه رقم و ثبت موجودی واقعی در نصب ویندوز' },
  { match:'window.TreasuryView.saveAccount(null)', checks:{
      'inactive-treasury-cheque-settlement':['treasuryAccountCreatedThroughForm']
    }, kind:'native-ui-create',
    note:'ایجاد حساب خزانه ساختگی از فرم واقعی و اتصال آن به معین' },
  { match:'window.TreasuryView.saveAccount(', exclude:'window.TreasuryView.saveAccount(null)', checks:{
      'inactive-treasury-cheque-settlement':['treasuryAccountEditPersisted']
    }, kind:'native-ui-update',
    note:'ویرایش حساب خزانه از فرم واقعی در شرکت ساختگی' },
  { match:"window.TreasuryView._saveTransaction('transfer')", checks:{
      'inactive-treasury-cheque-settlement':['inactiveTransferRejected','invalidTransferRolledBack','validTransferPosted']
    }, kind:'native-fixture-positive-and-negative',
    note:'رد انتقال به حساب غیرفعال و ثبت دقیق انتقال بین دو حساب فعال' },
  { match:"window.TreasuryView._saveTransaction('receipt')", checks:{
      'return-cash-settlement-net-credit':['overcollectionRejectedWithoutWrites','netReceiptAccepted']
    }, kind:'native-fixture-positive-and-negative',
    note:'رد دریافت بیش از مانده و ثبت دریافت مجاز' },
  { match:"window.TreasuryView._saveTransaction('payment')", checks:{
      'return-cash-settlement-net-credit':['nonexistentRefundCreditRejected','authorizedRefundTracedInInstalledWebView2']
    }, kind:'native-fixture-positive-and-negative',
    note:'رد بازپرداخت بدون اعتبار واقعی و ثبت بازپرداخت مجاز با ردپای تأیید' },
  { match:'window.ChequesView.saveCheque(null)', checks:{
      'inactive-treasury-cheque-settlement':['chequeCreatedThroughForm']
    }, kind:'native-ui-cheque-create',
    note:'ایجاد چک ساختگی از فرم واقعی و ثبت سند دفتر کل' },
  { match:'window.ChequesView.changeStatus(', checks:{
      'inactive-treasury-cheque-settlement':['disabledChequeClearingRejected','validChequeClearedExactlyOnce','confirmationRequiredBeforeCash'],
      'cheque-third-party-endorsement':['missingEndorseeRejected','confirmationRequiredBeforeWrite','endorseeLedgerDimensionCorrect','appendOnlyEndorsementCorrelated','noPhantomCash']
    }, kind:'native-fixture-positive-and-negative',
    note:'رد وصول بدون بانک فعال، وصول با حساب منتخب و واگذاری چک با تأیید' },
  { match:'window.AccountingView.savePeriod()', checks:{
      'activate-accounting-and-inventory':['periodCreatedByForm'],
      'fiscal-close-atomic-guardrails':['successfulCloseCommitted','duplicateCloseRejected']
    }, kind:'native-ui-period-create',
    note:'ایجاد دوره مالی از فرم واقعی و آزمون بستن اتمیک دوره' },
  { match:'window.AccountingView.saveWarehouse()', checks:{
      'activate-accounting-and-inventory':['warehouseCreatedByForm']
    }, kind:'native-ui-warehouse-create',
    note:'ایجاد انبار ساختگی از فرم و تأیید ماندگاری' },
  { match:'window.AccountingView.previewOpeningFile()', checks:{
      'positive-opening-ledger-and-idempotency':['dryRunFirst','postedBalancedOpening','repeatPostingBlocked'],
      'opening-dry-run-rejects-existing-postings':['priorActivityBlocked','discrepancyCodesVisible','zeroWrites']
    }, kind:'native-fixture-positive-and-negative',
    note:'پیش‌نمایش و ثبت افتتاحیه، جلوگیری از تکرار و رد داده ناسازگار' },
  { match:'window.InvoiceFormView._save(true)', checks:{
      'invoice-quick-add-and-save-print':['quickContactCreated','quickProductCreated','saveAndPrintOpened','invoicePrintRendered','invoicePosted']
    }, kind:'native-ui-create-and-print',
    note:'ثبت فاکتور از فرم و بازشدن تنظیمات چاپ با کالای و شخصی که در همان فرم سریع ساخته شده‌اند' },
  { match:'window.InvoiceFormView._saveQuickContact()', checks:{
      'invoice-quick-add-and-save-print':['quickContactCreated']
    }, kind:'native-ui-nested-create',
    note:'ساخت شخص از پنجره سریع و انتخاب آن در فاکتور والد' },
  { match:'window.InvoiceFormView._saveQuickProduct()', checks:{
      'invoice-quick-add-and-save-print':['quickProductCreated']
    }, kind:'native-ui-nested-create',
    note:'ساخت خدمت از پنجره سریع و افزودن آن به ردیف فاکتور والد' },
  { match:'window.InvoicePrint._print()', checks:{
      'invoice-quick-add-and-save-print':['invoicePrintRendered','invoicePosted']
    }, kind:'native-rtl-print-render',
    note:'ساخت HTML چاپ فاکتور ذخیره‌شده با محتوای فارسی و راست‌به‌چپ؛ چاپگر فیزیکی آزمایش نشده' },
  { match:'window.StockKardexModal._printKardex(', checks:{
      'auxiliary-rtl-print-rendering':['kardexPrints','allDocumentsRtl']
    }, kind:'native-rtl-print-render',
    note:'تولید و ارسال سند چاپ راست‌به‌چپ کاردکس برای کالاهای ساختگی' },
  { match:'window.ContactLedgerModal._printLedger(', checks:{
      'auxiliary-rtl-print-rendering':['contactLedgerPrints','allDocumentsRtl']
    }, kind:'native-rtl-print-render',
    note:'تولید سند چاپ راست‌به‌چپ دفتر اشخاص برای اشخاص ساختگی' },
  { match:'window.ReportsView._printReport()', checks:{
      'auxiliary-rtl-print-rendering':['reportsPrintRendered','allDocumentsRtl']
    }, kind:'native-rtl-print-render',
    note:'تولید سند چاپ راست‌به‌چپ گزارش مالی؛ چاپگر فیزیکی آزمایش نشده' },
  { match:'window.ExpensesView._promptNewCategory()', checks:{
      'expense-form-category-and-posting':['customCategorySelected']
    }, kind:'native-ui-category-create',
    note:'افزودن سرفصل ساختگی در فرم هزینه و انتخاب آن قبل از ثبت' },
  { match:'window.ExpensesView.saveExpense(null)', checks:{
      'expense-form-category-and-posting':['expenseCreatedThroughForm','expenseJournalPosted']
    }, kind:'native-ui-financial-posting',
    note:'ثبت هزینه از فرم واقعی و تطبیق سند قطعی دفتر کل' },
  { match:'window.AccountingView.addJournalRow()', checks:{
      'manual-journal-reversal-and-exports':['journalRowAdded']
    }, kind:'native-ui-row-edit',
    note:'افزودن ردیف به فرم سند دستی حسابداری' },
  { match:"window.AccountingView.saveJournal('draft')", checks:{
      'manual-journal-reversal-and-exports':['draftJournalSaved']
    }, kind:'native-ui-draft-posting',
    note:'ثبت پیش‌نویس سند دستی در دوره باز' },
  { match:"window.AccountingView.saveJournal('posted')", checks:{
      'manual-journal-reversal-and-exports':['journalPosted']
    }, kind:'native-ui-final-posting',
    note:'قطعی‌سازی سند دستی متوازن از پیش‌نویس' },
  { match:'window.AccountingView.saveReversal()', checks:{
      'manual-journal-reversal-and-exports':['reversalPosted']
    }, kind:'native-ui-reversal-posting',
    note:'ثبت سند معکوس مستقل و حفظ سند اصلی' },
  { match:'window.AccountingView.saveAccount()', checks:{
      'manual-journal-reversal-and-exports':['chartAccountCreated']
    }, kind:'native-ui-chart-account-create',
    note:'ایجاد گروه کدینگ ساختگی از فرم حسابداری' },
  { match:'window.AccountingView.exportReports()', checks:{
      'manual-journal-reversal-and-exports':['ledgerCsvExported']
    }, kind:'native-csv-export',
    note:'خروجی CSV دفتر کل با سند ساختگی قطعی' },
  { match:'window.AccountingView.exportReconciliation()', checks:{
      'manual-journal-reversal-and-exports':['reconciliationCsvExported']
    }, kind:'native-csv-export',
    note:'خروجی CSV کنترل مغایرت با شمای مورد انتظار' },
  { match:'window.AccountingView.saveTransfer()', checks:{
      'inventory-transfer-and-stocktake':['secondWarehouseCreated','transferPosted','exactInventoryMoved']
    }, kind:'native-ui-inventory-transfer',
    note:'انتقال مقدار دقیق کالا بین دو انبار واقعی ساختگی' },
  { match:'window.AccountingView.createStocktake()', checks:{
      'inventory-transfer-and-stocktake':['stocktakeCreated']
    }, kind:'native-ui-stocktake-create',
    note:'ایجاد جلسه انبارگردانی از فرم واقعی' },
  { match:'window.AccountingView.saveStocktake()', checks:{
      'inventory-transfer-and-stocktake':['stocktakeCountsSaved']
    }, kind:'native-ui-stocktake-save',
    note:'ذخیره شمارش همه اقلام جلسه ساختگی' },
  { match:'window.AccountingView.finishStocktake()', checks:{
      'inventory-transfer-and-stocktake':['stocktakeFinalized']
    }, kind:'native-ui-stocktake-finalize',
    note:'تأیید نهایی شمارش همسان با موجودی و بستن جلسه' },
  { match:'window.SettingsView.downloadBackup()', flag:'encryptedCompanyBackup',
    kind:'native-encrypted-backup-ui',note:'خروجی رمزگذاری‌شده fbackup از رابط تنظیمات' },
  { match:'window.SettingsView.restoreBackup()', flag:'encryptedCompanyBackup',
    kind:'native-encrypted-backup-ui',note:'بازیابی رابط کاربری، رد رمز و فایل خراب و rollback تراکنشی' },
  { match:'window.ProductsView.saveUnit(false)', checks:{
      'products-crud-form-and-nested-classifiers':['standaloneUnitCreatedAndDeleted']
    }, kind:'native-ui-standalone-create',
    note:'ایجاد واحد از تب مستقل واحدها و ثبت در فهرست' },
  { match:'window.ProductsView.saveCategory(false)', checks:{
      'products-crud-form-and-nested-classifiers':['standaloneCategoryCreatedAndDeleted']
    }, kind:'native-ui-standalone-create',
    note:'ایجاد گروه از تب مستقل گروه‌ها و ثبت در فهرست' },
  { match:'window.ProductsView.deleteUnit(', checks:{
      'products-crud-form-and-nested-classifiers':['standaloneUnitCreatedAndDeleted']
    }, kind:'native-ui-synthetic-delete',
    note:'حذف واحد ساختگی و بدون ارجاع از دکمه ردیف و تأیید صریح' },
  { match:'window.ProductsView.deleteCategory(', checks:{
      'products-crud-form-and-nested-classifiers':['standaloneCategoryCreatedAndDeleted']
    }, kind:'native-ui-synthetic-delete',
    note:'حذف گروه ساختگی و بدون ارجاع از دکمه ردیف و تأیید صریح' },
  { match:'window.ExpensesView.editExpense(', checks:{
      'expense-form-category-and-posting':['draftExpenseEditedThroughForm','postedExpenseEditRejected']
    }, kind:'native-ui-draft-edit',
    note:'ویرایش پیش‌نویس ساختگی و رد ویرایش سند قطعی مالی از فرم' },
  { match:'window.AccountingView.showJournal(', checks:{
      'manual-journal-reversal-and-exports':['journalDetailsOpened']
    }, kind:'native-ui-read-only-details',
    note:'نمایش جزئیات سند قطعی ساختگی از صفحه اسناد' },
  { match:'window.AccountingView.openReversal(', checks:{
      'manual-journal-reversal-and-exports':['reversalFormOpened','reversalPosted']
    }, kind:'native-ui-reversal-form',
    note:'بازکردن فرم برگشت برای سند ساختگی و ثبت برگشت متوازن مستقل' },
  { match:"this.closest('tr').remove()", checks:{
      'manual-journal-reversal-and-exports':['journalRowRemoveButtonClicked']
    }, kind:'native-ui-draft-row-remove',
    note:'حذف ردیف اضافه از فرم پیش‌نویس بدون ثبت سند' },
  { match:'FINORA.Modal.close()', probe:'modalKeyboard',
    checks:['escapeClosesWithoutConfirm','focusReturnsToTrigger','cancelDoesNotConfirmAndRestoresFocus','nestedDialogIsolation'],
    kind:'native-shared-modal-close-contract',
    note:'رفتار مشترک بستن مودال با Escape و لغو، حفظ فوکوس و جداسازی مودال تو‌در‌تو؛ کلیک مستقیم تک‌تک دکمه‌های بستن مشاهده نشده' },
  { match:"FINORA.Router.go('invoices')", probe:'routesVisited', expected:10,
    kind:'native-route-navigation',
    note:'دسترسی واقعی به هر ۱۰ مسیر اصلی در WebView2؛ این شاهد کلیک مستقیم تک‌تک لینک‌ها نیست' }
];

function positiveEvidence(value) {
  return value === true || (typeof value === 'number' && value > 0);
}
function hasEvidence(rule, evidence) {
  if (rule.flag) return evidence[rule.flag] === true;
  if (rule.probe === 'modalKeyboard') {
    const probe = evidence.modalKeyboard || {};
    return rule.checks.every(key => probe[key] === true);
  }
  if (rule.probe === 'routesVisited') return evidence.routesVisited === rule.expected;
  if (!rule.checks) return false;
  const results = evidence.nativeFunctional || {};
  return Object.entries(rule.checks).every(([scenario, fields]) =>
    fields.every(field => positiveEvidence(results[scenario]?.[field]))
  );
}
function coverageFor(handler, evidence = {}) {
  if (!handler) return null;
  const rule = RULES.find(item => handler.includes(item.match) &&
    (!item.exclude || !handler.includes(item.exclude)) && hasEvidence(item, evidence));
  return rule ? { kind: rule.kind, scenarios: rule.scenarios || Object.keys(rule.checks || {}),
    summary: rule.note } : null;
}
function annotateAudit(audit, evidence = {}) {
  if (!audit || !Array.isArray(audit.uniqueActions) || !Array.isArray(audit.controls))
    throw Error('Q01_FIXTURE_COVERAGE_INVALID_AUDIT');
  for (const row of [...audit.uniqueActions, ...audit.controls])
    row.fixtureCoverage = coverageFor(row.handler, evidence);
  const pending = audit.uniqueActions.filter(row => row.status === 'not-clicked');
  const covered = pending.filter(row => row.fixtureCoverage);
  const uncovered = pending.filter(row => !row.fixtureCoverage);
  return {
    uniqueActionCount: audit.uniqueActions.length,
    notClicked: pending.length,
    disabled: audit.uniqueActions.filter(row => row.status === 'disabled').length,
    fixtureCoveredNotClicked: covered.length,
    withoutFixtureEvidence: uncovered.length,
    entries: covered.map(row => ({
      route: row.route, label: row.label, handler: row.handler,
      status: row.status, coverage: row.fixtureCoverage
    }))
  };
}
function buildCoverageReport(result) {
  if (!result || !Array.isArray(result.entries)) throw Error('Q01_FIXTURE_COVERAGE_INVALID_REPORT');
  const lines = [
    '# Q01 — شواهد سناریوهای مستقل برای کنترل‌های کلیک‌نشده', '',
    'این گزارش جایگزین کلیک مستقیم یا تأیید تک‌تک دکمه‌ها نیست؛ فقط شواهد مستقل همان handler یا قرارداد مشترک رابط را در نصب واقعی WebView2 نشان می‌دهد.', '',
    '- امضاهای متمایز: ' + result.uniqueActionCount,
    '- امضاهای کلیک‌نشده: ' + result.notClicked,
    '- کنترل‌های غیرفعال: ' + (result.disabled || 0),
    '- دارای شواهد سناریوی مستقل: ' + result.fixtureCoveredNotClicked,
    '- بدون شواهد سناریوی مستقل: ' + result.withoutFixtureEvidence, '',
    '| صفحه | کنترل | هندلر | نوع پوشش | شواهد |', '|---|---|---|---|---|'
  ];
  for (const row of result.entries)
    lines.push('| ' + row.route + ' | ' + row.label + ' | "' + row.handler + '" | ' +
      row.coverage.kind + ' | ' + row.coverage.summary + ' |');
  lines.push('', '- پوشش قرارداد مشترک مودال به معنی مشاهده کلیک مستقیم تک‌تک دکمه‌ها نیست.',
    '- سناریوی متد-محور به‌معنای مشاهده کلیک مستقیم دکمه نیست.',
    '- کنترل‌های فاقد نگاشت همچنان نیازمند آزمون fixture مستقل یا بررسی دستی‌اند.', '');
  return lines.join('\n');
}
module.exports = { annotateAudit, buildCoverageReport, coverageFor };
