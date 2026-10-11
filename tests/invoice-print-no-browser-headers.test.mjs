import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

// The print document is written into an isolated iframe. These assertions
// protect its print media contract so browser-added date/title/page labels
// do not reappear when printing A4, A5 or a thermal receipt.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root,'src/utils/InvoicePrint.js'), 'utf8');
const print = src.slice(src.indexOf('  _openPrintWindow(html) {'));
test('print paper margin is zero, while invoice keeps its own inner spacing', () => {
  assert.match(print, /@page\s*\{[\s\S]*?size:\s*\$\{pageCss\};[\s\S]*?margin:\s*0\s*;/);
  assert.match(src, /class="print-doc"[^\n]*padding:6mm/);
  assert.match(src, /class="print-doc"[^\n]*padding:8mm/);
  assert.match(src, /class="print-doc"[^\n]*padding:3mm/);
});
test('all paper sizes use the same clean print iframe, not browser-generated labels', () => {
  assert.match(print, /this\.settings\.paperSize === 'A5'/);
  assert.match(print, /this\.settings\.template === 'thermal'/);
  assert.match(print, /iframe\.contentWindow\.print\(\)/);
  assert.doesNotMatch(print, /margin:\s*6mm\s*;/);
  assert.doesNotMatch(src.slice(src.indexOf('  _thermalTemplate('),src.indexOf('  _openPrintWindow(')), /\>\s*Factor-easyPro\s*\</);
});
