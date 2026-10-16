'use strict';
// Browser-side functions are stringified and executed in the INSTALLED Tauri
// WebView2. Every write is synthetic and isolated to a disposable CI VM.
const assert = require('node:assert/strict');

async function activateAccounting() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (value, message) => { if (!value) throw Error(message); };
  check(!document.getElementById('finoraAuthOverlay'), 'admin login must finish');
  await FINORA.Router.go('accounting');
  await wait(220);
  const view = window.AccountingView;
  check(view && document.getElementById('pageContent')?.textContent.includes('حسابداری دوبل'),
    'actual accounting route missing');
  await view.switchTab('periods');
  if (!view.periods.length) {
    view.openPeriodModal();
    check(document.getElementById('acPeriodName'), 'fiscal period form absent');
    document.getElementById('acPeriodName').value = 'دوره تست ویندوز ۱۴۰۵';
    document.getElementById('acPeriodStart').value = '1405/01/01';
    document.getElementById('acPeriodEnd').value = '1405/12/29';
    await view.savePeriod();
  }
  check(view.periods.length > 0, 'period did not persist');
  await view.switchTab('accounts');
  if (!view.accounts.some(account => account.code === '402')) {
    view.seedChart();
    const confirm = document.querySelector('.modal-footer [data-action="confirm"]');
    check(confirm, 'chart seed approval missing');
    confirm.click();
    for (let i = 0; i < 35 && !view.accounts.some(a => a.code === '402'); i++) await wait(150);
  }
  check(view.accounts.some(account => account.code === '402'), 'default chart missing account 402');
  await view.switchTab('integration');
  if (!document.getElementById('accountingWorkbench')?.textContent.includes('یکپارچه فعال است')) {
    view.activateRetail();
    const confirm = document.querySelector('.modal-footer [data-action="confirm"]');
    check(confirm, 'activation approval missing');
    confirm.click();
    for (let i = 0; i < 35 && !document.getElementById('accountingWorkbench')?.textContent.includes('یکپارچه فعال است'); i++) await wait(150);
  }
  check(document.getElementById('accountingWorkbench')?.textContent.includes('یکپارچه فعال است'),
    'finance and retail integration not active');
  view.openWarehouse();
  check(document.getElementById('acWhName'), 'warehouse form missing');
  document.getElementById('acWhName').value = 'انبار ماشین مجازی';
  await view.saveWarehouse();
  check((await FINORA.Storage.getAll('warehouses')).some(w => w.name === 'انبار ماشین مجازی'),
    'warehouse did not persist');
  return { fiscalPeriods: view.periods.length, accountCount: view.accounts.length,
    integration: 'enabled', warehouse: 'created' };
}

async function purchaseInvoice() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (value, message) => { if (!value) throw Error(message); };
  const c = await window.ContactController.create({ name: 'مشتری آزمایشی ویندوز', role: 'both' });
  const p = await window.ProductController.createProduct({
    name: 'کالای تست ویندوز', code: 'VM-E2E-100',
    trackInventory: true, buyPrice: 100, sellPrice: 200
  });
  await FINORA.Router.go('invoices');
  await wait(300);
  await window.InvoiceFormView.open();
  await wait(180);
  check(document.getElementById('invWarehouse'), 'invoice warehouse selector missing');
  document.getElementById('invKind').value = 'purchase';
  await window.InvoiceFormView._onKindChange();
  document.getElementById('invDate').value = '1405/07/18';
  const contact = document.getElementById('invContactSearch');
  contact.value = c.name;
  window.InvoiceFormView._showContactOptions(true);
  const item = document.querySelector('.contact-option[data-id="' + c.id + '"]');
  check(item, 'contact autocomplete could not select synthetic contact');
  item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  const search = document.querySelector('.row-product-search');
  check(search, 'product autocomplete absent');
  search.value = p.code;
  window.InvoiceFormView._showProductOptions(0, true);
  const chosen = document.querySelector('.product-option[data-id="' + p.id + '"]');
  check(chosen, 'product autocomplete selection failed');
  chosen.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  document.querySelector('.row-qty').value = '10';
  window.InvoiceFormView._onFieldChange(0, 'qty', '10');
  document.querySelector('.row-price').value = '100';
  window.InvoiceFormView._onFieldChange(0, 'price', '100');
  await window.InvoiceFormView._save(false);
  await wait(160);
  const invoice = (await FINORA.Storage.getAll('invoices'))
    .find(x => x.contactId === c.id && x.kind === 'purchase');
  check(invoice?.financePosted, 'purchase financial posting failed');
  check((await FINORA.Storage.getAll('journal_entries'))
    .some(j => j.sourceId === invoice.id && j.status === 'posted'), 'purchase ledger source missing');
  check((await FINORA.Storage.getAll('stock_movements'))
    .some(m => m.refId === invoice.id && m.type === 'in'), 'purchase inventory receipt missing');
  check(!document.querySelector('.modal-backdrop'), 'purchase invoice modal stayed open');
  return { purchaseAmount: invoice.grandTotal, purchasePosted: true, stockReceived: true };
}

