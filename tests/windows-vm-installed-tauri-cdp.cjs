'use strict';
// Real installed Tauri/WebView2 native-process smoke on a disposable Windows Actions VM.
// Runs against a real NSIS-installed .exe, NOT the Vite preview page.
// No production data, no publication, and no password/sensitive payload in reports.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const [exe, profile, mode, expectedVersion, reportPath] = process.argv.slice(2);
assert.equal(process.platform, 'win32');
assert.ok(['seed','upgrade','fresh'].includes(mode), 'unknown lab mode');
assert.ok(fs.existsSync(exe), 'installed Windows executable missing');
fs.mkdirSync(profile, { recursive: true });
const port = mode === 'seed' ? 9371 : mode === 'upgrade' ? 9372 : 9373;
const PASSWORD = 'VmOnly-Factor-83471!'; // Synthetic password, never printed.
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
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timer = setTimeout(() => { pending.delete(next); reject(Error('CDP ' + method + ' timed out')); }, 12000);
    pending.set(next, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const r = await command('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true
    });
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
  try {
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
    report.browserOrigin = ready.href.replace(/[/#?].*$/, '');
    assert.equal(ready.version, expectedVersion, 'built runtime version mismatch');
    const setup = ready.initialMode.includes('تعیین رمز');
    if (mode === 'seed' || mode === 'fresh') {
      assert.equal(setup, true, 'a new native profile must prompt to set the administrator password');
    } else {
      assert.equal(setup, false, 'upgrade should preserve existing administrator credentials');
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

    if (mode === 'seed') {
      const seeded = await cdp.evaluate('(async()=>{' +
        'const S=FINORA.Storage;' +
        'await S.put("products",{id:"vm-upgrade-product",companyId:"company_default",name:"Synthetic VM product",sellPrice:123456});' +
        'await S.put("invoices",{id:"vm-upgrade-draft",companyId:"company_default",kind:"sale",isPreInvoice:true,financePosted:false,grandTotal:987654,paidAmount:0,remaining:987654});' +
        'const db=await S.init();' +
        'return {version:db.version,products:(await S.getAll("products")).length,amount:(await S.get("invoices","vm-upgrade-draft")).grandTotal};' +
      '})()');
      assert.equal(seeded.version, 6, 'old release should have IndexedDB v6');
      assert.equal(seeded.amount, 987654);
      report.indexedDb = 'v6-written';
      report.persistence = 'synthetic-legacy-fixtures-created';
    } else if (mode === 'upgrade') {
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
      assert.equal(restored.audits, 0, 'migration must not manufacture historical audit events');
      assert.equal(restored.corrections, true);
      report.indexedDb = 'real-WebView2-v6-to-v7-passed';
      report.persistence = 'product-invoice-and-login-survived-upgrade';
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
    report.status = 'PASSED';
    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    report.error = err.stack || String(err);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    try { cdp?.close(); } catch {}
    try { proc?.kill(); } catch {}
    await wait(700);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
