import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService as db } from '../src/core/StorageService.js';
import { AccountingService as accounts } from '../src/core/AccountingService.js';
import { RetailPostingService as retail } from '../src/core/RetailPostingService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';
import { LicenseService } from '../src/core/LicenseService.js';

const date='1405/07/18';
const company='g317-return-credit';
let sequence=0;
async function setup(){
  await db.clearAll();
  sequence=0;
  LicenseService.state={trialStartedAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),installationId:'g317-credit-test',issuedInvoiceCount:0};
  LicenseService.verifiedPayload=null;
  LicenseService.clockRollback=false;
  await db.put('companies',{id:company,name:'G317 synthetic company'});
  Auth.currentUser={id:'g317-admin',role:'admin',username:'admin'};
  CompanyService.activeCompanyId=company;
  await accounts.createPeriod({name:'G317 synthetic FY1405',startDate:'1405/01/01',endDate:'1405/12/29'});
  await accounts.seedDefaultChart();
  await db.put('treasury',{id:'g317-cash',companyId:company,recordType:'account',type:'cashbox',name:'G317 synthetic cash',isActive:true,isDefault:true,initialBalance:0});
  await db.put('products',{id:'g317-stock',companyId:company,name:'G317 stock product',code:'G317-S01',buyPrice:100,sellPrice:200,trackInventory:true});
  await db.put('products',{id:'g317-service',companyId:company,name:'G317 service',code:'G317-SVC',buyPrice:0,sellPrice:100,trackInventory:false});
  await db.put('contacts',{id:'g317-supplier',companyId:company,name:'G317 synthetic supplier',role:'supplier'});
  await db.put('contacts',{id:'g317-customer',companyId:company,name:'G317 synthetic customer',role:'customer'});
  await retail.activate();
}
function invoice(kind,qty,price,rest={}){
  const total=qty*price;
  const contactId=['purchase','purchase_return'].includes(kind)?'g317-supplier':'g317-customer';
  const productId=['purchase','purchase_return'].includes(kind)?'g317-stock':'g317-service';
  const id='g317-inv-'+(++sequence);
  return {id,companyId:company,number:'G317-'+sequence,clientUuid:id,ownerUserId:'g317-admin',kind,
    date,contactId,contactName:contactId==='g317-supplier'?'G317 synthetic supplier':'G317 synthetic customer',
    isPreInvoice:false,items:[{productId,productName:productId==='g317-stock'?'G317 stock product':'G317 service',
      qty,price,lineSubtotal:total,lineTotal:total,discount:0}],
    subtotal:total,totalDiscount:0,vatAmount:0,grandTotal:total,paidAmount:0,
    paymentMethod:'cash',status:'unpaid',remaining:total,...rest};
}
async function controlBalance(code,contactId,side){
  const chart=await db.getAll('account_chart');
  const account=chart.find(x=>x.code===code);
  assert.ok(account,'control account '+code+' missing');
  const lines=await db.getAll('journal_lines');
  return lines.filter(x=>x.accountId===account.id&&x.contactId===contactId)
    .reduce((n,x)=>n+(side==='debit'?Number(x.debit||0)-Number(x.credit||0):Number(x.credit||0)-Number(x.debit||0)),0);
}
async function allocationRows(targetId){
  return (await db.getAll('settlements')).filter(x=>
    x.settlementType==='credit_allocation'&&x.targetInvoiceId===targetId);
}
async function assertBalancedJournalLedger(){
  const entries=await db.getAll('journal_entries');
  const lines=await db.getAll('journal_lines');
  for(const entry of entries){
    const related=lines.filter(row=>row.journalId===entry.id);
    assert.ok(related.length>=2,'posted journal must have multiple lines: '+entry.id);
    const debit=related.reduce((sum,row)=>sum+Number(row.debit||0),0);
    const credit=related.reduce((sum,row)=>sum+Number(row.credit||0),0);
    assert.equal(debit,credit,'journal debit/credit imbalance: '+entry.id);
  }
}

