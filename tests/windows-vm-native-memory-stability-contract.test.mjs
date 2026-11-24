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
