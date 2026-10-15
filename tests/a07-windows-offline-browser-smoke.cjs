// Windows Edge smoke of the built, self-hosted frontend on a disposable profile.
// Intentionally does not touch any installed application's real IndexedDB.
// The --host-resolver-rules option disallows external DNS while allowing loopback.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(fn, timeoutMs = 25000, intervalMs = 400) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try { const result = await fn(); if (result) return result; }
    catch (e) { lastError = e; }
    await sleep(intervalMs);
  }
  throw lastError || Error('Browser startup timed out');
}
async function getJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw Error('HTTP ' + res.status);
  return res.json();
}
async function loadChromeCDP(wsURL) {
  const ws = new WebSocket(wsURL);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('CDP websocket timeout')), 10000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', event => { clearTimeout(timer); reject(Error('CDP failed: ' + event.type)); }, { once: true });
  });
  let counter = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const reply = JSON.parse(event.data);
    const item = pending.get(reply.id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(reply.id);
    if (reply.error) item.reject(Error(JSON.stringify(reply.error)));
    else item.resolve(reply.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++counter;
    const timer = setTimeout(() => {
      pending.delete(id); reject(Error('CDP command timed out: ' + method));
    }, 25000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true
    });
    if (result.exceptionDetails) throw Error(
      'Browser runtime error: ' + (result.exceptionDetails.text || 'Unknown')
    );
    return result.result.value;
  };
  await command('Page.enable');
  await command('Runtime.enable');
  return { command, evaluate, close: () => ws.close() };
}

(async () => {
  assert.equal(process.platform, 'win32', 'Only run on a disposable Windows CI runner');
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  const edgeBinary = edgePaths.find(fs.existsSync);
  assert.ok(edgeBinary, 'Windows Edge headless executable missing');
  const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'factoreasypro-smoke-'));
  const server = spawn('cmd.exe',
    ['/d', '/s', '/c', 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort'],
    { stdio: 'ignore', windowsHide: true });
  let edge;
  let cdp;
  try {
    await eventually(async () => {
      const response = await fetch('http://127.0.0.1:4173/', {
        signal: AbortSignal.timeout(1500)
      });
      return response.ok;
    });
    edge = spawn(edgeBinary, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--remote-debugging-port=9339',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--user-data-dir=' + tempProfile, 'http://127.0.0.1:4173/'
    ], { stdio: 'ignore', windowsHide: true });
    const wsURL = await eventually(async () => {
      const pages = await getJSON('http://127.0.0.1:9339/json');
      return pages.find(x => x.type === 'page' &&
        x.url.startsWith('http://127.0.0.1:4173'))?.webSocketDebuggerUrl;
    });
    cdp = await loadChromeCDP(wsURL);
    const report = [];
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        await cdp.command('Page.reload', { ignoreCache: true });
        await sleep(900);
      }
      // A reload can destroy the JS context while CDP evaluates it. Retry
      // until the new document's real authentication screen is ready.
      const state = await eventually(() => cdp.evaluate(`(async () => {
        for (let j = 0; j < 180; j++) {
          const hasAuth = !!document.getElementById('finoraAuthOverlay');
          const loaded = !!window.FINORA;
          if (hasAuth && loaded) {
            return {
              hasAuth, loaded, version: window.FINORA.version,
              errors: document.querySelector('#faError')?.textContent || '',
              browserExternalScripts: [...document.querySelectorAll('script[src],link[rel="stylesheet"][href]')]
                .map(x => x.src || x.href)
                .filter(x => /^https?:/.test(x) && !x.startsWith('http://127.0.0.1:4173'))
            };
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw Error('Authentication overlay never appeared; startup may be stalled');
      })()`), 30000, 300);
      assert.equal(state.hasAuth, true);
      assert.equal(state.loaded, true);
      assert.equal(state.errors, '');
      assert.deepEqual(state.browserExternalScripts, []);
      report.push({ attempt: i + 1, version: state.version, authOverlay: true,
        externalScripts: state.browserExternalScripts.length });
    }
    console.log(JSON.stringify({ smoke: 'passed', profile: 'disposable',
      browser: 'Windows Edge', offlineDNS: true, attempts: report }, null, 2));
  } finally {
    cdp?.close();
    if (edge && !edge.killed) edge.kill();
    if (server && !server.killed) server.kill();
    await sleep(500);
    try { fs.rmSync(tempProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
    catch { /* The Windows runner cleans up the temporary profile. */ }
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