test('G317 purchase return allocates credit to open supplier payable before cash recovery',async()=>{
  await setup();
  const original=await retail.issueInvoice(invoice('purchase',10,100));
  await retail.postTransaction({id:'g317-supplier-payment',type:'payment',date,amount:700,
    contactId:'g317-supplier',refInvoiceId:original.id,fromAccountId:'g317-cash',method:'cash'});
  const returned=await retail.issueInvoice(invoice('purchase_return',4,100,{originalInvoiceId:original.id}));
  let source=await db.get('invoices',original.id);
  let credit=await db.get('invoices',returned.id);
  assert.equal(source.creditAppliedAmount,300);
  assert.equal(source.remaining,0);
  assert.equal(source.settlementStatus,'settled');
  assert.equal(source.status,'settled');
  assert.equal(credit.creditAppliedAmount,300);
  assert.equal(credit.remaining,100);
  assert.equal(credit.settlementStatus,'credit_due');
  assert.equal(credit.status,'partial');
  const rows=await allocationRows(original.id);
  assert.equal(rows.length,1);
  assert.deepEqual({invoiceId:rows[0].invoiceId,sourceInvoiceId:rows[0].sourceInvoiceId,
    targetInvoiceId:rows[0].targetInvoiceId,transactionId:rows[0].transactionId,amount:rows[0].amount},
    {invoiceId:original.id,sourceInvoiceId:returned.id,targetInvoiceId:original.id,transactionId:null,amount:300});
  assert.equal(await controlBalance('201','g317-supplier','credit'),-100,
    'supplier return creates a 100 Rial debit balance before cash recovery');
  await retail.postTransaction({id:'g317-supplier-recovery',type:'receipt',date,amount:100,
    contactId:'g317-supplier',refInvoiceId:returned.id,toAccountId:'g317-cash',method:'cash',
    reasonCode:'goods_return',explicitlyApproved:true});
  source=await db.get('invoices',original.id);
  credit=await db.get('invoices',returned.id);
  assert.equal(source.remaining,0);
  assert.equal(credit.paidAmount,100);
  assert.equal(credit.remaining,0);
  assert.equal(credit.settlementStatus,'settled');
  assert.equal(credit.status,'settled');
  assert.equal(await controlBalance('201','g317-supplier','credit'),0);
  const before={
    transactions:(await db.getAll('treasury')).filter(x=>x.recordType==='transaction').length,
    journals:(await db.getAll('journal_entries')).length,
    settlements:(await db.getAll('settlements')).length,
    lines:(await db.getAll('journal_lines')).length
  };
  await assert.rejects(retail.postTransaction({id:'g317-extra-supplier-payment',type:'payment',date,amount:1,
    contactId:'g317-supplier',refInvoiceId:original.id,fromAccountId:'g317-cash',method:'cash'}));
  await assert.rejects(retail.postTransaction({id:'g317-extra-supplier-recovery',type:'receipt',date,amount:1,contactId:'g317-supplier',refInvoiceId:returned.id,toAccountId:'g317-cash',method:'cash'}));
  assert.deepEqual({
    transactions:(await db.getAll('treasury')).filter(x=>x.recordType==='transaction').length,
    journals:(await db.getAll('journal_entries')).length,
    settlements:(await db.getAll('settlements')).length,
    lines:(await db.getAll('journal_lines')).length
  },before);
});

test('G317 sale return allocates customer receivable first and refunds only excess credit',async()=>{
  await setup();
  const original=await retail.issueInvoice(invoice('sale',10,100));
  await retail.postTransaction({id:'g317-customer-receipt',type:'receipt',date,amount:700,
    contactId:'g317-customer',refInvoiceId:original.id,toAccountId:'g317-cash',method:'cash'});
  const returned=await retail.issueInvoice(invoice('sale_return',4,100,{originalInvoiceId:original.id}));
  let source=await db.get('invoices',original.id);
  let credit=await db.get('invoices',returned.id);
  assert.equal(source.creditAppliedAmount,300);
  assert.equal(source.remaining,0);
  assert.equal(credit.creditAppliedAmount,300);
  assert.equal(credit.remaining,100);
  assert.equal((await allocationRows(original.id)).length,1);
  assert.equal(await controlBalance('102','g317-customer','debit'),-100,
    'customer return creates a 100 Rial credit balance before refund');
  await retail.postTransaction({id:'g317-customer-refund',type:'payment',date,amount:100,
    contactId:'g317-customer',refInvoiceId:returned.id,fromAccountId:'g317-cash',method:'cash',
    reasonCode:'goods_return',explicitlyApproved:true});
  source=await db.get('invoices',original.id);
  credit=await db.get('invoices',returned.id);
  assert.equal(source.remaining,0);
  assert.equal(credit.remaining,0);
  assert.equal(credit.paidAmount,100);
  assert.equal(await controlBalance('102','g317-customer','debit'),0);
  const beforeOverRefund={transactions:(await db.getAll('treasury')).filter(x=>x.recordType==='transaction').length,journals:(await db.getAll('journal_entries')).length,settlements:(await db.getAll('settlements')).length};
  await assert.rejects(retail.postTransaction({id:'g317-extra-customer-refund',type:'payment',date,amount:1,contactId:'g317-customer',refInvoiceId:returned.id,fromAccountId:'g317-cash',method:'cash',reasonCode:'goods_return',explicitlyApproved:true}));
  assert.deepEqual({transactions:(await db.getAll('treasury')).filter(x=>x.recordType==='transaction').length,journals:(await db.getAll('journal_entries')).length,settlements:(await db.getAll('settlements')).length},beforeOverRefund);
});