async function saleInvoice() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (value, message) => { if (!value) throw Error(message); };
  await FINORA.Router.go('treasury');
  await wait(200);
  if (!(await FINORA.Storage.getAll('treasury')).some(t => t.recordType === 'account')) {
    await window.TreasuryView.openAccountModal();
    document.getElementById('accName').value = 'صندوق ویندوز';
    document.getElementById('accInitialBalance').value = '0';
    await window.TreasuryView.saveAccount(null);
  }
  const accounts = (await FINORA.Storage.getAll('treasury')).filter(t => t.recordType === 'account');
  check(accounts.some(a => a.ledgerAccountId), 'treasury subledger not mapped');
  const cash = accounts.find(a => a.ledgerAccountId);
  const contact = (await FINORA.Storage.getAll('contacts'))
    .find(x => x.name === 'مشتری آزمایشی ویندوز');
  const product = (await FINORA.Storage.getAll('products'))
    .find(x => x.code === 'VM-E2E-100');
  check(contact && product, 'purchase fixtures missing');
  await FINORA.Router.go('invoices'); await wait(230);
  await window.InvoiceFormView.open(); await wait(170);
  document.getElementById('invKind').value = 'sale';
  await window.InvoiceFormView._onKindChange();
  document.getElementById('invDate').value = '1405/07/18';
  const personSearch = document.getElementById('invContactSearch');
  personSearch.value = contact.name;
  window.InvoiceFormView._showContactOptions(true);
  const personOption = document.querySelector('.contact-option[data-id="' + contact.id + '"]');
  check(personOption, 'sale customer picker failed');
  personOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  const prodSearch = document.querySelector('.row-product-search');
  prodSearch.value = product.code;
  window.InvoiceFormView._showProductOptions(0, true);
  const prodOption = document.querySelector('.product-option[data-id="' + product.id + '"]');
  check(prodOption, 'sale product picker failed');
  prodOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  document.querySelector('.row-qty').value = '3';
  window.InvoiceFormView._onFieldChange(0, 'qty', '3');
  document.querySelector('.row-price').value = '200';
  window.InvoiceFormView._onFieldChange(0, 'price', '200');
  document.getElementById('invPayment').value = 'partial';
  window.InvoiceFormView._onPaymentChange();
  document.getElementById('invPaidAmount').value = '200';
  window.InvoiceFormView._recalc();
  await window.InvoiceFormView._save(false); await wait(160);
  const sale = (await FINORA.Storage.getAll('invoices'))
    .find(i => i.kind === 'sale' && i.contactId === contact.id);
  check(sale?.financePosted, 'sale was not financially posted');
  check(sale.paidAmount === 200 && sale.remaining === 400,
    'sale partial settlement incorrect: ' + JSON.stringify({ paid: sale.paidAmount, remaining: sale.remaining }));
  const lines = await FINORA.Storage.getAll('journal_lines');
  check(lines.some(l => l.accountId === cash.ledgerAccountId && l.debit === 200),
    'partial settlement cash journal missing');
  check((await FINORA.Storage.getAll('stock_movements'))
    .some(m => m.refId === sale.id && m.type === 'out'), 'stock issue not posted');
  return { salePaid: 200, saleRemaining: 400, salePosted: true, cashLedger: true };
}

