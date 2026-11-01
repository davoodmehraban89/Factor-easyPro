import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoiceCosting } from '../src/core/ReportCosting.mjs';

const sale = (id, productId, qty=2, extra={}) =>
  ({ id, kind:'sale', financePosted:true, items:[{productId,qty}], ...extra });
const movement = (refId, productId, type, cost) =>
  ({ refId, productId, refType:'invoice', type, cost });

test('posted sale COGS never changes when current catalog purchase price changes', () => {
  const invoice=sale('sale-1','p',2);
  const movements=[movement('sale-1','p','out',120)];
  const before=buildInvoiceCosting([invoice],[{id:'p',buyPrice:60}],movements);
  const after=buildInvoiceCosting([invoice],[{id:'p',buyPrice:900}],movements);
  assert.equal(before.byInvoice.get('sale-1').total,120);
  assert.equal(after.byInvoice.get('sale-1').total,120);
  assert.equal(after.summary.recordedLines,1);
  assert.equal(after.summary.estimatedLines,0);
});

test('posted returns use actual original stock cost and do not use catalog cost', () => {
  const records=[sale('sale-1','p',2),
    sale('return-1','p',1,{kind:'sale_return'})];
  const costs=buildInvoiceCosting(records,[{id:'p',buyPrice:777}],[
    movement('sale-1','p','out',120),
    movement('return-1','p','in',60)
  ]);
  assert.equal(costs.byInvoice.get('sale-1').total-
    costs.byInvoice.get('return-1').total,60);
  assert.equal(costs.summary.recordedLines,2);
});

test('multiple invoice lines for the same product allocate recorded cost only once', () => {
  const inv=sale('s','p',1,{items:[{productId:'p',qty:1},{productId:'p',qty:2}]});
  const result=buildInvoiceCosting([inv],[{id:'p',buyPrice:500}],
    [movement('s','p','out',250)]);
  assert.deepEqual(result.byInvoice.get('s').lines.map(x=>x.cost),[83,167]);
  assert.equal(result.byInvoice.get('s').total,250);
});

test('legacy data is explicitly estimated and missing catalog cost is flagged', () => {
  const rows=[sale('legacy','p',1,{financePosted:false}),
    sale('missing','deleted',1,{financePosted:false}),
    sale('service','svc',1,{financePosted:true})];
  const result=buildInvoiceCosting(rows,[{id:'p',buyPrice:42},
    {id:'svc',trackInventory:false,buyPrice:1000}],[]);
  assert.equal(result.byInvoice.get('legacy').total,42);
  assert.equal(result.byInvoice.get('missing').lines[0].source,'missing');
  assert.equal(result.byInvoice.get('service').total,0);
  assert.deepEqual(result.summary,{recordedLines:0,estimatedLines:1,
    missingCostLines:1,serviceLines:1});
});

test('reject unsafe monetary movement and calculated estimates instead of silently coercing', () => {
  assert.throws(()=>buildInvoiceCosting([sale('s','p')],[{id:'p',buyPrice:4}],
    [movement('s','p','out',1.5)]),/نامعتبر/);
  assert.throws(()=>buildInvoiceCosting([sale('s','p')],[{id:'p',buyPrice:Number.MAX_SAFE_INTEGER}],
    []),/نامعتبر/);
});

test('historical movement uses the matching invoice, product and direction only', () => {
  const result=buildInvoiceCosting([sale('s','p')],[{id:'p',buyPrice:11}],[
    movement('other','p','out',800),
    movement('s','other','out',900),
    movement('s','p','in',700),
    movement('s','p','out',35)
  ]);
  assert.equal(result.byInvoice.get('s').total,35);
  assert.equal(result.summary.recordedLines,1);
});
