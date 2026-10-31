import test from 'node:test';
import assert from 'node:assert/strict';
import { percentOfRials, assertInvoiceTotals } from '../src/core/RetailFinanceCore.mjs';

const fixture=()=>({
 kind:'sale',items:[{qty:2.5,price:1201,lineSubtotal:3003,discountType:'percent',
  discountInput:10,discount:300,lineTotal:2703}],subtotal:2703,
 totalDiscount:270,discountType:'percent',discountInput:10,
 vatEnabled:true,vatRate:10.5,vatAmount:255,grandTotal:2688,paidAmount:0
});

test('bigint percentage keeps two-decimal rates and half-up whole-rial rounding',()=>{
 assert.equal(percentOfRials(3003,10),300);
 assert.equal(percentOfRials(1000,10.55),106);
 assert.equal(percentOfRials(1,50),1);
 assert.equal(percentOfRials(1,49.99),0);
 assert.equal(percentOfRials(Number.MAX_SAFE_INTEGER,100),Number.MAX_SAFE_INTEGER);
});

test('adversarial percentage inputs are rejected, not silently zeroed',()=>{
 for(const value of [-1,100.01,0.001,99.999,NaN,Infinity,'hello','100.001',null,true,{},'1e2'])
   assert.throws(()=>percentOfRials(100,value),/درصد|نامعتبر/);
});

test('posting verifies typed row discount, total discount and enabled VAT',()=>{
 assert.equal(assertInvoiceTotals(fixture()),true);
 const a=fixture();a.items[0].discount=301;a.items[0].lineTotal=2702;a.subtotal=2702;a.totalDiscount=270;a.grandTotal=2687;
 assert.throws(()=>assertInvoiceTotals(a),/تخفیف محاسبه‌شده/);
 const b=fixture();b.totalDiscount=200;b.grandTotal=2766;
 assert.throws(()=>assertInvoiceTotals(b),/تخفیف کل/);
 const c=fixture();c.vatAmount=256;c.grandTotal=2689;
 assert.throws(()=>assertInvoiceTotals(c),/مالیات فاکتور/);
 const d=fixture();d.vatEnabled=false;
 assert.throws(()=>assertInvoiceTotals(d),/مالیات فاکتور/);
});
