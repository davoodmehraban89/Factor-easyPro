import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// .test.mjs is intentional: the normal npm test command discovers this file.
const source = readFileSync(new URL('./windows-vm-native-memory-stability-browser.js', import.meta.url), 'utf8');

function harness({ products = 10000, companyInvoices = 50000, invalidPage, mutateAfterRead = false } = {}) {
  const visited = [];
  let page;
  let read = false;
  const context = {
    FINORA: {
      Storage: {
        count: async name => name === 'products' ? products : (read && mutateAfterRead ? 49999 : 50000),
        getByCompany: async () => { read = true; return Array(companyInvoices).fill(null); }
      },
      Company: { current: async () => ({ id: 'synthetic' }) },
      Router: { go: async () => {} }
    },
    __TAURI_INTERNALS__: { invoke: () => {} },
    window: { ReportsView: {
      _switchTab: () => {},
      _setProductsPage: value => { page = value; visited.push(value); }
    } },
    document: { getElementById: () => ({
      querySelectorAll: () => Array(page === invalidPage ? 99 : 100).fill(null)
    }) },
    performance: { now: () => 1 }
  };
  return { visited, run: () => vm.runInNewContext(source, context, { timeout: 3000 }) };
}

test('native stability cycle runs in a browser-only context and checks first/middle/last pages', async () => {
  const h = harness(); // No Node require or process exists inside this context.
  const result = await h.run();
  assert.equal(result.rounds.length, 1);
  assert.equal(result.products, 10000);
  assert.equal(result.invoices, 50000);
  assert.equal(result.companyInvoices, 50000);
  assert.deepEqual(h.visited, [1, 50, 100]);
});

test('native stability rejects a missing 10k-product fixture before navigating', async () => {
  const h = harness({ products: 9999 });
  await assert.rejects(h.run(), /exact synthetic A08 dataset/);
  assert.deepEqual(h.visited, []);
});

test('native stability rejects invoices missing from the selected company', async () => {
  await assert.rejects(harness({ companyInvoices: 49999 }).run(), /Company invoice count changed/);
});

test('native stability fails at the actual incorrect middle page', async () => {
  const h = harness({ invalidPage: 50 });
  await assert.rejects(h.run(), /pagination failed at page 50/);
  assert.deepEqual(h.visited, [1, 50]);
});

test('native stability rejects record-count changes after navigation', async () => {
  await assert.rejects(harness({ mutateAfterRead: true }).run(), /Synthetic record counts changed/);
});

const nativeRunner = readFileSync(new URL('./windows-vm-installed-tauri-cdp.cjs', import.meta.url), 'utf8');
// Execute the real injected setup/login block without launching an installer.
// Escaped expected labels remain stable if a Windows editor misdecodes UTF-8.
const setupLabel = '\u062a\u0639\u06cc\u06cc\u0646 \u0631\u0645\u0632';
const adminLabel = '\u0645\u062f\u06cc\u0631';
const setupStart = nativeRunner.indexOf('    const setup = ready.initialMode.includes(');
const setupEnd = nativeRunner.indexOf('    await eventually(', setupStart);
assert.ok(setupStart >= 0 && setupEnd > setupStart, 'Native setup/login block missing');
const setupBlock = nativeRunner.slice(setupStart, setupEnd);

test('real native bootstrap recognizes Persian setup and submits the correct administrator name', async () => {
  const fields = { faUser: {}, faPass: {}, faPass2: { style: { display: '' } },
    faSubmit: { click: () => { fields.clicked = true; } } };
  const document = { getElementById: id => fields[id] };
  await vm.runInNewContext('(async () => {' + setupBlock + '})()', {
    assert, ready: { initialMode: setupLabel }, mode: 'stability', PASSWORD: 'Synthetic-test-only',
    cdp: { evaluate: script => vm.runInNewContext(script, { document }) }
  });
  assert.equal(fields.faUser.value, adminLabel);
  assert.equal(fields.faPass.value, fields.faPass2.value);
  assert.equal(fields.clicked, true);
});

test('real native bootstrap rejects an existing-login screen for a fresh stability profile', async () => {
  await assert.rejects(vm.runInNewContext('(async () => {' + setupBlock + '})()', {
    assert, ready: { initialMode: 'existing-login' }, mode: 'stability'
  }), /a new native profile must prompt/);
});

test('real offline navigation guard rejects the Persian page-load error', () => {
  const start = nativeRunner.indexOf('if (FINORA.Router.current() !== route');
  const end = nativeRunner.indexOf('timings.push(', start);
  assert.ok(start >= 0 && end > start, 'Native offline navigation guard missing');
  const guard = nativeRunner.slice(start, end);
  const context = {
    FINORA: { Router: { current: () => 'reports' } }, route: 'reports',
    document: { querySelector: () => null, getElementById: () => null },
    body: '\u062e\u0637\u0627 \u062f\u0631 \u0628\u0627\u0631\u06af\u0630\u0627\u0631\u06cc \u0635\u0641\u062d\u0647'
  };
  assert.throws(() => vm.runInNewContext(guard, context), /Installed app route failed/);
  assert.doesNotThrow(() => vm.runInNewContext(guard, { ...context, body: 'Rendered report content' }));
});
