import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/utils/InvoicePrint.js', import.meta.url), 'utf8');

test('print iframe does not expose an application title in browser-generated headers', () => {
  assert.match(source, /<title><\/title>/);
  assert.doesNotMatch(source, /<title>چاپ فاکتور<\/title>/);
});

test('print iframe uses zero page margin and keeps invoice layout padding', () => {
  assert.match(source, /@page\s*\{[\s\S]*?margin:\s*0\s*!important\s*;/);
  assert.match(source, /\.print-doc/);
});

test('formal, non-formal and thermal invoice templates remain available', () => {
  for (const template of ['_formalTemplate(', '_nonFormalTemplate(', '_thermalTemplate(']) {
    assert.ok(source.includes(template), `Missing invoice template: ${template}`);
  }
});
