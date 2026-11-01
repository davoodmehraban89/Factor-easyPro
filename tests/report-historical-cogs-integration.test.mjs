import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';

globalThis.window ??= globalThis;
const company = 'report-historical-cogs-fixture';
const filter = { preset: 'custom', from: '1405/01/01', to: '1406/01/01' };
const base = {companyId:company, ownerUserId:'report-test-user'};
async function setup() {
  await StorageService.clearAll();
  Auth.currentUser={id:'report-test-user',username:'admin',role:'admin'};
  await StorageService.put('companies',{id:company,name:'Synthetic report company'});
  CompanyService.activeCompanyId=company;
}
async function put(store,rows) {
  for(const row of rows) await StorageService.put(store,{...base,...row});
}
const invoice=(id,kind,productId,qty,net,discount=0)=>({
  id,kind,date:'1405/07/01',isPreInvoice:false,financePosted:true,
  subtotal:net+discount,totalDiscount:discount,grandTotal:net,
  paidAmount:0,remaining:net,
  items:[{productId,productName:'Synthetic item',qty,price:net/qty,
    lineTotal:net,discount:0}]
});
const move=(id,refId,type,cost)=>({
  id,refId,refType:'invoice',productId:'p',type,cost,qty:1,date:'1405/07/01'
});

test('P0: posted report COGS and product margins are independent from mutable current buyPrice',async()=>{
 await setup();
 await put('products',[{id:'p',name:'Synthetic item',buyPrice:75,
   sellPrice:300,trackInventory:true}]);
 await put('invoices',[
   invoice('sale-1','sale','p',2,400),
   invoice('nonformal-1','non_formal','p',1,280,20),
   invoice('return-1','sale_return','p',1,150,50)
 ]);
 await put('stock_movements',[
   move('out-1','sale-1','out',120),
   move('out-2','nonformal-1','out',50),
   move('return-cost','return-1','in',60)
 ]);
 const {ReportController}=await import('../src/controllers/ReportController.js');
 const first=await ReportController.getProfitLoss(filter);
 assert.equal(first.grossSales,700);
 assert.equal(first.salesDiscounts,20);
 assert.equal(first.returnsAmount,150);
 assert.equal(first.netSales,530);
 assert.equal(first.cogs,110);
 assert.equal(first.grossProfit,420);
 assert.equal(first.costBasis.recordedLines,3);
 assert.equal(first.costBasis.estimatedLines,0);

 const productProfit=await ReportController.getProductProfitability(filter);
 const topSales=await ReportController.getSalesAnalysis(filter);
 assert.equal(productProfit[0].cogs,170);
 assert.equal(topSales.topProductsBySales[0].cogs,170);

 const product=await StorageService.get('products','p');
 await StorageService.put('products',{...product,buyPrice:999});
 const second=await ReportController.getProfitLoss(filter);
 const updated=await ReportController.getProductProfitability(filter);
 assert.equal(second.cogs,110);
 assert.equal(second.grossProfit,420);
 assert.equal(updated[0].cogs,170);
});

test('P0: legacy invoices are estimated, and return-only periods retain negative COGS',async()=>{
 await setup();
 await put('products',[{id:'p',name:'Synthetic item',buyPrice:100,trackInventory:true}]);
 await put('invoices',[
   {...invoice('legacy','sale','p',1,180),financePosted:false},
   invoice('return','sale_return','p',1,150)
 ]);
 await put('stock_movements',[move('returned','return','in',60)]);
 const {ReportController}=await import('../src/controllers/ReportController.js');
 const pl=await ReportController.getProfitLoss(filter);
 assert.equal(pl.cogs,40);
 assert.equal(pl.costBasis.estimatedLines,1);
 assert.equal(pl.costBasis.recordedLines,1);
 // An isolated return is an inventory-cost credit, not an invalid zero cost.
 const onlyReturns={...filter,from:'1405/07/01',to:'1405/07/01'};
 await StorageService.delete('invoices','legacy');
 const returnOnly=await ReportController.getProfitLoss(onlyReturns);
 assert.equal(returnOnly.cogs,-60);
 assert.equal(returnOnly.grossProfit,-90);
});