test('G317 unpaid purchase is reduced by the full return credit without fake cash settlement',async()=>{
  await setup();
  const original=await retail.issueInvoice(invoice('purchase',10,100));
  const returned=await retail.issueInvoice(invoice('purchase_return',4,100,{originalInvoiceId:original.id}));
  assert.equal((await db.get('invoices',original.id)).remaining,600);
  assert.equal((await db.get('invoices',original.id)).creditAppliedAmount,400);
  assert.equal((await db.get('invoices',returned.id)).remaining,0);
  assert.equal((await db.get('invoices',returned.id)).paidAmount,0);
  assert.equal((await allocationRows(original.id))[0].amount,400);
  assert.equal((await db.getAll('treasury')).filter(x=>x.recordType==='transaction').length,0);
});

test('G317 multiple partial purchase returns allocate the original payable only once',async()=>{
  await setup();
  const original=await retail.issueInvoice(invoice('purchase',10,100));
  await retail.postTransaction({id:'g317-multi-payment',type:'payment',date,amount:700,
    contactId:'g317-supplier',refInvoiceId:original.id,fromAccountId:'g317-cash',method:'cash'});
  const first=await retail.issueInvoice(invoice('purchase_return',2,100,{originalInvoiceId:original.id}));
  const second=await retail.issueInvoice(invoice('purchase_return',2,100,{originalInvoiceId:original.id}));
  assert.equal((await db.get('invoices',original.id)).creditAppliedAmount,300);
  assert.equal((await db.get('invoices',original.id)).remaining,0);
  assert.equal((await db.get('invoices',first.id)).remaining,0);
  assert.equal((await db.get('invoices',second.id)).creditAppliedAmount,100);
  assert.equal((await db.get('invoices',second.id)).remaining,100);
  const rows=await allocationRows(original.id);
  assert.equal(rows.length,2);
  assert.equal(rows.reduce((n,x)=>n+x.amount,0),300);
});


test('G317 multi-return supplier settlement keeps every posted journal balanced and reconciles payable',async()=>{
  await setup();
  const original=await retail.issueInvoice(invoice('purchase',10,100));
  await retail.postTransaction({id:'g317-balance-payment',type:'payment',date,amount:700,
    contactId:'g317-supplier',refInvoiceId:original.id,fromAccountId:'g317-cash',method:'cash'});
  const first=await retail.issueInvoice(invoice('purchase_return',2,100,{originalInvoiceId:original.id}));
  const second=await retail.issueInvoice(invoice('purchase_return',2,100,{originalInvoiceId:original.id}));
  assert.equal((await db.get('invoices',first.id)).remaining,0);
  assert.equal((await db.get('invoices',second.id)).remaining,100);
  assert.equal(await controlBalance('201','g317-supplier','credit'),-100);
  await assertBalancedJournalLedger();
  await retail.postTransaction({id:'g317-balance-recovery',type:'receipt',date,amount:100,
    contactId:'g317-supplier',refInvoiceId:second.id,toAccountId:'g317-cash',method:'cash',
    reasonCode:'goods_return',explicitlyApproved:true});
  assert.equal(await controlBalance('201','g317-supplier','credit'),0);
  assert.equal((await db.get('invoices',original.id)).remaining,0);
  assert.equal((await db.get('invoices',second.id)).remaining,0);
  await assertBalancedJournalLedger();
});

test('G317 concurrent idempotent return issuance creates one return and one credit allocation',async()=>{
  await setup();
  const original=await retail.issueInvoice(invoice('purchase',10,100));
  await retail.postTransaction({id:'g317-retry-payment',type:'payment',date,amount:700,
    contactId:'g317-supplier',refInvoiceId:original.id,fromAccountId:'g317-cash',method:'cash'});
  const draft=invoice('purchase_return',4,100,{originalInvoiceId:original.id});
  const results=await Promise.all([retail.issueInvoice(draft),retail.issueInvoice(draft)]);
  assert.equal(results[0].id,results[1].id);
  assert.equal((await db.getAll('invoices')).filter(x=>x.kind==='purchase_return').length,1);
  assert.equal((await allocationRows(original.id)).length,1);
  assert.equal((await db.get('invoices',original.id)).creditAppliedAmount,300);
  assert.equal((await db.get('invoices',results[0].id)).remaining,100);
});
