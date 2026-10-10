import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateDiscount, receiveStock, issueStock, qtyUnits } from '../src/core/RetailFinanceCore.mjs';
test('discount allocation uses integer largest remainder and never increases line value',()=>{
 const lines=[2,2,2,2,1].map(lineTotal=>({lineTotal}));
 const distribution=allocateDiscount(lines,3);
 assert.deepEqual(distribution.map(x=>x.netLineTotal),[1,1,1,2,1]);
 assert.equal(distribution.reduce((a,b)=>a+b.netLineTotal,0),6);
 for(const x of distribution)assert.ok(x.netLineTotal>=0&&x.netLineTotal<=x.lineTotal);
});
test('weighted average handles exact large integer rial amounts',()=>{
 const before={quantityUnits:3000,value:Number.MAX_SAFE_INTEGER-1000};
 const after=issueStock(before,1);
 assert.equal(after.quantityUnits,2000);
 assert.equal(after.value+after.cost,before.value);
 assert.ok(Number.isSafeInteger(after.cost));
});
test('fractional units validated and exact last-stock cost emptied',()=>{
 assert.equal(qtyUnits(.125),125);
 assert.throws(()=>qtyUnits(.0001));
 const first=receiveStock(null,2.5,2500);
 const last=issueStock(first,2.5);
 assert.equal(last.quantityUnits,0);
 assert.equal(last.value,0);
 assert.equal(last.cost,2500);
});
