import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { reconcileFinancialData } from '../src/core/ReconciliationCore.mjs';
import { StorageService as db } from '../src/core/StorageService.js';
import { AccountingService as accounts } from '../src/core/AccountingService.js';
import { RetailPostingService as retail } from '../src/core/RetailPostingService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';

const date='1405/07/20', company='reconciliation-c1';
const fixture=()=>({
  integrated:true,
  accounts:[{id:'a103',code:'103'}, {id:'a201',code:'201'}],
  journals:[{id:'j1',status:'posted',sourceType:'invoice',sourceId:'i1',debit:100,credit:100}],
  journalLines:[{id:'l1',journalId:'j1',accountId:'a103',debit:100,credit:0},
    {id:'l2',journalId:'j1',accountId:'a201',debit:0,credit:100}],
  invoices:[{id:'i1',number:'120',journalId:'j1',financePosted:true,grandTotal:100,
    paidAmount:0,remaining:100,isPreInvoice:false}],
  settlements:[],transactions:[],
  inventoryBalances:[{id:'b1',warehouseId:'w1',productId:'p1',quantityUnits:1000,value:100}],
  stockMovements:[{id:'m1',warehouseId:'w1',productId:'p1',type:'in',qty:1,cost:100}]
});

test('balanced purchase, inventory, invoice and journal produce zero reconciliation issues',()=>{
  const report=reconcileFinancialData(fixture());
  assert.equal(report.counts.issues,0);
  assert.equal(report.totals.inventoryLedger,100);
  assert.equal(report.totals.inventoryBook,100);
  assert.equal(report.totals.stockUnits,1000);
  assert.equal(report.counts.invoices,1);
});

test('mismatched settlement and missing transaction are detected without writes',()=>{
  const f=fixture();
  f.invoices[0].paidAmount=50;f.invoices[0].remaining=50;
  f.settlements.push({id:'s1',invoiceId:'i1',transactionId:'missing',amount:40});
  const before=JSON.stringify(f);
  const report=reconcileFinancialData(f);
  assert.deepEqual(report.issues.map(x=>x.code).sort(),
    ['INVOICE_SETTLEMENT_MISMATCH','MISSING_SETTLEMENT_TRANSACTION'].sort());
  assert.equal(JSON.stringify(f),before,'reconciliation is strictly read-only');
});

test('orphan postings, unbalanced journals and inventory discrepancies are reported',()=>{
  const f=fixture();
  f.journalLines[1].credit=90;
  f.stockMovements[0].qty=2;
  f.inventoryBalances[0].value=120;
  f.journalLines.push({id:'orphan',journalId:'missing',accountId:'a103',debit:1,credit:0});
  const report=reconcileFinancialData(f);
  for(const code of ['ORPHAN_JOURNAL_LINE','JOURNAL_UNBALANCED','JOURNAL_TOTAL_MISMATCH',
    'STOCK_QUANTITY_MISMATCH','INVENTORY_LEDGER_MISMATCH']) {
    assert.ok(report.issues.some(x=>x.code===code),code);
  }
});

test('legacy company report never compares stock to a non-integrated ledger',()=>{
  const report=reconcileFinancialData({...fixture(),integrated:false});
  assert.equal(report.integrated,false);
  assert.equal(report.totals.inventoryBook,0);
  assert.ok(!report.issues.some(x=>x.code==='INVENTORY_LEDGER_MISMATCH'));
});

async function setup(){
  await db.clearAll();
  Auth.currentUser={id:'recon-admin',role:'admin',username:'admin'};
  CompanyService.activeCompanyId=company;
  await db.put('companies',{id:company,name:'Company A'});
  await db.put('companies',{id:'foreign-c',name:'Company B'});
  await accounts.createPeriod({name:'۱۴۰۵',startDate:'1405/01/01',endDate:'1405/12/29'});
  await accounts.seedDefaultChart();
  await db.put('products',{id:'product-a',companyId:company,name:'Product',trackInventory:true});
  await db.put('contacts',{id:'contact-a',companyId:company,name:'Customer'});
  await retail.activate();
}

test('real integrated purchase-sale-settlement reconciles without errors and rejects non-admin',async()=>{
  await setup();
  const inv=(id,kind,qty,price,paidAmount=0)=>({
    id,number:id,kind,companyId:company,date,contactId:'contact-a',
    items:[{productId:'product-a',productName:'Product',qty,price,lineTotal:qty*price,
      discount:0}],subtotal:qty*price,totalDiscount:0,vatAmount:0,grandTotal:qty*price,
    paidAmount,remaining:qty*price-paidAmount,paymentMethod:'cash',isPreInvoice:false
  });
  await retail.issueInvoice(inv('buy','purchase',5,100));
  const sold=await retail.issueInvoice(inv('sale','sale',2,200,100));
  assert.equal(sold.remaining,300);
  const before=await db.getAll('journal_entries');
  const result=await accounts.reconciliationReport();
  assert.equal(result.integrated,true);
  assert.equal(result.counts.invoices,2);
  assert.equal(result.counts.issues,0,JSON.stringify(result.issues));
  assert.equal(result.totals.inventoryLedger,300);
  assert.equal(result.totals.inventoryBook,300);
  assert.equal((await db.getAll('journal_entries')).length,before.length);
  await db.put('journal_entries',{id:'foreign-broken',companyId:'foreign-c',status:'posted',
    debit:100,credit:0,date});
  assert.equal((await accounts.reconciliationReport()).counts.issues,0,
    'foreign company errors must not leak into the active company');
  Auth.currentUser={id:'guest',role:'user'};
  await assert.rejects(accounts.reconciliationReport(),/مدیر/);
});

test('accounting report period filters reject foreign periods and malformed Jalali dates',async()=>{
  await setup();
  const p=(await accounts.listPeriods())[0];
  await db.put('fiscal_periods',{id:'foreign-period',companyId:'foreign-c',
    name:'other',startDate:'1405/01/01',endDate:'1405/12/29',status:'open'});
  await assert.rejects(accounts.financialReports({periodId:'foreign-period'}),/شرکت فعال/);
  await assert.rejects(accounts.financialReports({from:'2026-10-13'}),/تاریخ|شمسی/);
  const report=await accounts.financialReports({periodId:p.id,from:'1405/01/01',to:'1405/12/29'});
  assert.equal(report.postedCount,0);
});
