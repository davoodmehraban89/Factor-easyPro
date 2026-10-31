import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'src', 'views');
const viewFiles = fs.readdirSync(folder).filter(n => n.endsWith('.js'));
const views = new Map(viewFiles.map(filename => [
  path.basename(filename, '.js'),
  fs.readFileSync(path.join(folder, filename), 'utf8')
]));

test('Q01: every named inline view handler has an actual declared view method', () => {
  const missing = [];
  const refs = [];
  for (const [sourceName, source] of views) {
    // Find only declarations in the HTML/template markup, not arbitrary test
    // or controller calls that do not become user-facing controls.
    const actions = [...source.matchAll(/on(?:click|change|input|submit|mousedown|blur|focus|keyup|keydown)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)];
    for (const action of actions) {
      const handler = (action[1] || action[2] || '').replace(/\\(["'])/g, '$1');
      for (const call of handler.matchAll(/(?:window\.)?([A-Za-z_$][\w$]*(?:View|Modal))\.([A-Za-z_$][\w$]*)\s*\(/g)) {
        const viewName = call[1], method = call[2];
        refs.push({sourceName, viewName, method});
        const src = views.get(viewName);
        if (!src) {
          missing.push({sourceName, viewName, method, reason:'source-not-found'});
          continue;
        }
        const declaration = new RegExp('^\\s*(?:async\\s+)?' + method + '\\s*\\(', 'm');
        if (!declaration.test(src)) missing.push({sourceName, viewName, method, reason:'method-not-declared'});
      }
    }
  }
  assert.ok(viewFiles.length >= 10, 'unexpectedly few view files in UI inventory');
  assert.ok(refs.length >= 80, 'inline view events not sufficiently inventoried');
  assert.deepEqual(missing, [], 'declared on* handlers must resolve to real view methods');
});

test('Q01: the actual sidebar has one entry for each registered route', () => {
  const shell = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  const sidebar = [...shell.matchAll(/data-page="([a-z]+)"/g)].map(x=>x[1]);
  const registered = [...main.matchAll(/\{ name: '([a-z]+)',\s*title:/g)].map(x=>x[1]);
  assert.equal(new Set(sidebar).size, sidebar.length, 'sidebar has duplicated navigation controls');
  assert.equal(new Set(registered).size, registered.length, 'router has duplicate route definitions');
  assert.equal(sidebar.length, 10, 'navigation coverage baseline changed; update native click audit');
  assert.deepEqual(sidebar.sort(), registered.sort(), 'sidebar has missing, orphan or dead routes');
});

test('Q01: the native UI coverage runner must report unclicked controls explicitly', () => {
  const source = fs.readFileSync(path.join(root, 'tests', 'windows-vm-ui-interaction-audit-browser.js'), 'utf8');
  for (const required of [
    'routesVisited','safeClickCount','not-clicked',
    'financialActionsNotBulkClicked:true','everyActionVerified:false',
    'accessibilityNameGaps','missing-function'
  ]) {
    assert.ok(source.includes(required), 'coverage reporter missing mandatory field: '+required);
  }
  assert.ok(!source.includes('localStorage.clear()') && !source.includes('wipeAll('),
    'interaction audit must never clear the database in the installed VM');
});

test('Q01: menu controls remain keyboard-reachable with synchronized screen-reader state', () => {
  const shell = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src','main.js'), 'utf8');
  const router = fs.readFileSync(path.join(root, 'src','core','Router.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src','styles','main.css'), 'utf8');
  const navLinks = [...shell.matchAll(/<a href="#([a-z]+)" data-page="([a-z]+)"/g)];
  assert.equal(navLinks.length, 10);
  for(const match of navLinks) assert.equal(match[1], match[2]);
  assert.match(shell, /id="sidebarToggleBtn"[^>]*aria-label="[^"]+"[^>]*aria-expanded="true"[^>]*aria-controls="sidebarMenu"/);
  assert.match(main, /localStorage\.setItem\(SIDEBAR_COLLAPSED_KEY,/);
  assert.match(main, /aria-expanded/);
  assert.match(router, /aria-current/);
  assert.match(styles, /:focus-visible/);
  const desktopToggle = styles.match(/\.hamburger\s*\{([^}]*)\}/)?.[1];
  assert.ok(desktopToggle, 'desktop sidebar toggle styles not found');
  assert.match(desktopToggle, /display:\s*inline-flex\s*;/,
    'the sidebar toggle must be visible/focusable on desktop as well as mobile');
  assert.doesNotMatch(desktopToggle, /display:\s*none\s*;/);
  const nativeAudit = fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  assert.match(nativeAudit, /Desktop sidebar toggle cannot receive keyboard focus/);
});

test('Q01: shared dialogs have ARIA naming, keyboard dismissal and focus restoration contracts', () => {
  const code = fs.readFileSync(path.join(root, 'src','core','Modal.js'),'utf8');
  assert.match(code, /setAttribute\('role', 'dialog'\)/);
  assert.match(code, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(code, /setAttribute\('aria-labelledby', titleId\)/);
  assert.match(code, /event\.key === 'Escape'/);
  assert.match(code, /event\.key !== 'Tab'/);
  assert.match(code, /previousFocus\.focus/);
  assert.match(code, /const focusables = this\._focusable\(modal\.card\)/,
    'initial focus must skip hidden financial inputs');
  assert.match(code, /focusables\.find\(el => el\.matches\('input, select, textarea'\)\)/);
  assert.match(code, /\[data-confirm-message\]'\)\.textContent = String\(message \?\? ''\)/,
    'untrusted confirmation messages must be assigned as text, not HTML');
  assert.doesNotMatch(code, /\$\{message\}<\/p>/,
    'financial confirmation message must never be interpolated into innerHTML');
  assert.match(code, /cancelButton\.textContent = String\(cancelText \?\? ''\)/);
  assert.match(code, /confirmButton\.textContent = String\(confirmText \?\? ''\)/);
  assert.doesNotMatch(code, /\$\{(?:cancelText|confirmText)\}<\/button>/,
    'confirmation button labels must never become executable markup');
  assert.match(code, /addEventListener\('keydown'/);
  assert.match(code, /removeEventListener\('keydown'/);
});

test('A01: financial confirm never executes twice after Confirm/Cancel or while hidden', () => {
  const modal=fs.readFileSync(path.join(root,'src','core','Modal.js'),'utf8');
  const native=fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  const runner=fs.readFileSync(path.join(root,'tests','windows-vm-installed-tauri-cdp.cjs'),'utf8');
  assert.ok(modal.includes('let settled = false'));
  assert.ok(modal.includes('this.stack[this.stack.length - 1] === modal'));
  assert.equal(modal.split('if (settled || !isActive()) return;').length-1, 2);
  for(const token of ['confirmClick.click();','staleConfirm?.click()',
    "hiddenParent?.querySelector('[data-action=\"confirm\"]')?.click()",
    'staleFinancialConfirmIgnored:true']) {
    assert.ok(native.includes(token),'missing one-shot UI probe: '+token);
  }
  assert.ok(runner.includes('modalKeyboard.staleFinancialConfirmIgnored'));
});

test('Q01: native CDP diagnostics preserve the failing audit action and exception stack', () => {
  const cdp=fs.readFileSync(path.join(root,'tests','windows-vm-installed-tauri-cdp.cjs'),'utf8');
  const audit=fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  assert.match(cdp,/exception\.description/);
  assert.match(cdp,/detail\.stackTrace\?\.callFrames/);
  assert.match(cdp,/window\.__Q01_AUDIT_STAGE/);
  for(const token of ['safe-action:','confirm-cancel:','open-modal:','audit-completed']) {
    assert.ok(audit.includes(token),'native UI audit missing stage marker '+token);
  }
});

test('Q01: repeated WebView2 audit evaluation avoids generic global lexical names', () => {
  const audit=fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  assert.match(audit,/const q01TextOnlyConfirmCard_20261031=/);
  assert.doesNotMatch(audit,/const safeConfirm\s*=/);
  assert.ok(audit.includes('one long-lived WebView2 realm'));
});

test('Q01: dashboard and cheque tables remain usable in the installed narrow content pane', () => {
  const styles=fs.readFileSync(path.join(root,'src','styles','main.css'),'utf8');
  const cheques=fs.readFileSync(path.join(root,'src','views','ChequesView.js'),'utf8');
  const native=fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  assert.match(styles,/\.table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(styles,/@media\s*\(max-width:\s*1200px\)/);
  assert.match(styles,/\.dash-grid-main,\s*\.dash-grid-main\s*>\s*\*/);
  assert.match(styles,/\.table-wrap\[tabindex="0"\]:focus-visible/);
  assert.match(cheques,/class="table-wrap cheques-table-scroll" tabindex="0" role="region"/);
  assert.match(cheques,/aria-label="جدول چک‌ها/);
  assert.match(native,/responsive-horizontal-overflow/);
  assert.match(native,/cheque-table-horizontal-scroll-accessibility/);
});

test('Q01: deferred safe actions survive live label changes and slow tab rendering', () => {
  const audit=fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  assert.match(audit,/for\(let attempt=0;attempt<12 && !el;attempt\+\+\)/);
  assert.match(audit,/handler\(x\)===action\.handler && x\.tagName\.toLowerCase\(\)===action\.tag/);
  assert.doesNotMatch(audit,/handler\(x\)===action\.handler && name\(x\)===action\.label/);
});

test('Q01: native UI audit opens and cancels safe nested editors and restores invoice draft rows', () => {
  const audit=fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  for(const token of ['_printInvoice','InvoicePrint\\._preview','nested-safe-action-did-not-open-dialog',
    'nested-modal-cancel-did-not-restore-parent','invoice-draft-add-row-failed',
    'invoice-draft-row-count-not-restored','invoice-last-row-removal-not-blocked',
    'unsaved-contact-tag-not-added','beforeModalDepth','afterModalDepth']) {
    assert.ok(audit.includes(token),'native nested-modal audit missing: '+token);
  }
  assert.doesNotMatch(audit,/safeOpen\s*=.*_printReport|safeOpen\s*=.*_printKardex|safeOpen\s*=.*_printLedger/);
});

test('Q01: native audit verifies safe routes, filters, edit previews and cancel-only destructive prompts', () => {
  const audit=fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  for(const token of ['safeNavigate','safeFilter','safeOpen','safeConfirmAction',
    'confirm-request','confirm-cancel','confirmation-prompt-missing',
    'cancel-mutated-persistent-data','FINORA.Storage.getAll(store)',
    'safe-action-vanished','editInvoice','editProduct','editContact',
    'editCheque','runFinancialDiagnostics','checkHolooMigrationReadiness']) {
    assert.ok(audit.includes(token),'native action audit missing coverage contract: '+token);
  }
  assert.match(audit,/const confirmStores=\['users','companies','contacts','products'/);
  assert.match(audit,/category !== 'open' && category !== 'confirm-request'/);
  assert.match(audit,/_togglePreInvoice\|_setStockFilter\|_clearFilters/);
});

test('Q01: form labels are only associated within unambiguous modal groups', () => {
  const modal=fs.readFileSync(path.join(root,'src','core','Modal.js'),'utf8');
  const audit=fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  assert.match(modal, /_associateFormLabels\(card\)/);
  assert.match(modal, /fields\.length !== 1/);
  assert.match(modal, /labels\.length !== 1/);
  assert.match(modal, /field\.labels\?\.length/);
  assert.match(audit, /Modal form labels were missing, ambiguous, or overwrote explicit names/);
  assert.match(audit, /expense-category-label-missing/);
});

test('Q01: primary search and filter controls have explicit accessible names', () => {
  for (const [name, count] of [
    ['InvoicesView',3],['ProductsView',2],['ContactsView',4],['ExpensesView',5]
  ]) {
    const source=fs.readFileSync(path.join(root,'src','views',name+'.js'),'utf8');
    const names=[...source.matchAll(/aria-label="[^"]+"/g)];
    assert.ok(names.length>=count, name+' lost search/filter accessibility labels');
  }
});

test('A03: expense table escapes imported values in HTML and inline action arguments', () => {
  const src=fs.readFileSync(path.join(root,'src','views','ExpensesView.js'),'utf8');
  const native=fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  for(const fragment of [
    'this._esc(Formatters.toPersianDigits(e.date',
    'this._esc(ExpenseController.getMethodLabel(e.method))',
    'this._esc(e.refNumber ? Formatters.toPersianDigits(e.refNumber)',
    'this._esc(JSON.stringify(String(e.id ??',
    '<option value="${this._esc(c)}"'
  ]) assert.ok(src.includes(fragment), 'unescaped expense HTML found: '+fragment);
  assert.ok(native.includes('expenseUnsafeHtmlEscaped:true'));
  assert.ok(native.includes('Untrusted expense list fields created executable markup'));
  // The first category option is the legitimate 'all' filter, never the injected row.
  assert.match(native, /filter\(option=>option\.value===hostileCategory\)/);
  assert.match(native, /matchingOptions\.length!==1/);
  assert.doesNotMatch(native, /select\[aria-label="سرفصل سند"\] option'\)\?\.value!==hostileCategory/);
  assert.ok(native.includes('Expense row identifier escaped the safe JS argument'));
});

test('A03: financial list views encode imported record IDs and textual values', () => {
  const sources=['InvoicesView','ProductsView','ContactsView','TreasuryView','ChequesView'];
  for(const name of sources){
    const source=fs.readFileSync(path.join(root,'src','views',name+'.js'),'utf8');
    assert.ok(source.includes('this._esc(JSON.stringify(String('),
      name+' lacks HTML-safe JSON encoding for inline record arguments');
    assert.doesNotMatch(source,/onclick="[^"]*\('\$\{[^}]+\.id\}'\)/,
      name+' still interpolates raw IDs into JavaScript event handlers');
    assert.doesNotMatch(source,/<option value="\$\{(?:[a-zA-Z]+)\.id\}"/,
      name+' still interpolates raw IDs into option attributes');
  }
  const invoice=fs.readFileSync(path.join(root,'src','views','InvoicesView.js'),'utf8');
  assert.ok(invoice.includes('${this._esc(k.label)}'), 'unknown imported invoice kind is not HTML escaped');
  assert.ok(invoice.includes('renderTable(invoices = cache.invoices)'),
    'native adversarial test needs an isolated read-only invoice render fixture');
  const expenses=fs.readFileSync(path.join(root,'src','views','ExpensesView.js'),'utf8');
  assert.ok(expenses.includes('this._esc(JSON.stringify(String(e.id ??'));
});

test('Q01: remaining financial grid, reporting and settings inputs announce their function', () => {
  const read=name=>fs.readFileSync(path.join(root,'src','views',name+'.js'),'utf8');
  const cases=[
    ['ReportsView',['aria-label="از تاریخ گزارش"','aria-label="تا تاریخ گزارش"']],
    ['InvoiceFormView',['aria-label="جستجوی کالای ردیف فاکتور"','aria-label="نوع تخفیف ردیف"','aria-label="وضعیت پرداخت فاکتور"','aria-label="مبلغ پرداخت‌شده"']],
    ['AccountingView',['aria-label="حساب ردیف سند"','aria-label="مبلغ بدهکار ردیف"','aria-label="مبلغ بستانکار ردیف"','aria-label="شرح ردیف سند"','for="acStWarehouse"']],
    ['TreasuryView',['aria-label="جستجوی تراکنش‌های خزانه"']],
    ['ChequesView',['aria-label="جستجوی چک"','aria-label="نوع چک"','aria-label="وضعیت چک"']],
    ['SettingsView',['aria-label="تعداد صفرهای میانبر مثبت"','aria-label="متن تایید پاک کردن داده‌ها"']]
  ];
  for(const [name,labels] of cases){
    const source=read(name);
    for(const label of labels)assert.ok(source.includes(label),name+' missing programmatic name: '+label);
  }
  const runner=fs.readFileSync(path.join(root,'tests','windows-vm-installed-tauri-cdp.cjs'),'utf8');
  assert.ok(runner.includes('audit.fieldsMissingProgrammaticLabel, 0'),
    'installed WebView2 audit must require zero visible inputs without programmatic labels');
});

test('A02: Excel imports reject destructive replacement before touching master data', () => {
  const controller=fs.readFileSync(path.join(root,'src','controllers','ExcelController.js'),'utf8');
  const settings=fs.readFileSync(path.join(root,'src','views','SettingsView.js'),'utf8');
  assert.equal((controller.match(/if \(mode !== 'merge'\)/g)||[]).length,2,
    'both contact and product imports must fail closed');
  assert.doesNotMatch(controller,/if \(mode === 'replace'\)/,
    'nontransactional delete-then-import must never be reachable');
  const importModeSelect=settings.split('id="importMode">')[1]?.split('</select>')[0];
  assert.ok(importModeSelect, 'Excel import mode selector missing');
  assert.doesNotMatch(importModeSelect,/<option value="replace"/,
    'destructive Excel option must not be offered; the backup restore option is separate');
  assert.match(settings,/pending\?\.kind !== kind/);
  assert.match(settings,/data-excel-import-submit/);
  assert.doesNotMatch(settings,/_confirmImport\(\$\{JSON\.stringify\(kind\)/,
    'untrusted filenames must never be embedded as executable inline HTML');
});

test('A03: company switch, posted journals and printable ledger encode untrusted IDs', () => {
  const settings=fs.readFileSync(path.join(root,'src','views','SettingsView.js'),'utf8');
  const accounting=fs.readFileSync(path.join(root,'src','views','AccountingView.js'),'utf8');
  const ledger=fs.readFileSync(path.join(root,'src','views','ContactLedgerModal.js'),'utf8');
  assert.ok(settings.includes('this._esc(JSON.stringify(String(c.id ??'));
  assert.ok(accounting.includes('const actionArg = value => html(JSON.stringify(String(value ??'));
  assert.ok(!accounting.includes("'${html(j.id)}'"));
  assert.ok(!accounting.includes("'${html(p.id)}'"));
  assert.ok(!accounting.includes("'${html(s.id)}'"));
  assert.ok(ledger.includes('this._esc(JSON.stringify(String(contactId ??'));
  assert.ok(ledger.includes('<title>صورت‌حساب ${this._esc(contact.name)}</title>'));
  assert.doesNotMatch(ledger,/cdn\.jsdelivr\.net/);
  assert.ok(ledger.split('this._esc(Formatters.toPersianDigits(r.date').length>=3);
});

test('A02: private Excel preview releases data on cancel and blocks concurrent import', () => {
  const settings=fs.readFileSync(path.join(root,'src','views','SettingsView.js'),'utf8');
  assert.ok(settings.includes('let pendingExcelImport = null'));
  assert.ok(settings.includes('let excelImportBusy = false'));
  assert.ok(settings.includes('if (excelImportBusy) return;'));
  assert.ok(settings.includes('if (pendingExcelImport === pending) pendingExcelImport = null;'));
  assert.ok(settings.includes('submitButton.disabled = true'));
  assert.ok(settings.includes('onClose: () =>'));
  assert.doesNotMatch(settings,/window\.__import(?:RawData|Kind)/,
    'private workbook contents must never be exposed as global window properties');
});

test('Q01: Escape is handled once for nested financial dialogs and shortcut target is topmost', () => {
  const shortcuts = fs.readFileSync(path.join(root,'src','core','KeyboardShortcuts.js'),'utf8');
  const modal = fs.readFileSync(path.join(root,'src','core','Modal.js'),'utf8');
  assert.match(shortcuts, /window\.FINORA\?\.Modal\?\.stack\?\.length/);
  assert.match(shortcuts, /backdrops\[backdrops\.length - 1\]/);
  assert.match(modal, /shortcuts\.escapeCloses === false/);
  assert.match(modal, /this\.close\(\)/);
});

test('Q01: pressing plain Enter on focused Cancel, buttons or inputs must not invoke global save', () => {
  const shortcuts = fs.readFileSync(path.join(root, 'src','core','KeyboardShortcuts.js'), 'utf8');
  const nativeAudit = fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'), 'utf8');
  assert.match(shortcuts, /active !== modal\.querySelector\('\.modal-card'\)/,
    'plain Enter must only target the dialog surface, never its focused controls');
  assert.match(shortcuts, /e\.key === 'Enter' && !e\.shiftKey && this\.settings\.enterConfirms && modal/);
  assert.match(nativeAudit, /enterOnFocusedCancelDoesNotSave:true/);
  assert.match(nativeAudit, /enterOnInputDoesNotSubmit:true/);
  assert.match(nativeAudit, /'Enter on focused Cancel was hijacked as financial confirmation'/);
});

test('Q01: installed WebView2 must click synthetic modal Cancel/Confirm and trap Tab both directions', () => {
  const audit=fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  const native=fs.readFileSync(path.join(root,'tests','windows-vm-installed-tauri-cdp.cjs'),'utf8');
  for (const check of [
    'tabAndShiftTabStayInsideTopDialog:true',
    'cancelDoesNotConfirmAndRestoresFocus:true',
    'syntheticConfirmRunsExactlyOnce:true',
    'syntheticConfirmed!==0','syntheticConfirmed!==1',
    'confirmationTextEscaped:true',
    'visibleInputAutoFocused:true',
    'Dialog initial focus landed outside first visible financial input',
    'Confirmation message was interpreted as executable HTML',
    'tabForward.defaultPrevented','tabBackward.defaultPrevented'
  ]) assert.ok(audit.includes(check),'native modal control evidence missing: '+check);
  for(const check of [
    'modalKeyboard.tabAndShiftTabStayInsideTopDialog',
    'modalKeyboard.cancelDoesNotConfirmAndRestoresFocus',
    'modalKeyboard.syntheticConfirmRunsExactlyOnce'
  ]) assert.ok(native.includes(check),'installed native runner must assert: '+check);
});

test('Q01: financial mutations are not mislabeled safe by the static control catalog', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'q01-source-catalog-'));
  try {
    const output=path.join(dir,'catalog.json');
    execFileSync(process.execPath,[path.join(root,'scripts','q01-ui-control-catalog.cjs'),output],{
      cwd:root,encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']
    });
    const catalog=JSON.parse(fs.readFileSync(output,'utf8'));
    assert.ok(catalog.eventBindings>=200,'unexpectedly few view event bindings');
    assert.ok(catalog.sensitiveBindings>=40,
      'financial actions were not classified conservatively; check verb+suffix matcher');
    assert.equal(catalog.allButtonsClicked,false);
    for (const name of ['saveJournal','postDraft','deleteDraft',
      'confirmOpeningPosting','saveCheque','saveProduct','restoreBackup','confirmWipe']) {
      const matches=catalog.controls.filter(x=>x.action.includes('.'+name+'('));
      assert.ok(matches.length>0,'sensitive action not discovered: '+name);
      assert.ok(matches.every(x=>x.category==='sensitive-write-or-export'),
        'sensitive action incorrectly marked navigation: '+name);
      assert.ok(matches.every(x=>x.runtimeClicked===false),
        'source catalog must not claim runtime interaction: '+name);
    }
    const safe=catalog.controls.filter(x=>/\.(?:switchTab|_switchTab)\s*\(/.test(x.action));
    assert.ok(safe.length>0,'navigation controls not discovered');
    assert.ok(safe.some(x=>x.category==='navigation-or-other'),
      'all menu actions incorrectly categorized as financial writes');
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('Q01: filter clicks are deferred until row-scoped confirmation and editor probes finish', () => {
  const audit=fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  const queue=audit.indexOf('const deferredSafeActions=[]');
  const confirm=audit.indexOf('const confirmActions=');
  const open=audit.indexOf('const openActions=');
  const deferred=audit.indexOf('for(const group of deferredSafeActions)');
  assert.ok(queue>=0 && confirm>queue && open>confirm && deferred>open,
    'filters must not hide row targets before edit/delete confirmation probes');
  assert.ok(audit.includes('safe-tab-vanished'));
  assert.ok(audit.includes('safe-action-vanished'));
  assert.ok(audit.includes("const safeTab = /\\.(?:_switchTab|switchTab)"));
  assert.ok(audit.includes("_switchPeriod|_setPreset"));
  assert.ok(audit.includes("tabAction:tabActions[0]||null"));
  assert.ok(audit.includes("const pending=[...group.actions]"));
  assert.ok(audit.includes("for(const candidate of clickables(target()).filter(x=>"));
  assert.doesNotMatch(audit,/safeOpen = .*changeStatus|safeOpen = .*_printInvoice/);
});

test('Q01: safe navigation audit re-resolves same-handler controls by stable tag', () => {
  const audit=fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  assert.ok(audit.includes('handler:handler(el),label:name(el),tag:el.tagName.toLowerCase()'));
  assert.ok(audit.includes('handler(x)===action.handler && x.tagName.toLowerCase()===action.tag'));
  assert.ok(audit.includes('for(let attempt=0;attempt<12 && !el;attempt++)'));
  assert.ok(audit.includes('tab.click();await wait(160);'));
  assert.ok(audit.includes("safeNavigate.test(action.handler)?'navigation':'filter'"));
});

test('Q01: partial-payment amount field has an explicit associated label', () => {
  const view=fs.readFileSync(path.join(root,'src','views','InvoiceFormView.js'),'utf8');
  assert.match(view,/label for="invPaidAmount"/);
  assert.match(view,/id="invPaidAmount"/);
  assert.match(view,/مبلغ پرداخت‌شده/);
});

test('Q01: native click audit separates unique action signatures from repeated tab instances', () => {
  const audit = fs.readFileSync(path.join(root,'tests','windows-vm-ui-interaction-audit-browser.js'),'utf8');
  const native = fs.readFileSync(path.join(root,'tests','windows-vm-installed-tauri-cdp.cjs'),'utf8');
  for(const key of ['uniqueActionCount','uniqueActionClicked','uniqueActionUnverified',
    'duplicateInstanceCount','unclassifiedInstances','uniqueActions',
    'same-control-clicked-in-another-tab-context',
    'not-reached-or-not-classified-needs-manual-test']){
    assert.ok(audit.includes(key),'missing unique action audit evidence: '+key);
  }
  assert.ok(native.includes('audit.uniqueActionCount <= audit.inventoryCount'),
    'native runner must not confuse 470 UI instances with unique buttons');
  assert.ok(native.includes("x.status!=='not-clicked' || !!x.reason"),
    'every unclicked action occurrence must have a reason');
});

test('Q01: unverified-action Markdown respects deduplicated click evidence and fails closed', () => {
  const require=createRequire(import.meta.url);
  const { buildReport }=require(path.join(root,'scripts','q01-native-action-gap-report.cjs'));
  const synthetic={
    environment:'installed-Windows-Tauri-WebView2-synthetic-VM',
    everyActionVerified:false,customerDataUsed:false,
    uniqueActionCount:2,uniqueActionClicked:1,uniqueActionUnverified:1,
    uniqueActionDisabled:0,uniqueActionFailed:0,
    duplicateInstanceCount:1,inventoryCount:3,
    controls:[{},{},{}],
    uniqueActions:[
      {route:'invoices',tag:'button',label:'ثبت نهایی',handler:'InvoiceForm.save()',
        status:'not-clicked',whyNotVerified:'requires synthetic financial fixture'},
      {route:'invoices',tag:'button',label:'لغو',handler:'Modal.close()',
        status:'clicked',whyNotVerified:''}
    ],
    problems:[{route:'invoices',kind:'manual-review',label:'fixture needed'}]
  };
  const md=buildReport(synthetic);
  assert.match(md,/ثبت نهایی/);
  assert.match(md,/requires synthetic financial fixture/);
  assert.match(md,/امضاهای کنترلی متمایز \| 2/);
  assert.doesNotMatch(md,/\| لغو \| clicked/,'clicked actions do not belong in gap list');
  assert.throws(()=>buildReport({...synthetic,everyActionVerified:true}),/UNVERIFIED_INPUT/);
  assert.throws(()=>buildReport({...synthetic,inventoryCount:500}),/COUNT_MISMATCH/);
});
