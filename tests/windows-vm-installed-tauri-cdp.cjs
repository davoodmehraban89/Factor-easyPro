'use strict';
// Real installed Tauri/WebView2 native-process smoke on a disposable Windows Actions VM.
// Runs against a real NSIS-installed .exe, NOT the Vite preview page.
// No production data, no publication, and no password/sensitive payload in reports.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const verifyNativeFunctionalMatrix = require('./windows-vm-native-functional-matrix.cjs');
const { verifyNativeOrigin } = require('./windows-vm-native-origin.cjs');

const [exe, profile, mode, expectedVersion, reportPath] = process.argv.slice(2);
assert.equal(process.platform, 'win32');
assert.ok(['seed','upgrade','reopen','fresh','benchmark','crash-arm','crash-verify'].includes(mode), 'unknown lab mode');
assert.ok(fs.existsSync(exe), 'installed Windows executable missing');
fs.mkdirSync(profile, { recursive: true });
const port = mode === 'seed' ? 9371 : mode === 'upgrade' ? 9372 : mode === 'reopen' ? 9374 : mode === 'benchmark' ? 9375 : mode === 'crash-arm' ? 9376 : mode === 'crash-verify' ? 9377 : 9373;
const PASSWORD = 'VmOnly-Factor-83471!'; // Synthetic password, never printed.