async function nativeSaleReturnGuardrails() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const S = FINORA.Storage;
  const sale = (await S.getAll('invoices'))
    .find(i => i.kind === 'sale' && i.financePosted && i.grandTotal === 600);
  const contact = sale && await S.get('contacts', sale.contactId);
  const product = (await S.getAll('products')).find(p => p.code === 'VM-E2E-100');
  check(sale && contact && product, 'Posted original sale fixture is required');
  const originalAmount = sale.grandTotal;
  const originalPaid = sale.paidAmount;
  const buildReturn = async (qty, price) => {
    await FINORA.Router.go('invoices');
    await wait(220);
    await window.InvoiceFormView.open();
    await wait(160);
    const kind = document.getElementById('invKind');
    check(kind, 'Native return invoice form missing');
    kind.value = 'sale_return';
    await window.InvoiceFormView._onKindChange();
    const reference = document.getElementById('invOriginalInvoice');
    check([...reference.options].some(x => x.value === sale.id),
      'Posted sale does not appear as the reference invoice');
    reference.value = sale.id;
    document.getElementById('invDate').value = '1405/07/18';
    const contactSearch = document.getElementById('invContactSearch');
    contactSearch.value = contact.name;
    window.InvoiceFormView._showContactOptions(true);
    const contactItem = document.querySelector('.contact-option[data-id="' + contact.id + '"]');
    check(contactItem, 'Cannot select original customer in return form');
    contactItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const productSearch = document.querySelector('.row-product-search');
    check(productSearch, 'Return product search field missing');
    productSearch.value = product.code;
    window.InvoiceFormView._showProductOptions(0, true);
    const selected = document.querySelector('.product-option[data-id="' + product.id + '"]');
    check(selected, 'Original sold product not selectable');
    selected.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.querySelector('.row-qty').value = String(qty);
    window.InvoiceFormView._onFieldChange(0, 'qty', String(qty));
    document.querySelector('.row-price').value = String(price);
    window.InvoiceFormView._onFieldChange(0, 'price', String(price));
    document.getElementById('invPayment').value = 'credit';
    window.InvoiceFormView._onPaymentChange();
    await window.InvoiceFormView._save(false);
    await wait(170);
  };

  await buildReturn(1, 200);
  check(!document.querySelector('.toast-error'), 'Valid return showed an unexpected error');
  const returns = (await S.getAll('invoices')).filter(x =>
    x.kind === 'sale_return' && x.originalInvoiceId === sale.id);
  check(returns.length === 1 && returns[0].financePosted &&
    returns[0].grandTotal === 200 && returns[0].paidAmount === 0,
    'Native return did not post a separate unpaid credit document');
  const returned = returns[0];
  const journal = await S.get('journal_entries', returned.journalId);
  check(journal?.status === 'posted' && journal.sourceId === returned.id,
    'Native sales return lacks its own posted ledger journal');
  const lines = (await S.getAll('journal_lines')).filter(x => x.journalId === journal.id);
  check(lines.length >= 2 && lines.reduce((n, x) => n + x.debit, 0) > 0 &&
    lines.reduce((n, x) => n + x.debit, 0) ===
      lines.reduce((n, x) => n + x.credit, 0),
    'Return journal has invalid debit/credit balance');
  check((await S.getAll('stock_movements'))
    .some(x => x.refId === returned.id && x.type === 'in' && x.productId === product.id),
    'Native sales return did not receive returned inventory');
  check((await S.getAll('document_corrections')).some(x =>
    x.sourceId === sale.id && x.resultId === returned.id),
    'Return correction did not link to its immutable original');
  check(!(await S.getAll('treasury')).some(x => x.invoiceId === returned.id &&
    x.recordType === 'transaction'),
    'Native return illegally generated an automatic refund');
  const unchanged = await S.get('invoices', sale.id);
  check(unchanged.grandTotal === originalAmount && unchanged.paidAmount === originalPaid &&
    unchanged.financePosted, 'Posted source sale mutated during return');
  const beforeInvalid = {
    returns: (await S.getAll('invoices')).filter(x => x.kind === 'sale_return' &&
      x.originalInvoiceId === sale.id).length,
    stock: (await S.getAll('stock_movements')).length,
    audits: (await S.getAll('audit_events')).length
  };

  // Quantity 3 would exceed the 2 units remaining from the original sale,
  // while its 300 rial value is still below the remaining financial cap.
  await buildReturn(3, 100);
  let error = [...document.querySelectorAll('.toast-error')].find(x =>
    x.textContent.includes('تعداد مرجوعی'));
  check(error, 'Over-return quantity did not produce its expected UI rejection');
  check((await S.getAll('invoices')).filter(x => x.kind === 'sale_return' &&
    x.originalInvoiceId === sale.id).length === beforeInvalid.returns,
    'Over-return created an extra financial invoice');
  check((await S.getAll('stock_movements')).length === beforeInvalid.stock &&
    (await S.getAll('audit_events')).length === beforeInvalid.audits,
    'Rejected over-return left stock or audit side effects');
  error.querySelector('.toast-close')?.click();
  FINORA.Modal.close();
  check(!document.querySelector('.toast-error') && !document.querySelector('.modal-backdrop'),
    'Return guardrail left an error toast or modal after expected rejection');
  return {
    separatePostedReturn: true,
    balancedLedgerAndReturnedStock: true,
    postedOriginalImmutable: true,
    noAutomaticCashRefund: true,
    overReturnRejectedWithoutWrites: true
  };
}

