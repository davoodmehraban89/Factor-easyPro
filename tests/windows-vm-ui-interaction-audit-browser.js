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
  const dangerous = /\b(?:delete|wipe|remove|restore|save|post|submit|confirm|activate|seed|commit|final|approve|closePeriod|logout|export|import|download|print|settle|apply|reset|changeStatus|_save|_apply|_commit)\s*\(/i;
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
    } finally {dismiss();}
  }
  for (const route of routes) {
    await go(route);
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