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

async function nativePositiveOpeningLedger() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (value, message) => { if (!value) throw Error(message); };
  const store = FINORA.Storage;
  const company = await FINORA.Company.current();
  check(company?.id && FINORA.Auth.isAdmin(), 'Native A02 posting needs synthetic administrator');
  const period = (await store.getAll('fiscal_periods'))
    .find(x => x.companyId === company.id && x.closed === false);
  const accounts = (await store.getAll('account_chart'))
    .filter(x => x.companyId === company.id && x.postable !== false);
  const receivable = accounts.find(x => x.code === '102');
  const equity = accounts.find(x => x.code === '301');
  check(period && receivable && equity, 'Synthetic opening prerequisites missing');
  const person = await window.ContactController.create({
    name: 'شخص افتتاحیه ساختگی ویندوز', role: 'customer'
  });
  const candidate = {
    periodId: period.id, openingDate: period.startDate,
    lines: [
      { accountId: receivable.id, role: 'receivable', debit: 300, credit: 0 },
      { accountId: equity.id, role: 'equity', debit: 0, credit: 300 }
    ],
    contacts: [{ contactId: person.id, receivable: 300, payable: 0 }],
    stock: [], cash: []
  };
  await FINORA.Router.go('accounting');
  await wait(160);
  const view = window.AccountingView;
  await view.switchTab('opening');
  const attach = () => {
    const input = document.getElementById('openingFileInput');
    check(input, 'A02 native JSON picker missing');
    const file = new File([JSON.stringify(candidate)], 'vm-a02-opening.json',
      { type: 'application/json' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  };
  attach();
  await view.previewOpeningFile();
  check(view._openingReview?.readiness === 'ready-for-review' &&
    view._openingReview?.writePerformed === false &&
    view._openingReview?.issues.length === 0,
    'Balanced synthetic opening was not ready without writes');
  const priorPosted = (await store.getAll('journal_entries'))
    .filter(x => x.companyId === company.id && x.sourceType === 'opening_balance');
  check(priorPosted.length === 0, 'Preview unexpectedly posted an opening journal');
  view.confirmOpeningPosting();
  const confirmation = document.querySelector('.modal-footer [data-action="confirm"]');
  check(confirmation, 'Opening posting explicit approval was not displayed');
  confirmation.click();
  let opening = null;
  for (let i = 0; i < 80; i++) {
    opening = (await store.getAll('journal_entries')).find(x =>
      x.companyId === company.id && x.sourceType === 'opening_balance' &&
      x.sourceId === period.id && x.status === 'posted');
    if (opening) break;
    await wait(100);
  }
  check(opening && opening.debit === 300 && opening.credit === 300,
    'Confirmed synthetic opening was not posted as balanced ledger');
  const lines = (await store.getAll('journal_lines')).filter(x => x.journalId === opening.id);
  check(lines.length === 2 && lines.reduce((n, x) => n + x.debit, 0) === 300 &&
    lines.reduce((n, x) => n + x.credit, 0) === 300,
    'Opening journal lines do not match the dry-run');
  const receipt = (await store.getAll('audit_events')).filter(x =>
    x.companyId === company.id && x.eventType === 'opening_posted' && x.sourceId === opening.id);
  check(receipt.length === 1 && receipt[0].actorId === FINORA.Auth.current().id,
    'Opening journal missing unique actor-linked audit receipt');
  await view.switchTab('opening');
  attach();
  await view.previewOpeningFile();
  check(view._openingReview?.readiness === 'blocked' &&
    view._openingReview?.issues.includes('EXISTING_POSTED_JOURNALS') &&
    document.querySelector('#openingPreviewReport button[disabled]'),
    'A02 second posting attempt not disabled in native UI');
  check((await store.getAll('journal_entries')).filter(x =>
    x.companyId === company.id && x.sourceType === 'opening_balance').length === 1,
    'Repeated opening preview created another posted journal');
  await view.switchTab('journals');
  check(!document.querySelector('.toast-error'), 'Native opening workflow displayed unexpected error');
  return { dryRunFirst: true, postedBalancedOpening: true,
    actorAuditedOnce: true, repeatPostingBlocked: true };
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

async function nativePurchaseReturnGuardrails() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (ok,msg) => { if (!ok) throw Error(msg); };
  const S = FINORA.Storage;
  const original = (await S.getAll('invoices')).find(x =>
    x.kind === 'purchase' && x.financePosted && x.grandTotal === 1000);
  const contact = original && await S.get('contacts', original.contactId);
  const product = (await S.getAll('products')).find(x => x.code === 'VM-E2E-100');
  check(original && contact && product, 'A01 purchase-return source fixtures missing');
  const originalJournal = original.journalId;
  const makeReturn = async (qty, price) => {
    await FINORA.Router.go('invoices');
    await wait(200);
    await window.InvoiceFormView.open();
    await wait(140);
    document.getElementById('invKind').value = 'purchase_return';
    await window.InvoiceFormView._onKindChange();
    const source = document.getElementById('invOriginalInvoice');
    check([...source.options].some(x => x.value === original.id && !x.disabled),
      'Posted purchase not an eligible source in return form');
    source.value = original.id;
    document.getElementById('invDate').value = '1405/07/18';
    const search = document.getElementById('invContactSearch');
    search.value = contact.name;
    window.InvoiceFormView._showContactOptions(true);
    const option = document.querySelector('.contact-option[data-id="' + contact.id + '"]');
    check(option, 'Original supplier cannot be selected');
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const productSearch = document.querySelector('.row-product-search');
    productSearch.value = product.code;
    window.InvoiceFormView._showProductOptions(0, true);
    const prod = document.querySelector('.product-option[data-id="' + product.id + '"]');
    check(prod, 'Purchased product cannot be selected');
    prod.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.querySelector('.row-qty').value = String(qty);
    window.InvoiceFormView._onFieldChange(0, 'qty', String(qty));
    document.querySelector('.row-price').value = String(price);
    window.InvoiceFormView._onFieldChange(0, 'price', String(price));
    document.getElementById('invPayment').value = 'credit';
    window.InvoiceFormView._onPaymentChange();
    await window.InvoiceFormView._save(false);
    await wait(180);
  };
  await makeReturn(1, 100);
  check(!document.querySelector('.toast-error'), 'Valid supplier return showed unexpected error');
  const found = (await S.getAll('invoices')).filter(x =>
    x.kind === 'purchase_return' && x.originalInvoiceId === original.id);
  check(found.length === 1 && found[0].financePosted &&
    found[0].paidAmount === 0 && found[0].grandTotal === 100,
    'Purchase return was not correctly posted without automatic cash receipt');
  const returned = found[0];
  const ledger = await S.get('journal_entries', returned.journalId);
  check(ledger?.status === 'posted' && ledger.sourceId === returned.id,
    'Purchase return journal link missing');
  const lines = (await S.getAll('journal_lines')).filter(x => x.journalId === ledger.id);
  const debit = lines.reduce((n,x)=>n+x.debit,0);
  const credit = lines.reduce((n,x)=>n+x.credit,0);
  check(lines.length >= 2 && debit > 0 && debit === credit,
    'Native purchase return failed ledger balancing');
  check((await S.getAll('stock_movements')).some(x =>
    x.refId === returned.id && x.type === 'out' && x.productId === product.id),
    'Returned purchased inventory did not leave warehouse');
  check((await S.getAll('document_corrections')).some(x =>
    x.sourceId === original.id && x.resultId === returned.id),
    'Supplier return must be a linked correction');
  check((await S.get('invoices', original.id)).journalId === originalJournal,
    'Supplier return illegally changed source purchase');
  check(!(await S.getAll('treasury')).some(x =>
    x.recordType === 'transaction' && x.invoiceId === returned.id),
    'Supplier return created unauthorized treasury cash event');
  const before = {
    invoices:(await S.getAll('invoices')).length,
    movements:(await S.getAll('stock_movements')).length,
    audits:(await S.getAll('audit_events')).length
  };
  // 10 more units exceeds the 9 remaining, even though the proposed
  // 500-rial credit is BELOW the remaining purchase monetary cap.
  await makeReturn(10, 50);
  const toast = [...document.querySelectorAll('.toast-error')].find(x =>
    x.textContent.includes('تعداد مرجوعی'));
  check(toast, 'Over-quantity supplier return did not fail visibly');
  check((await S.getAll('invoices')).length === before.invoices &&
    (await S.getAll('stock_movements')).length === before.movements &&
    (await S.getAll('audit_events')).length === before.audits,
    'Rejected supplier return wrote an invoice, stock or audit event');
  toast.querySelector('.toast-close')?.click();
  FINORA.Modal.close();
  check(!document.querySelector('.toast-error') && !document.querySelector('.modal-backdrop'),
    'A01 supplier return negative test left UI error or modal');
  return { postedSupplierReturn:true, balancedLedger:true, stockIssued:true,
    originalPurchaseImmutable:true, noAutomaticTreasury:true,
    overReturnRejectedAtomically:true };
}

async function nativeHistoryClearFailClosed() {
  const check = (value, message) => { if (!value) throw Error(message); };
  const store = FINORA.Storage;
  const company = await FINORA.Company.current();
  check(company?.id && FINORA.Auth.isAdmin(),
    'History protection must run in installed VM with synthetic administrator');
  const preserved = {};
  for (const name of ['audit_events', 'document_corrections']) {
    const history = (await store.getAll(name))
      .filter(row => row.companyId === company.id);
    check(history.length > 0, 'Native immutable history prerequisite missing: ' + name);
    preserved[name] = history.map(row => JSON.stringify(row)).sort();
    const sentinel = 'vm-a03-aborted-clear-' + name;
    let rejected = false;
    try {
      await store.transaction(['contacts', name], async tx => {
        await tx.putRaw('contacts', {
          id: sentinel, companyId: company.id,
          name: 'VM ONLY must roll back before history clear'
        });
        await tx.clear(name);
      });
    } catch (error) {
      rejected = String(error).includes('پاک‌سازی مستقیم');
    }
    check(rejected, 'Installed IndexedDB accepted a bulk history clear: ' + name);
    check(!(await store.get('contacts', sentinel)),
      'Rejected native history-clear transaction committed earlier writes');
    const after = (await store.getAll(name))
      .filter(row => row.companyId === company.id)
      .map(row => JSON.stringify(row)).sort();
    check(JSON.stringify(after) === JSON.stringify(preserved[name]),
      'Failed clear mutated immutable history: ' + name);
  }
  check(!document.querySelector('.toast-error'),
    'Native history protection left unrelated UI error');
  return { immutableAuditClearRejected: true,
    immutableCorrectionClearRejected: true,
    bothTransactionsRolledBack: true,
    historyUnchanged: true };
}

async function nativeInactiveBankSettlementGuard() {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const check=(ok,msg)=>{if(!ok)throw Error(msg);};
  const db=FINORA.Storage,company=await FINORA.Company.current();
  check(company?.id&&FINORA.Auth.isAdmin(),'A05 native admin required');
  const contact=(await db.getAll('contacts')).find(c=>c.companyId===company.id&&c.name==='مشتری آزمایشی ویندوز');
  const active=(await db.getAll('treasury')).find(x=>x.companyId===company.id&&x.recordType==='account'&&x.ledgerAccountId&&x.isActive!==false);
  check(contact&&active,'Treasury fixtures absent');
  await FINORA.Router.go('treasury');await wait(180);
  const tv=window.TreasuryView;
  await tv.openAccountModal();
  document.getElementById('accName').value='VM-only inactive bank A05';
  document.getElementById('accInitialBalance').value='0';
  await tv.saveAccount(null);
  const secondary=(await db.getAll('treasury')).find(x=>
    x.companyId===company.id&&x.recordType==='account'&&x.name==='VM-only inactive bank A05');
  check(secondary?.ledgerAccountId,'Actual treasury account creation failed');
  await db.put('treasury',{...secondary,isActive:false});
  const counts=async()=>({
    journals:(await db.getAll('journal_entries')).length,
    payments:(await db.getAll('treasury')).filter(x=>x.recordType==='transaction').length
  });
  const before=await counts();
  tv.openTransferModal();
  check(document.getElementById('txToAccount'),'Native transfer form not open');
  document.getElementById('txDate').value='1405/07/18';
  document.getElementById('txAmount').value='40';
  document.getElementById('txFromAccount').value=active.id;
  document.getElementById('txToAccount').value=secondary.id;
  await tv._saveTransaction('transfer');
  let toast=[...document.querySelectorAll('.toast-error')].find(x=>x.textContent.includes('غیرفعال'));
  check(toast,'Inactive bank transfer did not display rejection');
  check(JSON.stringify(await counts())===JSON.stringify(before),'Rejected transfer wrote journals or cash');
  toast.querySelector('.toast-close')?.click();
  FINORA.Modal.close();
  check(!document.querySelector('.toast-error'),'Expected transfer toast not dismissed');

  // With no active bank, the real cheque status UI must reject settlement
  // without changing posted status or writing a cash receipt.
  await db.put('treasury',{...active,isActive:false});
  await FINORA.Router.go('cheques');await wait(200);
  const cv=window.ChequesView;
  await cv.openChequeModal();
  check(document.getElementById('chqSayad'),'Native cheque form absent');
  document.getElementById('chqDirection').value='inbound';
  document.getElementById('chqContact').value=contact.id;
  document.getElementById('chqSayad').value='1234567890123489';
  document.getElementById('chqAmount').value='90';
  document.getElementById('chqIssueDate').value='1405/07/18';
  document.getElementById('chqDueDate').value='1405/07/18';
  await cv.saveCheque(null);
  const cheque=(await db.getAll('cheques')).find(x=>x.companyId===company.id&&x.sayadNumber==='1234567890123489');
  check(cheque?.financePosted&&cheque.status==='pending','Native cheque posting failed');
  const journalCount=(await db.getAll('journal_entries')).length;
  await cv.changeStatus(cheque.id);
  check(document.getElementById('newStatus'),'Cheque status form missing');
  document.getElementById('newStatus').value='cleared';
  await cv._applyStatusChange(cheque.id);
  toast=[...document.querySelectorAll('.toast-error')].find(x=>
    x.textContent.includes('حساب بانک یا صندوق برای وصول چک مشخص نیست'));
  check(toast,'Cheque clearing with all banks inactive did not reject');
  check((await db.get('cheques',cheque.id)).status==='pending'&&
    (await db.getAll('journal_entries')).length===journalCount&&
    !(await db.getAll('treasury')).some(t=>t.refChequeId===cheque.id),
    'Rejected cheque clearance modified ledger or treasury');
  toast.querySelector('.toast-close')?.click();
  await db.put('treasury',active);
  await cv._applyStatusChange(cheque.id);
  check((await db.get('cheques',cheque.id)).status==='cleared'&&
    (await db.getAll('treasury')).filter(t=>t.refChequeId===cheque.id).length===1,
    'Restoring active bank did not clear cheque exactly once');
  check(!document.querySelector('.toast-error')&&!document.querySelector('.modal-backdrop'),
    'A05 native treasury scenario left error toast/modal');
  return { inactiveTransferRejected:true, invalidTransferRolledBack:true,
    disabledChequeClearingRejected:true, validChequeClearedExactlyOnce:true };
}

async function nativeTreasuryChequeReconciliation() {
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const check=(ok,msg)=>{if(!ok)throw Error(msg);};
  const storage=FINORA.Storage,company=await FINORA.Company.current();
  check(company?.id&&FINORA.Auth.isAdmin(),'A05 reconciliation requires synthetic admin');
  await FINORA.Router.go('accounting');await wait(130);
  const view=window.AccountingView;
  await view.switchTab('reconciliation');
  const original=await view.renderReconciliation();
  check(original.includes('چک‌های مالی'),'Native reconciliation does not show cheque controls');
  check(!original.includes('CHEQUE_SOURCE_JOURNAL_MISSING')&&
    !original.includes('CHEQUE_CLEARING_CASH_COUNT'),
    'Real posted VM cheque failed reconciliation before fault injection');
  // Corrupt only a synthetic fixture in the disposable native VM, never
  // alter a customer accounting record. This probes read-only detection.
  const id='vm-a05-invalid-cheque-reconciliation';
  const broken={id,companyId:company.id,financePosted:true,
    direction:'inbound',status:'cleared',amount:90,journalId:'not-there',
    statusJournalId:'not-there-either'};
  await storage.put('cheques',broken);
  const before=(await storage.getAll('journal_entries')).length;
  const checked=await view.renderReconciliation();
  check(checked.includes('CHEQUE_SOURCE_JOURNAL_MISSING')&&
    checked.includes('CHEQUE_STATUS_JOURNAL_MISSING')&&
    checked.includes('CHEQUE_CLEARING_CASH_COUNT'),
    'Native installed reconciliation failed to report malformed cheque');
  check((await storage.getAll('journal_entries')).length===before&&
    (await storage.get('cheques',id))?.status==='cleared',
    'Read-only reconciliation changed journal or cheque state');
  await storage.delete('cheques',id);
  const after=await view.renderReconciliation();
  check(!after.includes('CHEQUE_SOURCE_JOURNAL_MISSING')&&
    !after.includes('CHEQUE_CLEARING_CASH_COUNT'),
    'Reconciliation still reports synthetic cheque after fixture removal');
  await view.switchTab('journals');
  check(!document.querySelector('.toast-error'),'A05 reconciliation left toast');
  return {livePostedChequeReviewed:true,chequeDiscrepanciesDetected:true,
    reportingReadOnly:true,fixtureRemoved:true};
}

async function nativeReturnCashSettlementGuardrails() {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const check=(ok,msg)=>{if(!ok)throw Error(msg);};
  const db=FINORA.Storage,company=await FINORA.Company.current();
  const sale=(await db.getAll('invoices')).find(x=>
    x.companyId===company.id&&x.kind==='sale'&&x.grandTotal===600);
  const returned=(await db.getAll('invoices')).find(x=>
    x.companyId===company.id&&x.kind==='sale_return'&&x.originalInvoiceId===sale?.id);
  check(sale?.paidAmount===200&&returned?.grandTotal===200,
    'A01 net-refund native sale/return prerequisite absent');
  await FINORA.Router.go('treasury');await wait(170);
  const view=window.TreasuryView;
  const before=()=>Promise.all(['journal_entries','treasury','settlements'].map(async name=>
    (await db.getAll(name)).length));
  const testReceipt=async(amount)=>{
    view.openReceiptModal();
    const sel=document.getElementById('txInvoiceRef');
    check(sel&&[...sel.options].some(x=>x.value===sale.id),
      'Real treasury UI does not list the unpaid original sale');
    sel.value=sale.id;view._onInvoiceSelection();
    document.getElementById('txAmount').value=String(amount);
    document.getElementById('txDate').value='1405/07/18';
    await view._saveTransaction('receipt');
  };
  const start=await before();
  await testReceipt(201);
  let toast=[...document.querySelectorAll('.toast-error')].find(x=>x.textContent.includes('مانده خالص'));
  check(toast,'Overcollection after posted return not visibly rejected');
  check(JSON.stringify(await before())===JSON.stringify(start),
    'Rejected overcollection wrote a ledger, treasury or settlement');
  toast.querySelector('.toast-close')?.click();
  FINORA.Modal.close();
  await testReceipt(200);
  check((await db.get('invoices',sale.id)).paidAmount===400,
    'Allowed residual collection did not reach net post-return amount');
  view.openPaymentModal();
  const sel=document.getElementById('txInvoiceRef');
  check(sel&&[...sel.options].some(x=>x.value===returned.id),
    'Real treasury UI cannot select the customer return');
  sel.value=returned.id;view._onInvoiceSelection();
  document.getElementById('txAmount').value='1';
  document.getElementById('txDate').value='1405/07/18';
  const preRefund=await before();
  await view._saveTransaction('payment');
  toast=[...document.querySelectorAll('.toast-error')].find(x=>
    x.textContent.includes('بازپرداخت مجاز'));
  check(toast,'Cash refund with zero actual paid customer credit was not rejected');
  check(JSON.stringify(await before())===JSON.stringify(preRefund),
    'Rejected customer refund wrote a ledger, treasury or settlement');
  toast.querySelector('.toast-close')?.click();FINORA.Modal.close();
  check(!document.querySelector('.toast-error')&&!document.querySelector('.modal-backdrop'),
    'Native A01 cash cap left an error toast/modal');
  return {overcollectionRejectedWithoutWrites:true,netReceiptAccepted:true,
    nonexistentRefundCreditRejected:true,realTreasuryInvoiceSelector:true};
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

  // A05: another real fiscal-close attempt must still be blocked while
  // there is an unfinished draft ledger in the same isolated period.
  const draftId = 'vm-a05-unposted-draft-journal';
  await store.put('journal_entries', {
    id: draftId, companyId: company.id, periodId: period.id,
    date: '1404/06/15', status: 'draft', sourceType: 'manual',
    description: 'VM-only pending draft prevents closure'
  });
  confirmClose();
  let draftToast = null;
  for (let i = 0; i < 60; i++) {
    draftToast = [...document.querySelectorAll('.toast-error')]
      .find(x => x.textContent.includes('اسناد پیش‌نویس'));
    if (draftToast) break;
    await wait(100);
  }
  check(draftToast, 'Native fiscal closure ignored the pending draft journal');
  check((await store.get('fiscal_periods', period.id))?.closed === false,
    'Rejected draft-journal closure changed period state');
  check((await store.getAll('audit_events'))
    .filter(x => x.companyId === company.id &&
      x.eventType === 'period_closed').length === auditCount,
    'Rejected draft-journal closure wrote a successful close audit');
  draftToast.querySelector('.toast-close')?.click();
  check(!document.querySelector('.toast-error'),
    'Expected unposted-journal rejection toast remained visible');
  await store.delete('journal_entries', draftId);
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
  // Already-closed periods must not be closed again via the actual confirmation
  // action, nor silently insert another period_closed audit receipt.
  confirmClose();
  let closedToast = null;
  for (let i = 0; i < 60; i++) {
    closedToast = [...document.querySelectorAll('.toast-error')]
      .find(x => x.textContent.includes('دوره مالی بسته است'));
    if (closedToast) break;
    await wait(100);
  }
  check(closedToast, 'Duplicate native close did not visibly reject');
  check((await store.getAll('audit_events'))
    .filter(x => x.companyId === company.id &&
      x.eventType === 'period_closed' && x.sourceId === period.id).length === 1,
    'Duplicate fiscal close created a second audit receipt');
  closedToast.querySelector('.toast-close')?.click();
  check(!document.querySelector('.toast-error') && !document.querySelector('.modal-backdrop'),
    'Fiscal guardrail test left an unexpected UI error or modal');
  return {
    openStocktakeBlocked: true,
    draftJournalBlocked: true,
    failedCloseRolledBack: true,
    successfulCloseCommitted: true,
    duplicateCloseRejected: true,
    singleAuditReceipt: true
  };
}

async function openingDryRunWithExistingActivity() {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const store = FINORA.Storage;
  const company = await FINORA.Company.current();
  check(company?.id && FINORA.Auth.isAdmin(),
    'Native A02 opening dry-run requires a synthetic administrator');
  await FINORA.Router.go('accounting');
  const view = window.AccountingView;
  check(view, 'AccountingView missing in actual installed app');
  await view.switchTab('opening');
  const input = document.getElementById('openingFileInput');
  const reportHost = document.getElementById('openingPreviewReport');
  check(input && reportHost, 'Opening balance JSON dry-run form is missing');
  const periods = (await store.getAll('fiscal_periods'))
    .filter(x => x.companyId === company.id);
  const period = periods.find(x => !x.closed);
  check(period, 'An active period is required for A02 blocked historical migration test');
  const priorJournals = (await store.getAll('journal_entries'))
    .filter(x => x.companyId === company.id && x.status === 'posted');
  check(priorJournals.length > 0,
    'Financial activity prerequisite missing: opening must be blocked after posting');
  const before = {
    entries: (await store.getAll('journal_entries')).length,
    lines: (await store.getAll('journal_lines')).length,
    events: (await store.getAll('audit_events')).length,
    settings: (await store.getAll('settings')).length
  };
  const fixture = {
    periodId: period.id, openingDate: period.startDate,
    lines: [], contacts: [], stock: [], cash: []
  };
  const file = new File([JSON.stringify(fixture)], 'vm-only-a02-opening.json',
    { type: 'application/json' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  view.resetOpeningPreview();
  await view.previewOpeningFile();
  const review = view._openingReview;
  check(review && review.readiness === 'blocked' && review.writePerformed === false,
    'Native opening dry-run failed to block incompatible historical data');
  check(review.issues.includes('EXISTING_POSTED_JOURNALS') &&
    review.issues.includes('MISSING_OPENING_JOURNAL_LINES'),
    'Native blocked opening preview omitted journal issues');
  check(reportHost.textContent.includes('ثبت مسدود') &&
    reportHost.querySelector('button[disabled]'),
    'Native opening UI offered an actionable posting button despite issues');
  const after = {
    entries: (await store.getAll('journal_entries')).length,
    lines: (await store.getAll('journal_lines')).length,
    events: (await store.getAll('audit_events')).length,
    settings: (await store.getAll('settings')).length
  };
  check(JSON.stringify(before) === JSON.stringify(after),
    'Opening preview wrote to ledger, audit or settings');
  check(!document.querySelector('.toast-error'),
    'Blocked A02 dry-run unexpectedly threw rather than reporting issues');
  await view.switchTab('journals');
  return {
    priorActivityBlocked: true,
    discrepancyCodesVisible: true,
    commitActionDisabled: true,
    zeroWrites: true
  };
}

module.exports = async function nativeFunctionalMatrix(cdp) {
  const phases = [
    ['activate-accounting-and-inventory', activateAccounting],
    ['positive-opening-ledger-and-idempotency', nativePositiveOpeningLedger],
    ['purchase-and-post-ledger', purchaseInvoice],
    ['partial-sale-and-inventory', saleInvoice],
    ['inactive-treasury-cheque-settlement', nativeInactiveBankSettlementGuard],
    ['treasury-cheque-reconciliation-readonly', nativeTreasuryChequeReconciliation],
    ['sale-return-immutable-stock-and-ledger', nativeSaleReturnGuardrails],
    ['purchase-return-and-stock-guardrails', nativePurchaseReturnGuardrails],
    ['return-cash-settlement-net-credit', nativeReturnCashSettlementGuardrails],
    ['append-only-history-bulk-clear-protection', nativeHistoryClearFailClosed],
    ['backup-and-atomic-rejection', nativeBackupRestore],
    ['rtl-invoice-print-settings', invoicePrintLayout],
    ['fiscal-close-atomic-guardrails', fiscalCloseGuardrails],
    ['opening-dry-run-rejects-existing-postings', openingDryRunWithExistingActivity]
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
