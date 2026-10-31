import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NumberInput } from '../src/utils/NumberInput.js';
import { qtyUnits } from '../src/core/RetailFinanceCore.mjs';

function field(value, { decimals, type = 'text', inputmode = 'numeric', step } = {}) {
  const attrs = new Map([['inputmode', inputmode]]);
  if (decimals !== undefined) attrs.set('data-decimals', String(decimals));
  if (step !== undefined) attrs.set('step', String(step));
  return {
    tagName: 'INPUT', type, value,
    dataset: { ...(decimals === undefined ? {} : { decimals: String(decimals) }) },
    selectionStart: value.length,
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
    getAttribute(key) { return attrs.get(key) ?? null; },
    setAttribute(key, v) {
      attrs.set(key, String(v));
      if (key === 'data-money') this.dataset.money = String(v);
    },
    hasAttribute(key) { return attrs.has(key); }
  };
}

test('fractional stock values retain three decimals; rial formatting remains integral', () => {
  assert.equal(NumberInput.format(2.5, 3), '2.5');
  assert.equal(NumberInput.format(1234.125, 3), '1,234.125');
  assert.equal(NumberInput.format(1200.75), '1,201');
  assert.equal(NumberInput.format(0), '0');
});

test('fractional typing preserves decimal and caret', () => {
  const el = field('2.5', {decimals: 3});
  NumberInput._markAndFormat(el);
  assert.equal(el.value, '2.5');
  assert.equal(el.getAttribute('inputmode'), 'decimal');
  el.value = '1234.567';
  el.selectionStart = el.value.length;
  NumberInput._formatLive(el);
  assert.equal(el.value, '1,234.567');
  assert.equal(el.selectionStart, el.value.length);
  el.value = '1.250';
  NumberInput._formatLive(el);
  assert.equal(el.value, '1.250');
});

test('pasting or typing decimal text never turns 2.5 into 25', () => {
  const el = field('12345');
  NumberInput._markAndFormat(el);
  assert.equal(el.value, '12,345');
  el.value = '2.5';
  el.selectionStart = el.value.length;
  NumberInput._formatLive(el);
  assert.equal(el.value, '2.5');
  el.value = '2.';
  NumberInput._formatLive(el);
  assert.equal(el.value, '2.');
  el.value += '5';
  NumberInput._formatLive(el);
  assert.equal(el.value, '2.5');
});

test('Persian/Arabic number and decimal separators parse as numeric', () => {
  assert.equal(NumberInput.parse('۱٬۲۳۴٫۵'), 1234.5);
  assert.equal(NumberInput.parse('١٬٢٣٤٫٥'), 1234.5);
  assert.equal(NumberInput.parse({ value: '۲.۵' }), 2.5);
  const el = field('۱۲۳۴٫۵', {decimals: 3});
  NumberInput._formatLive(el);
  assert.equal(el.value, '1,234.5');
});

test('native fractional step and large number input stay intact', () => {
  const el = field('2.5', { type: 'number', step: '0.001' });
  NumberInput._markAndFormat(el);
  assert.equal(el.dataset.decimals, '3');
  assert.equal(el.value, '2.5');
  assert.equal(el.type, 'text');
  const big = field('9007199254740991', {decimals: 3});
  NumberInput._formatLive(big);
  assert.equal(big.value, '9,007,199,254,740,991');
});

test('invoice quantity, reorder threshold and stocktake adjustment opt in to three decimals', () => {
  for (const [path, name] of [
    ['src/views/InvoiceFormView.js', 'item.qty'],
    ['src/views/ProductsView.js', 'data.minStock || 0'],
    ['src/views/StockKardexModal.js', 'currentStock']
  ]) {
    const src = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
    assert.ok(src.includes('data-decimals="3" value="${NumberInput.format(' + name + ', 3)}"'), path);
  }
  const invoice = readFileSync(new URL('../src/views/InvoiceFormView.js', import.meta.url), 'utf8');
  assert.ok(invoice.includes('data-decimals="2" value="${NumberInput.format(d.vatRate ?? 10, 2)}"'), 'VAT fractional input');
});

test('an explicit zero VAT rate remains zero when reopening an invoice', () => {
  const savedRate = 0;
  assert.equal(NumberInput.format(savedRate ?? 10, 2), '0');
  assert.equal(NumberInput.format(null ?? 10, 2), '10');
  const form = readFileSync(new URL('../src/views/InvoiceFormView.js', import.meta.url), 'utf8');
  assert.ok(form.includes('d.vatRate ?? 10, 2'), 'zero tax must not be replaced with ten percent');
});


test('over-precision is never silently truncated before the ledger validation', () => {
  const input = field('1.23456', { decimals: 3 });
  NumberInput._formatLive(input);
  assert.equal(input.value, '1.23456');
  assert.equal(NumberInput.parse(input), 1.23456);
  assert.throws(() => qtyUnits(NumberInput.parse(input)), /مقدار کالا نامعتبر/);
  assert.equal(qtyUnits(1.234), 1234);
});
