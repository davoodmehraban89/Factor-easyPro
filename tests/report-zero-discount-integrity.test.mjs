import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { Auth } from '../src/core/Auth.js';
import { reportLineRevenue } from '../src/core/ReportLineRevenue.mjs';

const companyId='synthetic-zero-discount-report-company';
test('100% discount must have exactly zero revenue, not the gross sale price',()=>{
  assert.equal(reportLineRevenue({qty:2,price:150,lineTotal:0,discount:300}),0);
  assert.equal(reportLineRevenue({qty:2,price:150,lineTotal:'0'}),0);
  assert.equal(reportLineRevenue({qty:2,price:150,lineTotal:60}),60);
  assert.equal(reportLineRevenue({qty:2,price:150}),300,'legacy missing value retains historical fallback');
  assert.equal(reportLineRevenue({qty:0,price:150}),0);
});

test('corrupt persisted line totals are rejected rather than silently inflating revenue',()=>{
  for(const invalid of [-1,1.5,NaN,Infinity,'not-a-number',Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>reportLineRevenue({qty:1,price:100,lineTotal:invalid}),/نامعتبر/);
  }
  for(const invalid of [Infinity,-1,NaN]){
    assert.throws(()=>reportLineRevenue({qty:invalid,price:100}),/نامعتبر/);
  }
  assert.throws(()=>reportLineRevenue(null),/نامعتبر/);
});

test('real indexedDB sales and profitability reports preserve discounted zero and legacy lines',async()=>{
  await StorageService.clearAll();
  Auth.currentUser={id:'report-synthetic-admin',username:'admin',role:'admin'};
  await StorageService.put('companies',{id:companyId,name:'Synthetic report company'});
  CompanyService.activeCompanyId=companyId;
  await StorageService.put('products',{
    id:'report-product',companyId,ownerUserId:'report-synthetic-admin',
    name:'Synthetic product',buyPrice:50,sellPrice:100
  });
  await StorageService.put('contacts',{
    id:'report-contact',companyId,ownerUserId:'report-synthetic-admin',
    name:'Synthetic customer',role:'customer'
  });
  await StorageService.put('invoices',{
    id:'report-invoice',companyId,ownerUserId:'report-synthetic-admin',
    number:'1',date:'1405/07/18',kind:'sale',isPreInvoice:false,
    contactId:'report-contact',contactName:'Synthetic customer',
    grandTotal:260,subtotal:260,paidAmount:0,remaining:260,
    items:[
      {productId:'report-product',productName:'Synthetic product',qty:2,price:100,discount:200,lineTotal:0},
      {productId:'report-product',productName:'Synthetic product',qty:1,price:100,discount:40,lineTotal:60},
      {productId:'report-product',productName:'Synthetic product',qty:2,price:100}
    ]
  });
  globalThis.window ??= globalThis;
  const { ReportController } = await import('../src/controllers/ReportController.js');
  const analysis=await ReportController.getSalesAnalysis({preset:'all'});
  assert.equal(analysis.topProductsBySales[0].totalSales,260);
  assert.equal(analysis.topProductsBySales[0].qty,5);
  const profitability=await ReportController.getProductProfitability({preset:'all'});
  assert.equal(profitability.length,1);
  assert.deepEqual([profitability[0].totalSales,profitability[0].cogs,profitability[0].profit],
    [260,250,10]);
  assert.equal((await StorageService.get('invoices','report-invoice')).items[0].lineTotal,0,
    'read-only reporting must not alter persisted issued invoices');
});
