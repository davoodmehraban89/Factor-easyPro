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
  const safeTab = /\.(?:_switchTab|switchTab|_switchPeriod|_setPreset|_setStockFilter|_clearFilters)\s*\(/;
  const safeOpen = /\.(?:openNewInvoice|openProductModal|openUnitModal|openCategoryModal|openContactModal|openExpenseModal|openChequeModal|openAccountModal|openReceiptModal|openPaymentModal|openTransferModal|openCompanyModal|openCompanySwitcher|openExportSectionModal|openSignedLicenseModal|openAuditTrail|openWipeModal|openRestoreModal|openPeriodModal|openJournalModal|openWarehouse|openStocktakeCreate|openTransfer|openReversal|_openQuickProduct|_openQuickContact|openLedger|openKardex|openStocktake|showJournal)\s*\(/;
  const clickables = (root) => [...root.querySelectorAll(
    'button, a, [role="button"], input[type="button"], input[type="submit"], [onclick]'
  )].filter(isVisible);
  function inventory(route, section) {
    const controls = clickables(target());
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
        failures.push({route,section,kind:'no-visible-change',label:name(el),handler:handler(el).slice(0,170)});
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
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  await wait(15);
  if(document.querySelectorAll('.modal-card').length!==1 ||
    !outer.contains(document.activeElement) || unexpectedConfirm) throw Error('Escape did not dismiss nested confirm safely');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  await wait(15);
  if(document.querySelector('.modal-backdrop') || document.activeElement!==modalTrigger ||
    unexpectedConfirm) throw Error('Escape did not restore focus to original control');
  const modalKeyboard={roleAndLabel:true,nestedDialogIsolation:true,
    escapeClosesWithoutConfirm:true,focusReturnsToTrigger:true};
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
  const byRoute={};
  for(const route of routes) {
    const slice=rows.filter(x=>x.route===route);
    byRoute[route]={
      discovered:slice.length,
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
    safeClickCount:clicks.length,
    skippedCount:rows.filter(x=>x.status==='not-clicked').length,
    brokenHandlerCount:rows.filter(x=>x.status==='broken-handler').length,
    accessibilityNameGaps:rows.filter(x=>!x.hasAccessibleName).length,
    problems:failures,
    byRoute,
    controls:rows,
    clickEvidence:clicks,
    financialActionsNotBulkClicked:true,
    customerDataUsed:false,
    everyActionVerified:false
  };
})()