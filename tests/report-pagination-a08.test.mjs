import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paginateReportRows, REPORT_PAGE_SIZE } from '../src/core/ReportPagination.mjs';

test('A08 10k-product pagination is bounded, ordered, complete, and never mutates source', () => {
  assert.equal(REPORT_PAGE_SIZE, 100);
  const original = Array.from({ length: 10000 }, (_, id) => ({ id, totalSales: id * 100 }));
  const sourceTotals = original.reduce((sum, row) => sum + row.totalSales, 0);
  const pages = Array.from({ length: 100 }, (_, index) => paginateReportRows(original, index));
  assert.deepEqual(pages.map(page => page.rows.length), Array(100).fill(100));
  assert.deepEqual(pages.flatMap(page => page.rows), original);
  assert.equal(pages.flatMap(page => page.rows).reduce((sum,row)=>sum+row.totalSales,0), sourceTotals);
  assert.deepEqual([pages[0].start,pages[0].end,pages[0].hasPrevious,pages[0].hasNext], [0,100,false,true]);
  assert.deepEqual([pages[99].start,pages[99].end,pages[99].hasPrevious,pages[99].hasNext], [9900,10000,true,false]);
  assert.equal(paginateReportRows(original,9999).page,99);
  assert.equal(original.length,10000);
});

test('A08 pagination safely clamps empty, malformed and partial-page requests', () => {
  const data = Array.from({length:201},(_,id)=>id);
  assert.deepEqual([paginateReportRows(data,-5).page,paginateReportRows(data,1.5).page], [0,0]);
  const last = paginateReportRows(data,Number.MAX_SAFE_INTEGER);
  assert.deepEqual([last.page,last.pageCount,last.rows[0],last.rows.length],[2,3,200,1]);
  const empty = paginateReportRows([]);
  assert.deepEqual([empty.page,empty.pageCount,empty.start,empty.end,empty.rows.length],[0,1,0,0,0]);
  assert.deepEqual([paginateReportRows([4]).rows[0],paginateReportRows([4]).hasNext],[4,false]);
  assert.throws(()=>paginateReportRows(null),TypeError);
  assert.throws(()=>paginateReportRows(data,0,501),RangeError);
  assert.throws(()=>paginateReportRows(data,0,0),RangeError);
});

test('A08 report UI paginates displayed rows but keeps full dataset totals and printing', () => {
  const source = readFileSync(new URL('../src/views/ReportsView.js',import.meta.url),'utf8');
  assert.match(source,/import \{ paginateReportRows \} from ['"]\.\.\/core\/ReportPagination\.mjs['"]/);
  assert.match(source,/const productPage = paginateReportRows\(list, reportPages\.products\)/);
  assert.match(source,/const customerPage = paginateReportRows\(list, reportPages\.customers\)/);
  assert.match(source,/productPage\.rows\.map/);
  assert.match(source,/customerPage\.rows\.map/);
  assert.match(source,/this\._renderPageNavigation\('products', productPage\)/);
  assert.match(source,/this\._renderPageNavigation\('customers', customerPage\)/);
  assert.match(source,/window\.ReportsView\._setReportPage/);
  assert.match(source,/const totalSales = list\.reduce/);
  assert.match(source,/const totalProfit = list\.reduce/);
  assert.match(source,/_buildPrintContent\(\)/);
  assert.match(source,/\$\{list\.map\(\(p, i\) =>/);
});

test('A08 native installed Tauri benchmark enforces 100-row reports and page navigation', () => {
  const source = readFileSync(new URL('../tests/windows-vm-native-performance-browser.js',import.meta.url),'utf8');
  assert.match(source,/currentRows\.length !== 100/);
  assert.match(source,/window\.ReportsView\._setReportPage\('products', 1\)/);
  assert.match(source,/window\.ReportsView\._setReportPage\('products', 999999\)/);
  assert.match(source,/financialTotalsUnchanged: true/);
});
