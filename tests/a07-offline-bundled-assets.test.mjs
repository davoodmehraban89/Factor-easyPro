import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('A07: the app shell cannot block startup on a remote CDN', () => {
  const html = read('index.html');
  const entry = read('src/main.js');
  const excel = read('src/controllers/ExcelController.js');
  assert.doesNotMatch(html, /<script[^>]*src=["']https?:\/\//i);
  assert.doesNotMatch(html, /<link[^>]*href=["']https?:\/\//i);
  assert.match(entry, /@fontsource\/vazirmatn\/400\.css/);
  assert.match(entry, /@fontsource\/vazirmatn\/700\.css/);
  assert.match(excel, /import\('xlsx'\)/);
  assert.doesNotMatch(excel, /import \* as XLSX from 'xlsx'/);
  assert.match(excel, /async function loadSheetJS\(\)/);
});

test('A07: bundled SheetJS can read and write Persian spreadsheets with integer currency', () => {
  const sheet = XLSX.utils.aoa_to_sheet([['کالا','مبلغ'],['دفتر',125000]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'اطلاعات');
  const array = XLSX.write(wb, { bookType:'xlsx', type:'buffer' });
  assert.ok(array.byteLength > 200);
  const restored = XLSX.read(array, { type:'buffer' });
  const rows = XLSX.utils.sheet_to_json(restored.Sheets['اطلاعات'], { header: 1 });
  assert.deepEqual(rows, [['کالا','مبلغ'],['دفتر',125000]]);
});
