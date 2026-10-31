import test from 'node:test';
import assert from 'node:assert/strict';
import { NumberInput } from '../src/utils/NumberInput.js';

function fakeInput(value, selectionStart = value.length) {
  return {
    value, selectionStart, selectionEnd: selectionStart,
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  };
}

test('formats fractional stock quantities without rounding', () => {
  assert.equal(NumberInput.format(2.375), '2.375');
  assert.equal(NumberInput.format('12345.125'), '12,345.125');
  assert.equal(NumberInput.format('9007199254740993'), '9,007,199,254,740,993');
  assert.equal(NumberInput.format(0), '0');
});

test('parses Persian and Arabic digits, grouping and decimal separator', () => {
  assert.equal(NumberInput.parse('۱۲٬۳۴۵٫۱۲۵'), 12345.125);
  assert.equal(NumberInput.parse('١٢٬٣٤٥٫١٢٥'), 12345.125);
  assert.equal(NumberInput.parse({value: '۲.۵'}), 2.5);
  assert.equal(NumberInput.parse('−۲٫۵'), -2.5);
  assert.equal(NumberInput.parse(''), 0);
  assert.equal(NumberInput.parse('not-a-number'), 0);
});

test('typing decimals does not turn quantity 2.5 into 25', () => {
  const el = fakeInput('2.5');
  NumberInput._formatLive(el);
  assert.equal(el.value, '2.5');
  assert.equal(NumberInput.parse(el), 2.5);
});

test('live Persian fractional input formats with grouping', () => {
  const el = fakeInput('۱۲۳۴۵٫۲۵');
  NumberInput._formatLive(el);
  assert.equal(el.value, '12,345.25');
  assert.equal(NumberInput.parse(el), 12345.25);
  assert.equal(el.selectionStart, el.value.length);
});

test('live editing maintains cursor position around grouped integers', () => {
  const el = fakeInput('12345.75', 3);
  NumberInput._formatLive(el);
  assert.equal(el.value, '12,345.75');
  assert.equal(el.selectionStart, 4);
});

test('typing a decimal point preserves the editable fractional position', () => {
  const el = fakeInput('2.');
  NumberInput._formatLive(el);
  assert.equal(el.value, '2.');
  assert.equal(el.selectionStart, 2);
});

test('initial conversion does not destroy fractional value', () => {
  const attributes = {};
  const el = {
    tagName: 'INPUT', type: 'number', dataset: {}, value: '2.375',
    getAttribute(key) { return attributes[key] || null; },
    setAttribute(key, value) { attributes[key] = value; }
  };
  NumberInput._markAndFormat(el);
  assert.equal(el.type, 'text');
  assert.equal(el.value, '2.375');
});
