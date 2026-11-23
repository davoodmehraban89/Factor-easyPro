'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('native stability script is browser-compatible and checks 10k/50k cycles', async () => {
  const source = fs.readFileSync(path.join(__dirname,
    'windows-vm-native-memory-stability-browser.js'), 'utf8');
  assert.doesNotMatch(source, /\brequire\s*\(/);
  assert.doesNotMatch(source, /\bprocess\./);
  const store = {
    count: async name => ({ products: 10000, invoices: 50000 })[name],
    getByCompany: async () => Array(50000).fill(null)
  };
  const region = { querySelectorAll: () => Array(100).fill(null) };
  const context = {
    FINORA: { Storage: store, Company: { current: async () => ({ id: 'synthetic' }) },
      Router: { go: async () => {} } },
    __TAURI_INTERNALS__: { invoke: () => {} },
    window: { ReportsView: { _switchTab: () => {}, _setProductsPage: () => {} } },
    document: { getElementById: () => region },
    performance: { now: () => 1 }
  };
  const result = await vm.runInNewContext(source, context, { timeout: 3000 });
  assert.equal(result.rounds.length, 1);
  assert.equal(result.products, 10000);
  assert.equal(result.invoices, 50000);
});
