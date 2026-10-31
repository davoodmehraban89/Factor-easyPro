import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lineGrossRials, qtyUnits } from '../src/core/RetailFinanceCore.mjs';

test('fractional quantities round exactly to whole rial, with deterministic half-up', () => {
  assert.equal(lineGrossRials(2.5, 1201), 3003);
  assert.equal(lineGrossRials(0.001, 500), 1);
  assert.equal(lineGrossRials(0.001, 499), 0);
  assert.equal(lineGrossRials(0.125, 1000), 125);
  assert.equal(lineGrossRials(1234.567, 1000), 1234567);
  assert.equal(lineGrossRials(1.999, 1501), 3000);
});

test('invalid monetary unit price and overprecise quantities cannot create invoice totals', () => {
  for (const p of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2.5']) {
    assert.throws(() => lineGrossRials(2.5, p), /نامعتبر|صحیح/);
  }
  for (const q of [-1, 0, 1.2345, Infinity, NaN]) {
    assert.throws(() => lineGrossRials(q, 1000), /نامعتبر/);
  }
  assert.equal(qtyUnits(1.234), 1234);
});

test('fractional amount multiplication enforces the safe rial range without overflow', () => {
  assert.equal(lineGrossRials(1, Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assert.throws(() => lineGrossRials(2, Number.MAX_SAFE_INTEGER), /محدوده/);
});

test('invoice UI preview and persistence use identical gross line function', () => {
  const controller = readFileSync(new URL('../src/controllers/InvoiceController.js', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/views/InvoiceFormView.js', import.meta.url), 'utf8');
  assert.match(controller, /lineSubtotal = lineGrossRials\(qty, price\)/);
  assert.match(view, /lineSubtotal = lineGrossRials\(qty, price\)/);
  assert.ok(!controller.includes('const lineSubtotal = qty * price'));
  assert.ok(!view.includes('const lineSubtotal = qty * price'));
});