async function nativeBackupRestore() {
  const check = (value, message) => { if (!value) throw Error(message); };
  const S = FINORA.Storage;
  const company = (await S.getAll('companies'))[0];
  const temporary = await S.put('contacts', {
    id: 'native-vm-backup-roundtrip', companyId: company.id, name: 'فقط آزمون بازگردانی'
  });
  const snapshot = await S.exportAll();
  check(snapshot.version === 7 && snapshot.app === 'Factor-easyPro',
    'invalid native backup envelope');
  check(snapshot.data.contacts.some(x => x.id === temporary.id),
    'native backup omitted test contact');
  check(snapshot.data.users.every(u => !('pwHash' in u) && !('pwSalt' in u)),
    'native backup leaked user password derivation metadata');
  await S.delete('contacts', temporary.id);
  check(!(await S.get('contacts', temporary.id)), 'test contact was not deleted');
  await S.importAll({
    app: snapshot.app, version: snapshot.version,
    data: { contacts: snapshot.data.contacts.filter(c => c.id === temporary.id) }
  });
  check((await S.get('contacts', temporary.id))?.name === 'فقط آزمون بازگردانی',
    'native backup restore did not recover contact');

  const sale = (await S.getAll('invoices')).find(i => i.kind === 'sale' && i.financePosted);
  check(sale, 'posted sale missing for restore immutability');
  let denied = false;
  try {
    await S.importAll({
      app: snapshot.app, version: snapshot.version,
      data: {
        contacts: [{id:'should-rollback-native',companyId:company.id,name:'Reject'}],
        invoices: [{...sale,grandTotal:sale.grandTotal+1}]
      }
    });
  } catch (_) { denied = true; }
  check(denied, 'tampered posted sale backup must fail');
  check(!(await S.get('contacts','should-rollback-native')),
    'rejected full backup wrote a contact anyway');
  check((await S.get('invoices',sale.id)).grandTotal===sale.grandTotal,
    'tampered posted sale modified the actual financial document');
  return { backupSchema: snapshot.version, credentialsExcluded: true,
    contactRoundtrip: true, tamperedInvoiceRejectedAtomically: true };
}

async function invoicePrintLayout() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (value, message) => { if (!value) throw Error(message); };
  const sale = (await FINORA.Storage.getAll('invoices'))
    .find(x => x.kind === 'sale' && x.financePosted);
  check(sale, 'posted invoice for print preview missing');
  await FINORA.Router.go('invoices');
  await wait(200);
  await window.InvoicesView.printInvoice(sale.id);
  await wait(320);
  const dialog = document.querySelector('.modal-backdrop');
  check(dialog, 'native print settings dialog did not open');
  const labels = dialog.textContent || '';
  check(labels.includes('قالب چاپ') && labels.includes('A4'),
    'RTL print template or paper settings missing');
  check(document.documentElement.dir === 'rtl',
    'document is not marked RTL');
  FINORA.Modal.close();
  return { rtl: true, printSettings: true, templates: true,
    physicalPrinterTest: 'not-covered' };
}

