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
  assert.match(code, /\[data-confirm-message\]'\)\.textContent = String\(message \?\? ''\)/,
    'untrusted confirmation messages must be assigned as text, not HTML');
  assert.doesNotMatch(code, /\$\{message\}<\/p>/,
    'financial confirmation message must never be interpolated into innerHTML');
  assert.match(code, /addEventListener\('keydown'/);
  assert.match(code, /removeEventListener\('keydown'/);
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
