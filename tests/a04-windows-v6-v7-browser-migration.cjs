// Actual Edge/Chromium IndexedDB v6→v7 migration, using a disposable profile.
// Runs on Windows CI; never touches the user's installed application or data.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 25000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < ms) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) { lastError = error; }
    await wait(250);
  }
  throw lastError || Error('Timed out waiting for Edge');
}
const seedHtml = `<!doctype html><html><head><title>SEED_PENDING</title></head>
<body><script>
  const request = indexedDB.open('finora_pro_db', 6);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('invoices')) db.createObjectStore('invoices', { keyPath: 'id' });
  };
  request.onsuccess = () => {
    const db = request.result;
    const tx = db.transaction(['products', 'invoices'], 'readwrite');
    tx.objectStore('products').put({
      id: 'v6-synthetic-product', companyId: 'legacy-c1', name: 'Synthetic v6',
      sellPrice: 123456, ownerUserId: 'legacy-user'
    });
    tx.objectStore('invoices').put({
      id: 'v6-synthetic-invoice', companyId: 'legacy-c1', kind: 'sale',
      number: 'V6-0001', grandTotal: 987654, paidAmount: 1234, remaining: 986420
    });
    tx.oncomplete = () => { db.close(); document.title = 'SEED_OK'; };
    tx.onabort = () => { db.close(); document.title = 'SEED_FAILED'; };
  };
  request.onerror = () => { document.title = 'SEED_FAILED'; };
</script></body></html>`;

function serveDist() {
  const dist = path.resolve(process.cwd(), 'dist');
  const mimetypes = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.woff': 'font/woff',
    '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.ico': 'image/x-icon'
  };
  return http.createServer((req, res) => {
    try {
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      if (pathname === '/__seed_v6') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store' });
        res.end(seedHtml);
        return;
      }
      const rel = decodeURIComponent(pathname === '/' ? 'index.html' : pathname.slice(1));
      const file = path.resolve(dist, rel);
      if (!file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { 'Content-Type': mimetypes[path.extname(file)] ||
        'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } catch (error) { res.writeHead(500); res.end(String(error.message)); }
  });
}

async function connectCDP(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('CDP connection timed out')), 10000);
    ws.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    ws.addEventListener('error', () => {
      clearTimeout(timeout); reject(Error('Could not open CDP websocket'));
    }, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const reply = JSON.parse(event.data);
    const item = pending.get(reply.id);
    if (!item) return;
    clearTimeout(item.timeout);
    pending.delete(reply.id);
    if (reply.error) item.reject(Error(JSON.stringify(reply.error)));
    else item.resolve(reply.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timeout = setTimeout(() => {
      pending.delete(next); reject(Error('Timed out on ' + method));
    }, 12000);
    pending.set(next, { resolve, reject, timeout });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true
    });
    if (result.exceptionDetails) {
      throw Error('JavaScript exception: ' + JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  };
  await command('Page.enable');
  await command('Runtime.enable');
  return { command, evaluate, close: () => ws.close() };
}

(async () => {
  assert.equal(process.platform, 'win32');
  const edge = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find(fs.existsSync);
  assert.ok(edge, 'Windows Edge not found');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'factor-migration-v6-'));
  const server = serveDist();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  let cdp;
  try {
    browser = spawn(edge, [
      '--headless=new', '--disable-gpu', '--no-first-run',
      '--disable-extensions', '--no-default-browser-check',
      '--remote-debugging-port=9348',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--user-data-dir=' + profile, base + '/__seed_v6'
    ], { stdio: 'ignore', windowsHide: true });

    const ws = await until(async () => {
      const res = await fetch('http://127.0.0.1:9348/json', {
        signal: AbortSignal.timeout(1500)
      });
      const pages = await res.json();
      return pages.find(page => page.type === 'page' &&
        page.url.includes('/__seed_v6'))?.webSocketDebuggerUrl;
    });
    cdp = await connectCDP(ws);
    await until(async () => {
      const title = await cdp.evaluate('document.title');
      if (title === 'SEED_FAILED') throw Error('v6 seed transaction failed');
      return title === 'SEED_OK';
    });

    await cdp.command('Page.navigate', { url: base + '/' });
    const result = await until(async () => cdp.evaluate(`(async () => {
      if (!window.FINORA || !document.getElementById('finoraAuthOverlay')) return null;
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('finora_pro_db');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['products', 'invoices', 'audit_events'], 'readonly');
          const product = tx.objectStore('products').get('v6-synthetic-product');
          const invoice = tx.objectStore('invoices').get('v6-synthetic-invoice');
          const audit = tx.objectStore('audit_events').count();
          tx.oncomplete = () => {
            const out = {
              version: db.version,
              product: product.result,
              invoice: invoice.result,
              audits: audit.result,
              newCorrectionStore: db.objectStoreNames.contains('document_corrections'),
              hasAuth: !!document.getElementById('finoraAuthOverlay')
            };
            db.close();
            resolve(out);
          };
          tx.onabort = () => { db.close(); reject(tx.error); };
        };
      });
    })()`), 30000);
    assert.equal(result.version, 7);
    assert.equal(result.product.name, 'Synthetic v6');
    assert.equal(result.product.sellPrice, 123456);
    assert.equal(result.invoice.grandTotal, 987654);
    assert.equal(result.invoice.remaining, 986420);
    assert.equal(result.audits, 0, 'do not forge audit history for pre-v7 records');
    assert.equal(result.newCorrectionStore, true);
    assert.equal(result.hasAuth, true);
    console.log(JSON.stringify({
      result: 'PASSED',
      browser: 'Windows Edge real IndexedDB (isolated profile)',
      offlineDNS: true,
      migration: 'v6 -> v7',
      recordsPreserved: ['synthetic product', 'synthetic invoice'],
      historicalAuditBackfilled: false
    }, null, 2));
  } finally {
    cdp?.close();
    if (browser && !browser.killed) browser.kill();
    await new Promise(resolve => server.close(resolve));
    await wait(500);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch { /* Temporary runner profile cleaned after CI. */ }
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