async function fiscalCloseGuardrails() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const store = FINORA.Storage;
  const company = await FINORA.Company.current();
  check(company?.id && FINORA.Auth.isAdmin(), 'Fiscal close test must use a synthetic admin');
  await FINORA.Router.go('accounting');
  await wait(180);
  const view = window.AccountingView;
  check(view, 'Native accounting view was not mounted');
  await view.switchTab('periods');
  const testName = 'A05 VM-only guarded closing period';
  view.openPeriodModal();
  check(document.getElementById('acPeriodName'), 'Fiscal period creation form missing');
  document.getElementById('acPeriodName').value = testName;
  document.getElementById('acPeriodStart').value = '1404/01/01';
  document.getElementById('acPeriodEnd').value = '1404/12/29';
  await view.savePeriod();
  check(!document.querySelector('.toast-error'), 'Creating isolated fiscal period failed');
  const period = (await store.getAll('fiscal_periods'))
    .find(x => x.companyId === company.id && x.name === testName);
  check(period && period.closed === false, 'Synthetic fiscal period did not persist as open');
  const warehouses = (await store.getAll('warehouses')).filter(x => x.companyId === company.id);
  check(warehouses.length, 'Warehouse prerequisite missing');
  const stocktakeId = 'vm-a05-draft-stocktake';
  await store.put('stocktakes', {
    id: stocktakeId, companyId: company.id,
    warehouseId: warehouses[0].id, status: 'draft'
  });
  const auditCount = (await store.getAll('audit_events'))
    .filter(x => x.companyId === company.id && x.eventType === 'period_closed').length;
  const confirmClose = () => {
    view.closePeriod(period.id);
    const confirm = document.querySelector('.modal-footer [data-action="confirm"]');
    check(confirm, 'Real fiscal closure approval dialog missing');
    confirm.click();
  };
  confirmClose();
  let message = null;
  for (let i = 0; i < 60; i++) {
    message = [...document.querySelectorAll('.toast-error')]
      .find(x => x.textContent.includes('انبارگردانی باز'));
    if (message) break;
    await wait(100);
  }
  check(message, 'Closing with an open stocktake was not rejected visibly');
  check((await store.get('fiscal_periods', period.id))?.closed === false,
    'Open stocktake allowed fiscal closure');
  check((await store.getAll('audit_events'))
    .filter(x => x.companyId === company.id && x.eventType === 'period_closed').length === auditCount,
    'Rejected fiscal closing created an audit receipt');
  message.querySelector('.toast-close')?.click();
  check(!document.querySelector('.toast-error'), 'Expected fiscal rejection toast remained');
  await store.delete('stocktakes', stocktakeId);
  confirmClose();
  let closed = null;
  for (let i = 0; i < 70; i++) {
    closed = await store.get('fiscal_periods', period.id);
    if (closed?.closed) break;
    await wait(100);
  }
  check(closed?.closed === true && closed.status === 'closed',
    'Approved fiscal close was not committed');
  const closureAudits = (await store.getAll('audit_events'))
    .filter(x => x.companyId === company.id &&
      x.eventType === 'period_closed' && x.sourceId === period.id);
  check(closureAudits.length === 1 &&
    closureAudits[0].actorId === FINORA.Auth.current().id,
    'Successful fiscal closure did not produce exactly one actor-scoped audit');
  check(!document.querySelector('.toast-error') && !document.querySelector('.modal-backdrop'),
    'Fiscal guardrail test left an unexpected UI error or modal');
  return {
    openStocktakeBlocked: true,
    failedCloseRolledBack: true,
    successfulCloseCommitted: true,
    singleAuditReceipt: true
  };
}

module.exports = async function nativeFunctionalMatrix(cdp) {
  const phases = [
    ['activate-accounting-and-inventory', activateAccounting],
    ['purchase-and-post-ledger', purchaseInvoice],
    ['partial-sale-and-inventory', saleInvoice],
    ['sale-return-immutable-stock-and-ledger', nativeSaleReturnGuardrails],
    ['backup-and-atomic-rejection', nativeBackupRestore],
    ['rtl-invoice-print-settings', invoicePrintLayout],
    ['fiscal-close-atomic-guardrails', fiscalCloseGuardrails]
  ];
  const report = {};
  for (const [name, fn] of phases) {
    const value = await cdp.evaluate('(' + fn.toString() + ')()');
    assert.ok(value && typeof value === 'object', 'invalid native E2E result from ' + name);
    report[name] = value;
    console.log('NATIVE E2E PASSED: ' + name + ': ' + JSON.stringify(value));
  }
  return report;
};
