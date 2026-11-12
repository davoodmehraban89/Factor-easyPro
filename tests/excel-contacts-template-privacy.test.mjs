import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/controllers/ExcelController.js', import.meta.url), 'utf8');
const method = source.match(/async downloadContactsTemplate\(\) \{([\s\S]*?)\n  \}/)?.[1];

test('contacts Excel template contains headers only and no embedded real-looking identifiers', () => {
  assert.ok(method, 'downloadContactsTemplate implementation must exist');
  assert.match(method, /\['نام', 'نوع', 'نقش', 'موبایل'/);
  assert.doesNotMatch(method, /آرا بتن|آقای احمدی/);
  assert.doesNotMatch(method, /\b09\d{9}\b/);
  assert.doesNotMatch(method, /\b\d{10,11}\b/);
});
