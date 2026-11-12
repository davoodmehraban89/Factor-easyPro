import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Q01: stocktake count and excess-cost inputs have per-product accessible names',()=>{
 const source=readFileSync(new URL('../src/views/AccountingView.js',import.meta.url),'utf8');
 assert.match(source,/ac-count" aria-label="\$\{html\('شمارش واقعی برای '/);
 assert.match(source,/ac-cost" aria-label="\$\{html\('بهای واحد مازاد برای '/);
 assert.match(source,/const countLabel=html\('شمارش واقعی برای '\+label\)/);
 assert.match(source,/const costLabel=html\('بهای واحد مازاد برای '\+label\)/);
 assert.match(source,/ac-count" aria-label="\$\{countLabel\}"/);
 assert.match(source,/ac-cost" aria-label="\$\{costLabel\}"/);
});