const REG_POLICY = [
  'HKCU\\Software\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments',
  'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments'
];
const EXE_NAME = path.basename(exe);
function setDebugPolicies() {
  const active = [];
  for (const key of REG_POLICY) {
    try {
      // Newer WebView2 runtimes may ignore the environment variable for
      // CDP debugging. Microsoft documents the per-EXE policy alternative.
      execFileSync('reg.exe', [
        'add', key, '/v', EXE_NAME, '/t', 'REG_SZ', '/d',
        '--remote-debugging-port=' + port + ' --remote-allow-origins=*', '/f'
      ], { stdio: 'ignore', timeout: 5000 });
      active.push(key);
    } catch (_) { /* Fall back to the documented WebView2 environment variable. */ }
  }
  return active;
}
function cleanDebugPolicies(keys) {
  for (const key of keys) {
    try {
      execFileSync('reg.exe', ['delete', key, '/v', EXE_NAME, '/f'],
        { stdio: 'ignore', timeout: 5000 });
    } catch (_) {}
  }
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(fn, timeoutMs = 65000, delayMs = 300) {
  let last;
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { const result = await fn(); if (result) return result; }
    catch (error) { last = error; }
    await wait(delayMs);
  }
  throw last || Error('Timed out waiting for installed native app');
}
async function getPages() {
  const response = await fetch('http://127.0.0.1:' + port + '/json', {
    signal: AbortSignal.timeout(1500)
  });
  if (!response.ok) throw Error('CDP returned ' + response.status);
  return response.json();
}
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Native WebView2 CDP websocket timeout')), 12000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(Error('WebView2 CDP connection failed')); }, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const reply = JSON.parse(event.data);
    const current = pending.get(reply.id);
    if (!current) return;
    clearTimeout(current.timer); pending.delete(reply.id);
    if (reply.error) current.reject(Error(JSON.stringify(reply.error)));
    else current.resolve(reply.result);
  });
  const command = (method, params = {}, timeoutMs = 12000) => new Promise((resolve, reject) => {
    const next = ++id;
    const timer = setTimeout(() => { pending.delete(next); reject(Error('CDP ' + method + ' timed out')); }, timeoutMs);
    pending.set(next, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async (expression, timeoutMs = 12000) => {
    const r = await command('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true
    }, timeoutMs);
    if (r.exceptionDetails) throw Error('Native UI exception: ' + r.exceptionDetails.text);
    if (r.result?.subtype === 'error') throw Error('Native UI rejected JavaScript evaluation');
    return r.result?.value;
  };
  await command('Page.enable');
  await command('Runtime.enable');
  return { command, evaluate, close: () => ws.close() };
}
(async () => {
  const report = {
    mode, exe: path.basename(exe), expectedVersion,
    vm: 'github-windows-latest', installedNativeTauri: false,
    cdpReady: false, login: 'not-run', indexedDb: 'not-run', persistence: 'not-run',
    dpapi: 'not-run', browserOrigin: null, status: 'FAILED'
  };
  let proc, cdp;
  let debugPolicyKeys = [];
  try {
    debugPolicyKeys = setDebugPolicies();
    report.debugPolicyKeysApplied = debugPolicyKeys.length;
    const env = {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
        '--remote-debugging-port=' + port + ' --remote-allow-origins=*',
      WEBVIEW2_USER_DATA_FOLDER: profile
    };
    proc = spawn(exe, [], { env, stdio: 'ignore', windowsHide: false });
    proc.on('error', error => { report.processError = error.message; });
    const url = await eventually(async () => {
      const pages = await getPages();
      return pages.find(x => x.type === 'page' && x.webSocketDebuggerUrl &&
        !x.url.startsWith('devtools://'))?.webSocketDebuggerUrl;
    });
    cdp = await connect(url);
    report.cdpReady = true;
    const ready = await eventually(async () => cdp.evaluate(
      '(function(){return window.FINORA && document.getElementById("finoraAuthOverlay") && !!globalThis.__TAURI_INTERNALS__?.invoke ? { title:document.title, version:window.FINORA.version, href:location.href, initialMode:document.getElementById("faTitle").textContent, databaseReady:true } : null})()'
    ), 65000);
    report.installedNativeTauri = true;
    report.browserOrigin = verifyNativeOrigin(ready.href);
    report.displayedVersion = ready.version;
    report.versionMatchesPackage = ready.version === expectedVersion;
    // Verified against git tag v2.0.3: that shipped src/main.js hardcodes
    // FINORA.version = '1.1.1' despite package/installer version 2.0.3.
    // Record the existing release defect but continue data-preservation checks.
    if (mode === 'seed' && expectedVersion === '2.0.3' &&
        ready.version === '1.1.1') {
      report.knownLegacyVersionLabelDefect = 'public-2.0.3-displays-1.1.1';
    } else {
      assert.equal(ready.version, expectedVersion, 'candidate build runtime version mismatch');
    }
    const setup = ready.initialMode.includes('تعیین رمز');
    if (mode === 'seed' || mode === 'fresh' || mode === 'benchmark' || mode === 'crash-arm') {
      assert.equal(setup, true, 'a new native profile must prompt to set the administrator password');
    } else {
      assert.equal(setup, false, 'upgrade/reopen should preserve existing administrator credentials');
    }
    await cdp.evaluate('(() => {' +
      'document.getElementById("faUser").value="مدیر";' +
      'document.getElementById("faPass").value=' + JSON.stringify(PASSWORD) + ';' +
      'if(document.getElementById("faPass2").style.display!=="none") document.getElementById("faPass2").value=' + JSON.stringify(PASSWORD) + ';' +
      'document.getElementById("faSubmit").click();return "submitted"})()');
    await eventually(async () => cdp.evaluate(
      'document.getElementById("finoraAuthOverlay") ? null : (window.FINORA && document.getElementById("pageContent") ? true : null)'
    ), 65000);
    report.login = setup ? 'first-run-admin-setup-passed' : 'existing-admin-password-passed';

    if (mode === 'crash-arm') {
      const source = fs.readFileSync(
        path.join(__dirname, 'windows-vm-native-crash-import-browser.js'), 'utf8');
      const armed = await cdp.evaluate(source, 90000);
      assert.equal(armed.scenario, 'real-StorageService.importAll-mid-write');
      assert.equal(armed.armed, true);
      assert.equal(armed.committed, false);
      assert.ok(armed.staged >= 20 && armed.staged < armed.total,
        'A04 restore must be actively staging before process termination');
      // Kill the *real Windows native process tree*, including WebView2, not
      // just abort an IndexedDB request or throw a JS exception.
      assert.ok(proc?.pid, 'Real native process PID missing for crash test');
      execFileSync('taskkill.exe', ['/PID', String(proc.pid), '/T', '/F'],
        { stdio: 'ignore', timeout: 30000 });
      report.crashInjected = { realWindowsProcessKilled: true,
        restoreInProgress: true, stagedBeforeCrash: armed.staged };
      report.status = 'PASSED';
      return;
    }
    if (mode === 'crash-verify') {
      const result = await cdp.evaluate(`(async () => {
        const rows=(await FINORA.Storage.getAll('contacts'))
          .filter(x=>typeof x.id==='string' && x.id.startsWith('vm-a04-crash-contact-'));
        return { partialRows: rows.length,
          dbVersion: (await FINORA.Storage.init()).version,
          signedIn: !document.getElementById('finoraAuthOverlay') };
      })()`, 60000);
      assert.deepEqual(result, { partialRows: 0, dbVersion: 7, signedIn: true },
        'Forced termination left partial restored contacts or lost login');
      report.crashRollback = 'killed-real-installed-Windows-WebView2-during-importAll-no-partial-rows-on-restart';
      report.status = 'PASSED';
      return;
    }

    if (mode === 'seed') {
      const seeded = await cdp.evaluate('(async()=>{' +
        'const S=FINORA.Storage;' +
        'await S.put("products",{id:"vm-upgrade-product",companyId:"company_default",name:"Synthetic VM product",sellPrice:123456});' +
        'await S.put("invoices",{id:"vm-upgrade-draft",companyId:"company_default",kind:"sale",isPreInvoice:true,financePosted:false,grandTotal:987654,paidAmount:0,remaining:987654});' +
        'const db=await S.init();' +
        // Real v2.0.3 backup format: all stores, v6 schema, credentials excluded.
        // Keep a synthetic backup only in the disposable Windows profile so the
        // upgraded app can test restoring the OLD version without cloud artifacts.
        'const snapshot=await S.exportAll();' +
        'await S.put("settings",{id:"vm-legacy-backup",companyId:"company_default",payload:snapshot});' +
        'return {version:db.version,products:(await S.getAll("products")).length,amount:(await S.get("invoices","vm-upgrade-draft")).grandTotal,' +
        'backupVersion:snapshot.version,backupApp:snapshot.app,' +
        'backupContainsProduct:snapshot.data.products.some(p=>p.id==="vm-upgrade-product"),' +
        'backupContainsInvoice:snapshot.data.invoices.some(i=>i.id==="vm-upgrade-draft"),' +
        'backupCredentialsExcluded:!snapshot.data.users.some(u=>"pwHash" in u||"pwSalt" in u)};' +
      '})()');
      assert.equal(seeded.version, 6, 'old release should have IndexedDB v6');
      assert.equal(seeded.amount, 987654);
      assert.equal(seeded.backupVersion, 6);
      assert.equal(seeded.backupApp, 'Factor-easyPro');
      assert.equal(seeded.backupContainsProduct, true);
      assert.equal(seeded.backupContainsInvoice, true);
      assert.equal(seeded.backupCredentialsExcluded, true);
      report.legacyBackup = 'real-v2.0.3-snapshot-saved-in-test-profile';
      report.indexedDb = 'v6-written';
      report.persistence = 'synthetic-legacy-fixtures-created';
    } else if (mode === 'upgrade' || mode === 'reopen') {
      const restored = await cdp.evaluate('(async()=>{' +
        'const S=FINORA.Storage, db=await S.init();' +
        'const product=await S.get("products","vm-upgrade-product");' +
        'const invoice=await S.get("invoices","vm-upgrade-draft");' +
        'return {version:db.version,product:product?.name,amount:invoice?.grandTotal,' +
        'audits:(await S.getAll("audit_events")).length,corrections:db.objectStoreNames.contains("document_corrections")};' +
      '})()');
      assert.equal(restored.version, 7);
      assert.equal(restored.product, 'Synthetic VM product');
      assert.equal(restored.amount, 987654);
      assert.equal(restored.audits, mode === 'upgrade' ? 0 : 1,
        'migration must not fabricate history; an explicitly created event must persist after restart');
      assert.equal(restored.corrections, true);
      report.indexedDb = mode === 'upgrade' ?
        'real-WebView2-v6-to-v7-passed' : 'persisted-real-WebView2-v7-on-restart';
      report.persistence = 'product-invoice-and-login-survived-upgrade';
      if (mode === 'upgrade') {
      // Exercise the actual importer in the INSTALLED Tauri WebView2 process.
      // Intentionally delete only the synthetic draft and product, restore an
      // older real v6 snapshot, verify both records, and assert a corrupted
      // snapshot cannot produce partial writes.
      const recovery = await cdp.evaluate('(async()=>{' +
        'const S=FINORA.Storage;' +
        'const snapshot=(await S.get("settings","vm-legacy-backup"))?.payload;' +
        'if(!snapshot || snapshot.version!==6) throw Error("v2.0.3 backup not persisted");' +
        'await S.delete("products","vm-upgrade-product");' +
        'await S.delete("invoices","vm-upgrade-draft");' +
        'const emptyBefore=!(await S.get("products","vm-upgrade-product"))&&!(await S.get("invoices","vm-upgrade-draft"));' +
        'await S.importAll(snapshot);' +
        'const p=await S.get("products","vm-upgrade-product");' +
        'const i=await S.get("invoices","vm-upgrade-draft");' +
        'const tampered=structuredClone(snapshot);' +
        'tampered.data.products.push({...p,id:"vm-would-rollback"});' +
        'tampered.data.invoices.push({...i,grandTotal:1});' +
        'let blocked=false;' +
        'try {await S.importAll({...tampered,app:"foreign-finance"});}catch(e){blocked=true;}' +
        'return {emptyBefore,restoredProduct:p?.name,restoredInvoice:i?.grandTotal,' +
        'blockedBadApp:blocked,afterBadApp:(await S.get("products","vm-would-rollback"))??null,' +
        'databaseVersion:(await S.init()).version};' +
      '})()');
      assert.deepEqual(recovery, {
        emptyBefore:true,restoredProduct:'Synthetic VM product',
        restoredInvoice:987654,blockedBadApp:true,afterBadApp:null,
        databaseVersion:7
      });
      report.backupRecovery = 'actual-v2.0.3-v6-snapshot-restored-on-installed-v7';
      report.invalidBackup = 'foreign-app-rejected-no-writes';

      const immutable = await cdp.evaluate('(async()=>{' +
        'const S=FINORA.Storage;' +
        'const audit={id:"vm-audit-immutable",companyId:"company_default",' +
        'commandKey:"company_default:vm-native-test",eventType:"journal_posted",' +
        'actorId:"user_admin",sourceId:"vm-upgrade-draft",safeSummary:{lineCount:2}};' +
        'await S.importAll({app:"Factor-easyPro",version:6,data:{audit_events:[audit]}});' +
        'const stored=await S.get("audit_events",audit.id);' +
        'let refused=false;' +
        'try {await S.importAll({app:"Factor-easyPro",version:7,data:{' +
        'products:[{id:"vm-should-roll-back",companyId:"company_default",name:"No partial writes"}],' +
        'audit_events:[{...stored,eventType:"period_closed"}]}});}' +
        'catch(e){refused=true;}' +
        'return {refused,product:(await S.get("products","vm-should-roll-back"))??null,' +
        'auditType:(await S.get("audit_events",audit.id)).eventType};' +
      '})()');
      assert.deepEqual(immutable, {
        refused:true,product:null,auditType:'journal_posted'
      });
      report.immutableRestoreRollback = 'full-restore-transaction-rolled-back-on-audit-conflict';
      }
      if (mode === 'reopen') {
        const persisted = await cdp.evaluate('(async()=>{' +
          'const S=FINORA.Storage;' +
          'const audit=await S.get("audit_events","vm-audit-immutable");' +
          'return {product:(await S.get("products","vm-upgrade-product"))?.name,' +
          'invoice:(await S.get("invoices","vm-upgrade-draft"))?.grandTotal,' +
          'auditType:audit?.eventType,dbVersion:(await S.init()).version};' +
        '})()');
        assert.deepEqual(persisted, {
          product:'Synthetic VM product', invoice:987654,
          auditType:'journal_posted', dbVersion:7
        });
        report.persistence = 'v6-backup-recovery-and-audit-survived-real-native-restart';
      }
    } else {
      const fresh = await cdp.evaluate('(async()=>{' +
        'const S=FINORA.Storage, db=await S.init();' +
        'return {version:db.version,admin:(await S.get("users","user_admin"))?.role};' +
      '})()');
      assert.equal(fresh.version, 7);
      assert.equal(fresh.admin, 'admin');
      report.indexedDb = 'fresh-native-v7-passed';
      report.persistence = 'not-applicable';
    }

    if (mode !== 'seed') {
      const dpapi = await cdp.evaluate('(async()=>{' +
        'const invoke=globalThis.__TAURI_INTERNALS__.invoke;' +
        'const source="Synthetic DPAPI verification value";' +
        'const cipher=await invoke("protect_local_state",{value:source});' +
        'const recovered=await invoke("unprotect_local_state",{value:cipher});' +
        'return {roundtrip:recovered===source,encrypted:cipher!==source,hex:/^[0-9a-f]+$/i.test(cipher)};' +
      '})()');
      assert.deepEqual(dpapi, {roundtrip:true,encrypted:true,hex:true});
      report.dpapi = 'native-Windows-roundtrip-passed';
    }
    if (mode === 'fresh') {
      // The real installed desktop window, not the browser-only preview:
      // verify accounting activation, financial journal, stock, backup and RTL.
      report.nativeFunctional = await verifyNativeFunctionalMatrix(cdp);
    }
    if (mode === 'fresh') {
      // Verify encrypted .fbackup BEFORE sweeping all 10 native UI routes.
      // Intentional wrong-password toast/dialog are dismissed through the UI;
      // unexpected errors still fail the following navigation regression.
      const script = fs.readFileSync(
        path.join(__dirname, 'windows-vm-encrypted-company-backup-browser.js'), 'utf8'
      );
      const validated = await cdp.evaluate(script);
      assert.deepEqual(validated, {
        encryptedEnvelope: true,
        filenameSuffix: '.fbackup',
        wrongPasswordRejected: true,
        tamperedCiphertextRejectedWithoutWrites: true,
        lateFinancialValidationRolledBack: true,
        sameCompanyRestore: true,
        restoredContact: true,
        restoreAudited: true,
        plaintextSensitiveDataAbsent: true
      });
      report.encryptedCompanyBackup =
        'native-SettingsUI-AES-GCM-PBKDF2-wrong-password-and-audited-restore-passed';
    }
    if (mode === 'fresh') {
      // Drive synthetic records, complete snapshot replay and every SPA route
      // inside the actually installed Tauri WebView2, not Vite preview.
      const ui = await cdp.evaluate("(async () => {\n  const ensure = (pass, message) => { if (!pass) throw Error(message); };\n  ensure(!document.getElementById('finoraAuthOverlay'), 'Cannot test UI before login');\n  const person = await window.ContactController.create({\n    name: 'شخص آزمایشی ماشین مجازی', role: 'both'\n  });\n  const product = await window.ProductController.createProduct({\n    name: 'کالای آزمایشی ماشین مجازی', code: 'WINDOWS-VM-LAB',\n    buyPrice: 150, sellPrice: 250, trackInventory: true\n  });\n  const db = window.FINORA.Storage;\n  const before = {\n    contacts: (await db.getAll('contacts')).length,\n    products: (await db.getAll('products')).length\n  };\n  ensure((await db.get('contacts',person.id))?.name === 'شخص آزمایشی ماشین مجازی',\n    'Contact did not persist in the native app');\n  ensure((await db.get('products',product.id))?.sellPrice === 250,\n    'Product did not persist in the native app');\n  const snapshot = await db.exportAll();\n  ensure(snapshot.version === 7 && snapshot.app === 'Factor-easyPro',\n    'Native snapshot identity/version mismatch');\n  ensure(snapshot.data.users.every(u => !u.pwHash && !u.pwSalt && !u.pass),\n    'Credential hash leaked into plain export');\n  ensure(snapshot.data.contacts.some(c => c.id === person.id) &&\n    snapshot.data.products.some(p => p.id === product.id),\n    'Native snapshot missing committed master data');\n  ensure(await db.importAll(snapshot) === true,\n    'Native full snapshot replay did not succeed');\n  const after = {\n    contacts: (await db.getAll('contacts')).length,\n    products: (await db.getAll('products')).length\n  };\n  ensure(before.contacts === after.contacts && before.products === after.products,\n    'Snapshot replay duplicated a contact or product');\n  const routes = [\n    'dashboard', 'invoices', 'products', 'contacts', 'treasury',\n    'cheques', 'expenses', 'reports', 'accounting', 'settings'\n  ];\n  const pages = [];\n  for (const route of routes) {\n    await FINORA.Router.go(route);\n    const view = document.getElementById('pageContent');\n    const text = (view?.textContent || '').trim();\n    ensure(FINORA.Router.current() === route, 'Unexpected route: ' + route);\n    ensure(text.length > 10, 'Empty page: ' + route);\n    ensure(!text.includes('خطا در بارگذاری صفحه'),\n      'Router reported a page rendering error: ' + route);\n    ensure(!document.querySelector('.toast-error'),\n      'Error toast while navigating to: ' + route);\n    pages.push({route, renderedCharacters: text.length});\n  }\n  await FINORA.Router.go('dashboard');\n  ensure(!document.getElementById('finoraAuthOverlay'),\n    'Navigation unexpectedly returned to authentication overlay');\n  return {masterData:before, backup:'plain-no-credentials-replay-idempotent',\n    routes:pages, visibleVersion:FINORA.version};\n})()", 45000);
      assert.equal(ui.routes.length, 10);
      assert.equal(ui.visibleVersion, expectedVersion);
      report.nativeUI = ui;
      try {
        const screen = await cdp.command('Page.captureScreenshot', {
          format: 'png', captureBeyondViewport: false, fromSurface: true
        });
        if (!screen?.data) throw Error('No PNG image data');
        const filename = path.join(path.dirname(reportPath), 'fresh-native-dashboard.png');
        fs.writeFileSync(filename, Buffer.from(screen.data, 'base64'));
        report.screenshot = path.basename(filename);
      } catch (screenshotError) {
        // A screenshot is NOT claimed as verified if native CDP denies it.
        report.screenshot = 'UNVERIFIED: ' + screenshotError.message;
      }
    }
    if (mode === 'fresh') {
      // Q01: click every safe, visible route/tab/form opener in the installed
      // WebView2 (not only a preview). Financial writes remain separately
      // guarded by the real synthetic functional matrix already run above.
      const auditSource = fs.readFileSync(
        path.join(__dirname, 'windows-vm-ui-interaction-audit-browser.js'), 'utf8');
      const audit = await cdp.evaluate(auditSource, 240000);
      assert.equal(audit.environment, 'installed-Windows-Tauri-WebView2-synthetic-VM');
      assert.equal(audit.routesVisited, 10);
      assert.equal(audit.shellResults.keyboardReachableSidebarLinks, 10);
      assert.equal(audit.shellResults.sidebarCollapseClickAndPersistence, true);
      assert.equal(audit.shellResults.themeToggleClickAndPersistence, true);
      assert.equal(audit.shellResults.activeRouteAriaCurrent, true);
      assert.equal(audit.shellResults.modalKeyboard.nestedDialogIsolation, true);
      assert.equal(audit.shellResults.modalKeyboard.modalFormLabelsLinked, true);
      assert.equal(audit.shellResults.modalKeyboard.expenseUnsafeHtmlEscaped, true);
      assert.equal(audit.shellResults.modalKeyboard.importedInvoiceHtmlEscaped, true);
      assert.equal(audit.shellResults.modalKeyboard.excelReplacementRejectedWithoutWrites, true);
      assert.equal(audit.shellResults.modalKeyboard.financialLedgerContentEscaped, true);
      assert.equal(audit.shellResults.modalKeyboard.escapeClosesWithoutConfirm, true);
      assert.equal(audit.shellResults.modalKeyboard.focusReturnsToTrigger, true);
      assert.equal(audit.shellResults.modalKeyboard.visibleInputAutoFocused, true);
      assert.equal(audit.problems.filter(x=>x.kind==='modal-a11y-missing').length, 0,
        'An opened financial dialog failed to move keyboard focus inside itself');
      assert.equal(audit.shellResults.modalKeyboard.enterOnFocusedCancelDoesNotSave, true);
      assert.equal(audit.shellResults.modalKeyboard.enterOnInputDoesNotSubmit, true);
      assert.equal(audit.shellResults.modalKeyboard.tabAndShiftTabStayInsideTopDialog, true);
      assert.equal(audit.shellResults.modalKeyboard.cancelDoesNotConfirmAndRestoresFocus, true);
      assert.equal(audit.shellResults.modalKeyboard.syntheticConfirmRunsExactlyOnce, true);
      assert.equal(audit.shellResults.toastResults.importantErrorsRemain, true);
      assert.equal(audit.shellResults.toastResults.dismissButtonsWork, true);
      assert.ok(audit.inventoryCount >= 25, 'Too few visible controls discovered');
      assert.ok(audit.uniqueActionCount >= 20 &&
        audit.uniqueActionCount <= audit.inventoryCount,
        'Unique action signatures have an invalid or unexpectedly small count');
      assert.ok(audit.uniqueActionClicked <= audit.uniqueActionCount &&
        audit.uniqueActionUnverified <= audit.uniqueActionCount,
        'Unique action status totals exceed unique action signatures');
      assert.equal(audit.duplicateInstanceCount,
        audit.inventoryCount-audit.uniqueActionCount);
      assert.ok(audit.controls.every(x=>x.status!=='not-clicked' || !!x.reason),
        'Every nonclicked control must have a machine-readable reason');
      assert.ok(audit.fieldsInspected >= 15, 'Visible form-field inventory unexpectedly small');
      assert.ok(Number.isInteger(audit.fieldsMissingProgrammaticLabel), 'No programmatic label coverage reported');
      assert.ok(audit.fieldsMissingProgrammaticLabel <= 5,
        'Financial field accessible labels regressed: '+audit.fieldsMissingProgrammaticLabel);
      assert.ok(audit.safeClickCount >= 15, 'Safe interaction coverage unexpectedly low');
      assert.equal(audit.customerDataUsed, false);
      assert.equal(audit.financialActionsNotBulkClicked, true);
      assert.equal(audit.everyActionVerified, false,
        'A safe-navigation sweep cannot claim every financial action is verified');
      report.nativeControlAudit = {
        routesVisited: audit.routesVisited, shellResults: audit.shellResults,
        inventoryCount: audit.inventoryCount,
        uniqueActionCount: audit.uniqueActionCount,
        uniqueActionClicked: audit.uniqueActionClicked,
        uniqueActionUnverified: audit.uniqueActionUnverified,
        uniqueActionDisabled: audit.uniqueActionDisabled,
        uniqueActionFailed: audit.uniqueActionFailed,
        duplicateInstanceCount: audit.duplicateInstanceCount,
        unclassifiedInstances: audit.unclassifiedInstances,
        safeClickCount: audit.safeClickCount, skippedCount: audit.skippedCount,
        accessibilityNameGaps: audit.accessibilityNameGaps,
        fieldsInspected: audit.fieldsInspected,
        fieldsMissingProgrammaticLabel: audit.fieldsMissingProgrammaticLabel,
        fieldCoverageByRoute: audit.fieldCoverageByRoute,
        brokenHandlerCount: audit.brokenHandlerCount,
        problems: audit.problems.length, byRoute: audit.byRoute,
        evidenceFile: 'fresh-native-ui-control-click-audit.json',
        claim: 'safe-clicks-and-inventory-only-not-every-button-verified'
      };
      fs.writeFileSync(path.join(path.dirname(reportPath),
        report.nativeControlAudit.evidenceFile),
        JSON.stringify(audit, null, 2), { flag: 'wx' });
      // The Markdown matrix is for owner/QA review and includes every
      // remaining unique action with its route, reason and handler.
      const gapReport=require('../scripts/q01-native-action-gap-report.cjs').buildReport(audit);
      report.nativeControlAudit.gapReportFile='q01-native-unverified-controls.md';
      fs.writeFileSync(path.join(path.dirname(reportPath),
        report.nativeControlAudit.gapReportFile),gapReport,{flag:'wx'});
      const routeScreenshots = [];
      for (const route of audit.routeNames) {
        await cdp.evaluate('FINORA.Router.go(' + JSON.stringify(route) + ')', 20000);
        const screen = await cdp.command('Page.captureScreenshot', {
          format: 'png', captureBeyondViewport: false, fromSurface: true
        }, 20000);
        assert.ok(screen?.data, 'Screenshot missing for route ' + route);
        const image = Buffer.from(screen.data, 'base64');
        assert.ok(image.length > 1000 && image.subarray(1,4).toString('ascii') === 'PNG',
          'Bad native WebView2 PNG for route ' + route);
        const filename = 'q01-ui-' + route + '.png';
        fs.writeFileSync(path.join(path.dirname(reportPath), filename), image, { flag: 'wx' });
        routeScreenshots.push(filename);
      }
      report.nativeControlAudit.routeScreenshots = routeScreenshots;
      await cdp.evaluate('FINORA.Router.go("dashboard")');
    }
    if (mode === 'fresh') {
      // A07: emulate a disconnected WebView2 network on the REAL installed app.
      // This is stronger than jsdom/offline browser preview but not an OS
      // Wi-Fi disable, physical power loss, or a disconnected customer device.
      await cdp.command('Network.enable');
      await cdp.command('Network.emulateNetworkConditions', {
        offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0
      });
      try {
        const offline = await cdp.evaluate(`(async () => {
          if (navigator.onLine !== false) throw Error('WebView2 offline emulation did not set navigator offline');
          const routes = [
            'dashboard','invoices','products','contacts','treasury',
            'cheques','expenses','reports','accounting','settings'
          ];
          const timings = [];
          for (const route of routes) {
            const t = performance.now();
            await FINORA.Router.go(route);
            const body = (document.getElementById('pageContent')?.textContent || '').trim();
            if (FINORA.Router.current() !== route || body.length <= 10 ||
                body.includes('خطا در بارگذاری صفحه') ||
                document.querySelector('.toast-error') ||
                document.getElementById('finoraAuthOverlay')) {
              throw Error('Installed app route failed while offline: ' + route);
            }
            timings.push({ route, milliseconds: Math.round(performance.now() - t) });
          }
          await FINORA.Router.go('dashboard');
          return { simulatedOffline: !navigator.onLine, routesChecked: timings.length,
            routeDurationsMs: timings };
        })()`, 45000);
        assert.equal(offline.simulatedOffline, true);
        assert.equal(offline.routesChecked, 10);
        assert.equal(offline.routeDurationsMs.length, 10);
        report.nativeOffline = offline;
      } finally {
        // Preserve the runner's network state for post-run evidence upload.
        await cdp.command('Network.emulateNetworkConditions', {
          offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1
        });
      }
    }
    if (mode === 'benchmark') {
      // A08 performance sample from the actually installed NSIS/Tauri/WebView2
      // binary with a brand-new disposable profile, not Node fake-indexeddb.
      // The separate profile prevents benchmark fixtures from affecting
      // upgrade, accounting or restoration tests.
      const code = fs.readFileSync(
        path.join(__dirname, 'windows-vm-native-performance-browser.js'), 'utf8'
      );
      // CDP is attached to the actual installed Windows WebView2 renderer.
      // JS heap is not total process RSS or Windows working set; record
      // accurately, without claiming physical memory or SLA verification.
      const beforeHeap = await cdp.command('Runtime.getHeapUsage', {}, 30000);
      const measured = await cdp.evaluate(code, 240000);
      const afterHeap = await cdp.command('Runtime.getHeapUsage', {}, 30000);
      assert.equal(measured.products, 10000);
      assert.equal(measured.invoices, 50000);
      assert.equal(measured.companyInvoices, 50000);
      assert.equal(measured.environment, 'installed-Tauri-WebView2-IndexedDB');
      assert.ok(measured.timingsMs.seedProducts >= 0 &&
        measured.timingsMs.seedInvoices >= 0 &&
        measured.timingsMs.companyInvoiceReadP95 >= 0 &&
        measured.timingsMs.snapshotExport >= 0);
      const validHeap = item =>
        Number.isSafeInteger(item?.usedSize) && item.usedSize >= 0 &&
        Number.isSafeInteger(item?.totalSize) && item.totalSize >= item.usedSize;
      assert.ok(validHeap(beforeHeap) && validHeap(afterHeap),
        'A08 installed WebView2 JS heap size metrics are not valid');
      measured.jsHeapBytes = {
        beforeUsed: beforeHeap.usedSize,
        afterUsed: afterHeap.usedSize,
        afterAllocated: afterHeap.totalSize,
        usedChange: afterHeap.usedSize - beforeHeap.usedSize
      };
      measured.jsHeapScope = 'renderer-js-heap-not-total-Windows-process-memory';
      report.nativePerformance = measured;
    }
    if (mode === 'fresh') {
      // LAST operation: real installed WebView2 PDF engine, using production
      // RTL formal-invoice renderer with 110 synthetic items only.
      const code = fs.readFileSync(
        path.join(__dirname, 'windows-vm-native-print-pdf-browser.js'), 'utf8');
      const template = await cdp.evaluate(code, 60000);
      assert.equal(template.itemRows, 110);
      const printed = await cdp.command('Page.printToPDF', {
        printBackground: true, preferCSSPageSize: true,
        displayHeaderFooter: false
      }, 90000);
      assert.ok(printed?.data, 'Installed WebView2 returned no PDF');
      const pdf = Buffer.from(printed.data, 'base64');
      assert.ok(pdf.length > 10000 && pdf.subarray(0, 5).toString('ascii') === '%PDF-',
        'Invalid WebView2 PDF result');
      const pages = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
      assert.ok(pages >= 2, 'Invoice PDF is not multipage: ' + pages);
      const filename = 'a07-native-rtl-multipage-invoice.pdf';
      fs.writeFileSync(path.join(path.dirname(reportPath), filename), pdf);
      report.nativePrint = { ...template, pages, pdfBytes: pdf.length,
        filename, physicalPrinter: 'not-tested' };
    }
    report.status = 'PASSED';
    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    report.error = err.stack || String(err);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    try { cdp?.close(); } catch {}
    // Ensure no WebView2 child process can hold the previous NSIS executable
    // open during the subsequent in-place upgrade on this disposable runner.
    if (proc?.pid) {
      try {
        execFileSync('taskkill.exe', ['/PID', String(proc.pid), '/T', '/F'],
          { stdio: 'ignore', timeout: 10000 });
      } catch (_) { try { proc.kill(); } catch (_) {} }
    }
    cleanDebugPolicies(debugPolicyKeys);
    await wait(700);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
