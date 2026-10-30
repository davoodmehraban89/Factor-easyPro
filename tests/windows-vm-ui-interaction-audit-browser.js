'use strict';
// Executed as a single async expression inside an INSTALLED Tauri WebView2,
// on a disposable Windows VM after synthetic financial fixtures are created.
// This does not click destructive actions; these need separate fixture-backed
// accounting correctness tests. Never claim "all buttons work" from a sweep.
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const routes = [
    'dashboard','invoices','products','contacts','treasury',
    'cheques','expenses','reports','accounting','settings'
  ];
  const failures = [];
  const inventories = [];
  const clicks = [];
  const skipped = [];
  const all = new Map();
  const fields = new Map();
  const target = () => document.getElementById('pageContent');
  const isVisible = el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      el.getClientRects().length > 0;
  };
  const name = el => String(
    el.getAttribute('aria-label') || el.getAttribute('title') ||
    el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const handler = el => el.getAttribute('onclick') ||
    el.getAttribute('onchange') || el.getAttribute('onsubmit') || '';
  const sig = (el, route, section) => [
    route, section, el.tagName.toLowerCase(), name(el),
    handler(el).replace(/\s+/g,' ').slice(0,180)
  ].join('|');
  const dangerous = /(?:^|[.\s])(?:_?(?:save|delete|wipe|restore|post|submit|confirm|activate|seed|commit|final|approve|logout|export|import|download|print|settle|apply|reset|changeStatus|remove)\w*)\s*\(/i;
  const safeTab = /\.(?:_switchTab|switchTab|_switchPeriod|_setPreset)\s*\(/;
  const safeOpen = /\.(?:openNewInvoice|openProductModal|openUnitModal|openCategoryModal|openContactModal|openExpenseModal|openChequeModal|openAccountModal|openReceiptModal|openPaymentModal|openTransferModal|openCompanyModal|openCompanySwitcher|openExportSectionModal|openSignedLicenseModal|openAuditTrail|openWipeModal|openRestoreModal|openPeriodModal|openJournalModal|openWarehouse|openStocktakeCreate|openTransfer|openReversal|_openQuickProduct|_openQuickContact|openLedger|openKardex|openStocktake|showJournal)\s*\(/;
  const clickables = (root) => [...root.querySelectorAll(
    'button, a, [role="button"], input[type="button"], input[type="submit"], [onclick]'
  )].filter(isVisible);
  function auditFields(root, route, section) {
    if (!root) return;
    let fieldIndex = 0;
    for (const field of root.querySelectorAll(
      'input:not([type="hidden"]), select, textarea'
    )) {
      const ordinal = fieldIndex++;
      if (!isVisible(field)) continue;
      const labels=field.labels ? [...field.labels] : [];
      const explicit=!!field.getAttribute('aria-label') ||
        !!field.getAttribute('aria-labelledby') ||
        !!field.closest('label') || labels.length > 0;
      const id=field.id||'';
      const key=[route,section,ordinal,field.tagName.toLowerCase(),id,
        field.getAttribute('name')||'',field.getAttribute('type')||''].join('|');
      if (fields.has(key)) continue;
      fields.set(key,{
        route,section,ordinal,id,tag:field.tagName.toLowerCase(),
        type:field.getAttribute('type')||'',
        label:labels.map(x=>x.textContent.trim().slice(0,75)).join(' / ') ||
          field.getAttribute('aria-label') || '',
        programmaticLabel:explicit,
        placeholderOnly:!explicit && !!field.getAttribute('placeholder'),
        status:explicit?'programmatic-label-found':'needs-accessibility-review'
      });
    }
  }
  function inventory(route, section) {
    const controls = clickables(target());
    auditFields(target(),route,section);
    const records = [];
    for (const el of controls) {
      const k=sig(el,route,section);
      if (all.has(k)) continue;
      const code=handler(el);
      const accessible=!!name(el);
      const row={
        route,section,tag:el.tagName.toLowerCase(),
        label:name(el),handler:code.slice(0,220),
        disabled:!!el.disabled || el.getAttribute('aria-disabled')==='true',
        hasAccessibleName:accessible,
        className:String(el.className||'').slice(0,120),
        type:el.getAttribute('type')||'',
        status:'not-clicked',reason:''
      };
      all.set(k,row); records.push(row);
    }
    inventories.push({route,section,newControls:records.length,totalVisible:controls.length});
    return controls;
  }
  async function go(route) {
    const link=document.querySelector('#sidebarMenu [data-page="'+route+'"]');
    if (!link) throw Error('main sidebar menu item missing: '+route);
    link.click(); await wait(160);
    if (FINORA.Router.current()!==route) throw Error('sidebar click did not navigate: '+route);
    if (!target() || target().textContent.trim().length < 10 ||
      target().textContent.includes('خطا در بارگذاری صفحه')) {
      throw Error('screen blank/failed after clicking: '+route);
    }
    if (document.getElementById('finoraAuthOverlay')) throw Error('auth returned during navigation');
  }
  const noError = () => !document.querySelector('.toast-error') &&
    !target()?.textContent.includes('خطا در بارگذاری صفحه');
  function dismiss() {
    FINORA.Modal.closeAll();
    document.querySelectorAll('.toast-close').forEach(x=>x.click());
  }
  function resolveHandler(code) {
    const m=code.match(/(?:window\.)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*\(/);
    if (!m) return {detected:false,valid:null,callee:''};
    const parts=m[1].split('.');
    let obj=window;
    for (const part of parts) {
      if (obj == null) return {detected:true,valid:false,callee:m[1]};
      obj=obj[part];
    }
    return {detected:true,valid:typeof obj==='function',callee:m[1]};
  }
  const seenClick = new Set();
  async function press(el, route, section, category) {
    const k=sig(el,route,section);
    if (seenClick.has(k)) return;
    seenClick.add(k);
    const row=all.get(k);
    const before=target().innerHTML;
    const beforeModal=!!document.querySelector('.modal-backdrop');
    try {
      el.click(); await wait(180);
      if (!noError()) throw Error('error toast or page render error');
      const after=target()?.innerHTML||'';
      const afterModal=!!document.querySelector('.modal-backdrop');
      const changed = before !== after || beforeModal !== afterModal;
      clicks.push({route,section,category,label:name(el),
        handler:handler(el).slice(0,170),changed,afterModal});
      if (row) {row.status='clicked';row.reason=changed?'visible-state-changed':'no-observable-DOM-change';}
      if (!changed) {
        const expectedNoop = /\._clearFilters\(\)|\.switchTab\('journals'\)/.test(handler(el));
        if (expectedNoop) {
          if (row) row.reason='idempotent-click-on-already-selected-or-clear-filter-state';
        } else {
          failures.push({route,section,kind:'no-visible-change',
            label:name(el),handler:handler(el).slice(0,170)});
        }
      }
    } catch(error) {
      failures.push({route,section,kind:'click-error',label:name(el),error:String(error.message).slice(0,170)});
      if (row) {row.status='failed';row.reason='UI click error';}
    } finally { if (category !== 'open') dismiss(); }
  }
  // Explicit shell regression: semantic links, keyboard focus, active route,
  // persistent sidebar collapse and reversible theme toggle.
  const navLinks=[...document.querySelectorAll('#sidebarMenu a[data-page]')];
  if (navLinks.length !== routes.length) throw Error('sidebar navigation count mismatch');
  for(const link of navLinks) {
    const route=link.dataset.page;
    if(link.getAttribute('href')!=='#'+route || link.tabIndex<0 ||
       !link.getAttribute('aria-label')) throw Error('sidebar link is not keyboard accessible: '+route);
  }
  const hamburger=document.getElementById('sidebarToggleBtn');
  if(!hamburger || !hamburger.getAttribute('aria-label') ||
     hamburger.getAttribute('aria-controls')!=='sidebarMenu') {
    throw Error('sidebar accessible toggle missing');
  }
  const beforeCollapsed=document.getElementById('sidebar').classList.contains('collapsed');
  hamburger.click();await wait(70);
  const afterCollapsed=document.getElementById('sidebar').classList.contains('collapsed');
  if (beforeCollapsed===afterCollapsed ||
      localStorage.getItem('finora_pro_sidebar_collapsed')!==String(afterCollapsed) ||
      hamburger.getAttribute('aria-expanded')!==String(!afterCollapsed)) {
    throw Error('sidebar click did not persist synchronized collapsed and aria-expanded state');
  }
  hamburger.click();await wait(70);
  if(document.getElementById('sidebar').classList.contains('collapsed')!==beforeCollapsed ||
     localStorage.getItem('finora_pro_sidebar_collapsed')!==String(beforeCollapsed)) {
    throw Error('sidebar click did not restore the prior saved state');
  }
  const themeButton=document.getElementById('themeToggleBtn');
  const originalTheme=document.documentElement.getAttribute('data-theme');
  if(!themeButton || !themeButton.getAttribute('title'))throw Error('theme button missing accessible name');
  themeButton.click();await wait(50);
  if(document.documentElement.getAttribute('data-theme')===originalTheme)throw Error('theme toggle was inert');
  themeButton.click();await wait(50);
  if(document.documentElement.getAttribute('data-theme')!==originalTheme ||
     localStorage.getItem('finora_pro_theme')!==originalTheme)throw Error('theme setting not reversible/persisted');
  // Cross-app dialog behavior: nested modal focus, Escape and focus return.
  const modalTrigger=hamburger;
  modalTrigger.focus();
  if (getComputedStyle(modalTrigger).display === 'none' ||
      document.activeElement !== modalTrigger) {
    throw Error('Desktop sidebar toggle cannot receive keyboard focus before opening a dialog');
  }
  let unexpectedConfirm=false;
  FINORA.Modal.open({title:'Q01 Synthetic outer dialog',
    body:'<input id="q01ModalField" value="synthetic" />',
    footer:'<button class="btn" onclick="FINORA.Modal.close()">بستن</button>'});
  await wait(30);
  const outer=document.querySelector('.modal-card[role="dialog"][aria-modal="true"]');
  if(!outer || !outer.querySelector('[id^="finora-dialog-title-"]') ||
    !outer.contains(document.activeElement)) throw Error('outer dialog ARIA or focus absent');
  FINORA.Modal.confirm({title:'Q01 Synthetic nested confirmation',
    message:'Synthetic data only; no operation permitted',
    onConfirm:()=>{unexpectedConfirm=true;}});
  await wait(30);
  const stack=[...document.querySelectorAll('.modal-card[role="dialog"]')];
  if(stack.length!==2 || stack[0].getAttribute('aria-hidden')!=='true' ||
    !stack[1].contains(document.activeElement)) throw Error('nested dialog focus/isolation failed');
  // Check a real Tab/Shift+Tab wrap, which an accessibility contract
  // cannot prove from source alone. Neither key may escape the top dialog.
  const topControls=[...stack[1].querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
  )].filter(el=>el.getClientRects().length>0 && getComputedStyle(el).visibility!=='hidden');
  if(topControls.length<2)throw Error('nested modal focus order unexpectedly empty');
  const firstModalControl=topControls[0],lastModalControl=topControls[topControls.length-1];
  lastModalControl.focus();
  const tabForward=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});
  lastModalControl.dispatchEvent(tabForward);
  if(!tabForward.defaultPrevented || document.activeElement!==firstModalControl){
    throw Error('Tab escaped the top modal instead of wrapping to its first control');
  }
  firstModalControl.focus();
  const tabBackward=new KeyboardEvent('keydown',
    {key:'Tab',shiftKey:true,bubbles:true,cancelable:true});
  firstModalControl.dispatchEvent(tabBackward);
  if(!tabBackward.defaultPrevented || document.activeElement!==lastModalControl){
    throw Error('Shift+Tab escaped the top modal instead of wrapping to its last control');
  }
  // Simulate pressing Enter on a focused CANCEL button in an actual installed
  // WebView2 dialog. The global shortcut MUST NOT hijack it as "confirm".
  const nestedCancel=stack[1].querySelector('[data-action="cancel"]');
  if(!nestedCancel)throw Error('synthetic nested dialog cancel button missing');
  nestedCancel.focus();
  const enterOnCancel=new KeyboardEvent('keydown',
    {key:'Enter',code:'Enter',bubbles:true,cancelable:true});
  nestedCancel.dispatchEvent(enterOnCancel);
  await wait(20);
  if(enterOnCancel.defaultPrevented || unexpectedConfirm ||
      document.querySelectorAll('.modal-card').length!==2){
    throw Error('Enter on focused Cancel was hijacked as financial confirmation');
  }
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  await wait(15);
  if(document.querySelectorAll('.modal-card').length!==1 ||
    !outer.contains(document.activeElement) || unexpectedConfirm) throw Error('Escape did not dismiss nested confirm safely');
  const focusedField=document.getElementById('q01ModalField');
  if(!focusedField)throw Error('synthetic outer input missing');
  focusedField.focus();
  const enterInField=new KeyboardEvent('keydown',
    {key:'Enter',code:'Enter',bubbles:true,cancelable:true});
  focusedField.dispatchEvent(enterInField);
  await wait(20);
  if(enterInField.defaultPrevented || !outer.isConnected){
    throw Error('Enter inside form input unexpectedly submitted/dismissed dialog');
  }
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  await wait(15);
  if(document.querySelector('.modal-backdrop') || document.activeElement!==modalTrigger ||
    unexpectedConfirm) {
    const focused=document.activeElement;
    throw Error('Escape did not restore focus to original control: ' + JSON.stringify({
      remainingDialogs:document.querySelectorAll('.modal-backdrop').length,
      focusedTag:focused?.tagName,focusedId:focused?.id,
      expectedId:modalTrigger.id,unexpectedConfirm
    }));
  }
  // Open a fresh synthetic confirmation: a user clicking Cancel must NOT
  // execute the callback. Deliberate Confirm should execute exactly once.
  let syntheticConfirmed=0;
  FINORA.Modal.confirm({title:'Q01 Cancel-button regression',
    message:'No real account or customer data',
    onConfirm:()=>{syntheticConfirmed++;}});
  await wait(25);
  const cancelDialog=FINORA.Modal.stack[FINORA.Modal.stack.length-1]?.card;
  const cancelClick=cancelDialog?.querySelector('[data-action="cancel"]');
  if(!cancelClick)throw Error('synthetic Cancel action missing');
  cancelClick.focus();
  cancelClick.click();await wait(25);
  if(syntheticConfirmed!==0 || FINORA.Modal.stack.length ||
      document.activeElement!==modalTrigger){
    throw Error('Cancel click triggered financial confirm or failed to restore focus');
  }
  FINORA.Modal.confirm({title:'Q01 Confirm-button regression',
    message:'Only increment a synthetic counter',
    onConfirm:()=>{syntheticConfirmed++;}});
  await wait(25);
  const confirmDialog=FINORA.Modal.stack[FINORA.Modal.stack.length-1]?.card;
  const confirmClick=confirmDialog?.querySelector('[data-action="confirm"]');
  if(!confirmClick)throw Error('synthetic Confirm action missing');
  confirmClick.click();await wait(25);
  if(syntheticConfirmed!==1 || FINORA.Modal.stack.length){
    throw Error('synthetic Confirm callback not exactly once or dialog not dismissed');
  }
  // A confirmation message can contain user-provided contact names. It must
  // never be interpreted as HTML or create a DOM node with event handlers.
  const hostileMessage='<img src=x onerror="window.Q01_INJECTED=true">';
  FINORA.Modal.confirm({title:'Q01 text-only confirmation',
    message:hostileMessage,confirmText:hostileMessage,cancelText:hostileMessage,
    onConfirm:()=>{syntheticConfirmed++;}});
  await wait(25);
  const safeConfirm=FINORA.Modal.stack[FINORA.Modal.stack.length-1]?.card;
  if (!safeConfirm || safeConfirm.querySelector('[data-confirm-message]')?.textContent!==hostileMessage ||
      safeConfirm.querySelector('[data-action="confirm"]')?.textContent!==hostileMessage ||
      safeConfirm.querySelector('[data-action="cancel"]')?.textContent!==hostileMessage ||
      safeConfirm.querySelector('img') || window.Q01_INJECTED) {
    throw Error('Confirmation message was interpreted as executable HTML');
  }
  safeConfirm.querySelector('[data-action="cancel"]').click();
  if (syntheticConfirmed!==1 || FINORA.Modal.stack.length) {
    throw Error('Text-only confirmation Cancel executed a callback or leaked a dialog');
  }
  // A financial editor can start with an invisible radio or hidden ID field.
  // Initial focus must land on the first VISIBLE input, not a hidden element.
  FINORA.Modal.open({title:'Q01 visible-input focus regression',
    body:'<input id="q01HiddenInput" style="display:none"><input id="q01VisibleInput">'});
  await wait(25);
  if (document.activeElement?.id !== 'q01VisibleInput') {
    throw Error('Dialog initial focus landed outside first visible financial input');
  }
  FINORA.Modal.close();
  if (document.activeElement!==modalTrigger) {
    throw Error('Closing visible-input dialog did not restore keyboard focus');
  }
  // Real DOM probe: preserve ambiguous groups and explicit accessible names.
  const labelsProbe=FINORA.Modal.open({title:'Q01 Synthetic form labels',body:
    '<div class="form-group"><label class="form-label">نام آزمایشی</label><input id="q01SingleField"></div>' +
    '<div class="form-group"><label class="form-label">گروه چندفیلدی</label><input id="q01MultiOne"><input id="q01MultiTwo"></div>' +
    '<div class="form-group"><label class="form-label" for="q01ExistingField">برچسب صریح</label><input id="q01ExistingField"></div>',
    footer:'<button class="btn" onclick="FINORA.Modal.close()">بستن</button>',size:'sm'});
  await wait(25);
  const namedField=labelsProbe.card.querySelector('#q01SingleField');
  const multiOne=labelsProbe.card.querySelector('#q01MultiOne');
  const existingField=labelsProbe.card.querySelector('#q01ExistingField');
  if (namedField.labels?.length!==1 ||
      namedField.labels[0].textContent.trim()!=='نام آزمایشی' ||
      multiOne.labels?.length || existingField.labels?.length!==1 ||
      existingField.labels[0].getAttribute('for')!=='q01ExistingField') {
    throw Error('Modal form labels were missing, ambiguous, or overwrote explicit names');
  }
  namedField.labels[0].click(); await wait(15);
  if (document.activeElement!==namedField) throw Error('Linked modal field label did not focus its field');
  FINORA.Modal.close();
  // Read-only synthetic XSS exercise: no customer records are persisted.
  const expenseController=window.ExpenseController;
  const expenseView=window.ExpensesView;
  const origGetAll=expenseController.getAll;
  const origGetCategories=expenseController.getCategories;
  const origGetStats=expenseController.getStats;
  const origEditExpense=expenseView.editExpense;
  const hostileCategory='"><\/option><\/select><img src=x onerror="window.Q01_EXPENSE_HTML_ATTACK=true">';
  const hostileId="exp-test');window.Q01_EXPENSE_ID_ATTACK=true;//";
  const hostileCell='<img src=x onerror="window.Q01_EXPENSE_HTML_ATTACK=true">';
  let clickedExpenseId=null;
  try {
    expenseController.getAll=async()=>[{id:hostileId,kind:'expense',
      category:hostileCategory,description:hostileCell,
      date:hostileCell,refNumber:hostileCell,method:hostileCell,amount:100}];
    expenseController.getCategories=async()=>[hostileCategory];
    expenseController.getStats=async()=>({totalIncome:0,totalExpense:100,balance:-100,count:1});
    await expenseView.reload();
    const scratch=document.createElement('div');
    scratch.innerHTML=expenseView.renderContent();
    if(scratch.querySelector('img') || scratch.querySelector('script') ||
        scratch.querySelector('select[aria-label="سرفصل سند"] option')?.value!==hostileCategory ||
        !scratch.textContent.includes(hostileCell)) {
      throw Error('Untrusted expense list fields created executable markup or corrupted category value');
    }
    expenseView.editExpense=(id)=>{clickedExpenseId=id;};
    const edit=scratch.querySelector('button[title="ویرایش"]');
    if(!edit) throw Error('Synthetic expense action missing');
    edit.click();
    if(clickedExpenseId!==hostileId || window.Q01_EXPENSE_ID_ATTACK ||
        window.Q01_EXPENSE_HTML_ATTACK) {
      throw Error('Expense row identifier escaped the safe JS argument or executed markup');
    }
  } finally {
    expenseController.getAll=origGetAll;
    expenseController.getCategories=origGetCategories;
    expenseController.getStats=origGetStats;
    expenseView.editExpense=origEditExpense;
    await expenseView.reload();
    delete window.Q01_EXPENSE_ID_ATTACK;
    delete window.Q01_EXPENSE_HTML_ATTACK;
  }
  // Read-only adversarial invoice render: unknown imported kinds, invoice IDs,
  // number and date must never create active markup or execute row handlers.
  const invoiceView=window.InvoicesView;
  const originalEditInvoice=invoiceView.editInvoice;
  const hostileInvoiceId="inv-test');window.Q01_INVOICE_ID_ATTACK=true;//";
  const injectedKind='<img src=x onerror="window.Q01_INVOICE_HTML_ATTACK=true">';
  let editedInvoiceId=null;
  try {
    const syntheticInvoices=[{id:hostileInvoiceId,number:injectedKind,
      kind:injectedKind,contactName:injectedKind,date:injectedKind,
      grandTotal:100,paidAmount:0,remaining:100,status:'unpaid',isPreInvoice:false}];
    const frag=document.createElement('div');
    frag.innerHTML=invoiceView.renderTable(syntheticInvoices);
    if(frag.querySelector('img') || frag.querySelector('script') ||
       !frag.textContent.includes(injectedKind)) {
      throw Error('Imported invoice kind or date escaped the safe HTML rendering boundary');
    }
    invoiceView.editInvoice=(id)=>{editedInvoiceId=id;};
    const edit=frag.querySelector('button[title="ویرایش"]');
    if(!edit) throw Error('Synthetic invoice edit handler missing');
    edit.click();
    if(editedInvoiceId!==hostileInvoiceId || window.Q01_INVOICE_ID_ATTACK ||
       window.Q01_INVOICE_HTML_ATTACK) {
      throw Error('Imported invoice identifier executed unsafe inline action code');
    }
  } finally {
    invoiceView.editInvoice=originalEditInvoice;
    delete window.Q01_INVOICE_ID_ATTACK;
    delete window.Q01_INVOICE_HTML_ATTACK;
  }
  const modalKeyboard={roleAndLabel:true,nestedDialogIsolation:true,
    importedInvoiceHtmlEscaped:true,
    expenseUnsafeHtmlEscaped:true,
    modalFormLabelsLinked:true,
    confirmationTextEscaped:true,visibleInputAutoFocused:true,
    escapeClosesWithoutConfirm:true,focusReturnsToTrigger:true,
    enterOnFocusedCancelDoesNotSave:true,enterOnInputDoesNotSubmit:true,
    tabAndShiftTabStayInsideTopDialog:true,
    cancelDoesNotConfirmAndRestoresFocus:true,syntheticConfirmRunsExactlyOnce:true};
  // Notification flood: transient success/info messages should never
  // cover the dashboard. Important errors remain until explicitly dismissed.
  for(let n=0;n<9;n++) FINORA.Toast.info('Q01 synthetic notice '+n);
  const transient=document.querySelectorAll('.toast-success, .toast-info');
  if(transient.length>3)throw Error('transient notifications cover too much of the UI');
  const beforeErrors=document.querySelectorAll('.toast-error').length;
  FINORA.Toast.error('Q01 synthetic persistent error');
  if(document.querySelectorAll('.toast-error').length!==beforeErrors+1){
    throw Error('important financial error notification disappeared');
  }
  document.querySelectorAll('.toast .toast-close').forEach(button=>button.click());
  const toastResults={transientLimit:3,importantErrorsRemain:true,
    dismissButtonsWork:document.querySelectorAll('.toast').length===0};
  await FINORA.Router.go('settings');
  await wait(100);
  for(const fieldId of ['invoiceNumberingMode','invoiceNextNumber']){
    const label=document.querySelector('label[for="'+fieldId+'"]');
    const field=document.getElementById(fieldId);
    if(!label || !field) throw Error('invoice settings field label missing: '+fieldId);
    label.click();await wait(20);
    if(document.activeElement!==field) throw Error('clicking settings label did not focus: '+fieldId);
  }
  await FINORA.Router.go('dashboard');
  const shellResults={keyboardReachableSidebarLinks:navLinks.length,
    sidebarCollapseClickAndPersistence:true,themeToggleClickAndPersistence:true,
    activeRouteAriaCurrent:true,modalKeyboard,toastResults,settingsLabelFocus:true};
  for (const route of routes) {
    await go(route);
    const active=[...document.querySelectorAll('#sidebarMenu [aria-current="page"]')];
    if(active.length!==1 || active[0].dataset.page!==route){
      throw Error('active route is not announced to screen readers: '+route);
    }
    const tabs = inventory(route,'root').filter(el => !el.disabled && safeTab.test(handler(el)));
    // Evaluate each known safe top-level tab. The router is reset between
    // clicks to avoid mutating references after HTML rerendering.
    const tabActions=[...new Set(tabs.map(el=>handler(el)))];
    const contexts=[{section:'root',tabAction:null}];
    for (const action of tabActions) contexts.push({section:'tab-'+contexts.length,tabAction:action});
    for (const ctx of contexts) {
      await go(route);
      if (ctx.tabAction) {
        const tab=clickables(target()).find(el=>handler(el)===ctx.tabAction);
        if (tab) {
          inventory(route,'root');
          await press(tab,route,'root','tab');
        } else {
          failures.push({route,section:ctx.section,kind:'tab-missing',handler:ctx.tabAction});
          continue;
        }
      }
      const controls=inventory(route,ctx.section);
      // For every visible clickable control, check function resolution. This
      // inventory includes buttons we must not click indiscriminately.
      for (const el of controls) {
        const k=sig(el,route,ctx.section),row=all.get(k);
        if (!row) continue;
        const code=handler(el);
        const parsed=resolveHandler(code);
        if (parsed.detected && !parsed.valid) {
          row.status='broken-handler';row.reason='target function missing';
          failures.push({route,section:ctx.section,kind:'missing-function',callee:parsed.callee});
        } else if (el.disabled) {row.status='disabled';row.reason='disabled state';}
        else if (dangerous.test(code)) {
          row.status='not-clicked';row.reason='financial or destructive action needs explicit fixture-backed test';
        } else if (!code) {
          row.status='not-clicked';row.reason='dynamic event listener or no inline action; requires focused audit';
        } else if (!safeTab.test(code) && !safeOpen.test(code)) {
          row.status='not-clicked';row.reason='not on audited safe-action allowlist';
        }
      }
      // Open every safe modal/editor visible in this context without saving.
      const openActions=[...new Set(controls
        .filter(el=>!el.disabled && safeOpen.test(handler(el)))
        .map(el=>handler(el)))].slice(0,30);
      for (const action of openActions) {
        await go(route);
        if (ctx.tabAction) {
          const tab=clickables(target()).find(el=>handler(el)===ctx.tabAction);
          if(tab){tab.click();await wait(160);}
        }
        const el=clickables(target()).find(x=>handler(x)===action);
        if (!el) {failures.push({route,section:ctx.section,kind:'open-action-vanished',handler:action});continue;}
        inventory(route,ctx.section);
        await press(el,route,ctx.section,'open');
        const overlay=document.querySelector('.modal-backdrop');
        if(overlay) {
          const dialog=overlay.querySelector('.modal-card[role="dialog"][aria-modal="true"]');
          if(!dialog || !dialog.getAttribute('aria-labelledby') ||
              !document.getElementById(dialog.getAttribute('aria-labelledby')) ||
              !dialog.contains(document.activeElement)){
            failures.push({route,section:ctx.section,kind:'modal-a11y-missing',
              handler:action.slice(0,170)});
          }
          if (route==='expenses' && action.includes('openExpenseModal()')) {
            const real=dialog?.querySelector('#expCategory');
            if (!real || real.labels?.length!==1 ||
                !real.labels[0].textContent.includes('سرفصل')) {
              failures.push({route,section:ctx.section,kind:'expense-category-label-missing'});
            }
          }
          auditFields(overlay,route,ctx.section+'/modal');
          const nested=clickables(overlay);
          const modalControls=nested.map(x=>({
            route,section:ctx.section+'/modal',tag:x.tagName.toLowerCase(),
            label:name(x),handler:handler(x).slice(0,180),
            disabled:!!x.disabled,hasAccessibleName:!!name(x),
            status:'not-clicked',reason:'modal action; untested or requires fixture-backed input'
          }));
          modalControls.forEach(x=>{
            const key=[x.route,x.section,x.tag,x.label,x.handler].join('|');
            if(!all.has(key))all.set(key,x);
          });
          // Exercise a real cancel/close button when present.
          const cancel=nested.find(x=>/FINORA\.Modal\.close|Modal\.closeAll/.test(handler(x)) ||
            /^(انصراف|بستن|بازگشت|✕|×)$/.test(name(x)));
          if(cancel){
            cancel.click();await wait(70);
            clicks.push({route,section:ctx.section+'/modal',category:'cancel',
              label:name(cancel),handler:handler(cancel).slice(0,170),
              changed:!document.querySelector('.modal-backdrop')});
            const key=[route,ctx.section+'/modal',cancel.tagName.toLowerCase(),
              name(cancel),handler(cancel).slice(0,180)].join('|');
            const row=all.get(key);if(row)row.status='clicked';
          } else {
            // A modal without a cancel button must still be Esc-dismissable.
            document.dispatchEvent(new KeyboardEvent('keydown',
              {key:'Escape',bubbles:true,cancelable:true}));
            await wait(30);
          }
          if(document.querySelector('.modal-backdrop')){
            failures.push({route,section:ctx.section,kind:'modal-cannot-close',
              handler:action.slice(0,170)});
          }
        }
        dismiss();
      }
    }
  }
  await FINORA.Router.go('dashboard');
  const rows=[...all.values()];
  // A route/tab may render the SAME action in multiple UI states. Counting
  // each instance as a different button exaggerated the initial denominator.
  // Unique action signatures omit the tab-context but retain route, visible
  // name, inline handler and element type (including synthetic row IDs).
  const uniqueGroups=new Map();
  const actionKey=row=>JSON.stringify([row.route,row.tag,row.label,row.handler]);
  for(const row of rows){
    const key=actionKey(row);
    if(!uniqueGroups.has(key))uniqueGroups.set(key,[]);
    uniqueGroups.get(key).push(row);
  }
  // A failure on ANY context must never be hidden by a passing click on
  // another tab. Fail > broken handler > clicked > disabled > untested.
  const statusRank={failed:5,'broken-handler':4,clicked:3,disabled:1,'not-clicked':0};
  const uniqueActions=[...uniqueGroups.values()].map(group=>{
    const representative=group[0];
    const dominant=[...group].sort((a,b)=>
      (statusRank[b.status]??0)-(statusRank[a.status]??0))[0];
    for(const occurrence of group){
      if(occurrence.status==='not-clicked' && !occurrence.reason){
        occurrence.reason=group.some(x=>x.status==='clicked')
          ?'same-control-clicked-in-another-tab-context'
          :'not-reached-or-not-classified-needs-manual-test';
      }
    }
    return {
      route:representative.route,tag:representative.tag,
      label:representative.label,handler:representative.handler,
      status:dominant.status,contexts:[...new Set(group.map(x=>x.section))],
      instances:group.length,
      testedInstances:group.filter(x=>x.status==='clicked').length,
      failedInstances:group.filter(x=>x.status==='failed' || x.status==='broken-handler').length,
      whyNotVerified:dominant.status==='not-clicked'
        ?[...new Set(group.map(x=>x.reason))].join('; ').slice(0,300)
        :''
    };
  });
  const unclassifiedInstances=rows.filter(r=>r.status==='not-clicked' &&
    r.reason==='not-reached-or-not-classified-needs-manual-test').length;
  const byRoute={};
  for(const route of routes) {
    const slice=rows.filter(x=>x.route===route);
    byRoute[route]={
      discovered:slice.length,
      uniqueActionSignatures:uniqueActions.filter(x=>x.route===route).length,
      uniqueClicked:uniqueActions.filter(x=>x.route===route && x.status==='clicked').length,
      uniqueNotVerified:uniqueActions.filter(x=>x.route===route && x.status==='not-clicked').length,
      clicked:slice.filter(x=>x.status==='clicked').length,
      notClicked:slice.filter(x=>x.status==='not-clicked').length,
      brokenHandlers:slice.filter(x=>x.status==='broken-handler').length,
      missingAccessibleName:slice.filter(x=>!x.hasAccessibleName).length
    };
  }
  return {
    environment:'installed-Windows-Tauri-WebView2-synthetic-VM',
    shellResults,
    routesVisited:routes.length,routeNames:routes,
    inventoryCount:rows.length,
    uniqueActionCount:uniqueActions.length,
    uniqueActionClicked:uniqueActions.filter(x=>x.status==='clicked').length,
    uniqueActionUnverified:uniqueActions.filter(x=>x.status==='not-clicked').length,
    uniqueActionDisabled:uniqueActions.filter(x=>x.status==='disabled').length,
    uniqueActionFailed:uniqueActions.filter(x=>x.status==='failed').length,
    unclassifiedInstances,
    duplicateInstanceCount:rows.length-uniqueActions.length,
    safeClickCount:clicks.length,
    skippedCount:rows.filter(x=>x.status==='not-clicked').length,
    brokenHandlerCount:rows.filter(x=>x.status==='broken-handler').length,
    accessibilityNameGaps:rows.filter(x=>!x.hasAccessibleName).length,
    fieldsInspected:fields.size,
    fieldsMissingProgrammaticLabel:[...fields.values()].filter(x=>!x.programmaticLabel).length,
    fieldsWithoutLabels:[...fields.values()].filter(x=>!x.programmaticLabel).slice(0,100),
    fieldCoverageByRoute:Object.fromEntries(routes.map(r=>[r,{
      inspected:[...fields.values()].filter(x=>x.route===r).length,
      missingProgrammaticLabel:[...fields.values()].filter(x=>x.route===r && !x.programmaticLabel).length
    }])),
    problems:failures,
    byRoute,
    controls:rows,
    uniqueActions,
    clickEvidence:clicks,
    fieldEvidence:[...fields.values()],
    financialActionsNotBulkClicked:true,
    customerDataUsed:false,
    everyActionVerified:false
  };
})()