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
const company='g316-purchase-return-offset';
async function setup(){
  await db.clearAll();
  LicenseService.state={trialStartedAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),installationId:'g316-offset-test',issuedInvoiceCount:0};
  LicenseService.verifiedPayload=null;
  LicenseService.clockRollback=false;
  await db.put('companies',{id:company,name:'G316 synthetic company'});
  Auth.currentUser={id:'g316-admin',role:'admin',username:'admin'};
  CompanyService.activeCompanyId=company;
  await accounts.createPeriod({name:'G316 synthetic FY1405',startDate:'1405/01/01',endDate:'1405/12/29'});
  await accounts.seedDefaultChart();
  await db.put('treasury',{id:'g316-cash',companyId:company,recordType:'account',type:'cashbox',name:'G316 synthetic cash',isActive:true,isDefault:true,initialBalance:0});
  await db.put('products',{id:'g316-product',companyId:company,name:'G316 synthetic product',code:'G316-P01',buyPrice:100,sellPrice:200,trackInventory:true});
  await db.put('contacts',{id:'g316-supplier',companyId:company,name:'G316 synthetic supplier',role:'supplier'});
  await retail.activate();
}
function invoice(kind,qty,price,rest={}){
  const total=qty*price;
  return {id:'g316-inv-'+kind+'-'+qty+'-'+price,companyId:company,
    number:'G316-'+kind,clientUuid:'G316-'+kind,ownerUserId:'g316-admin',kind,
    date,contactId:'g316-supplier',contactName:'G316 synthetic supplier',
    isPreInvoice:false,items:[{productId:'g316-product',productName:'G316 synthetic product',
      qty,price,lineSubtotal:total,lineTotal:total,discount:0}],
    subtotal:total,totalDiscount:0,vatAmount:0,grandTotal:total,paidAmount:0,
    paymentMethod:'cash',status:'unpaid',remaining:total,...rest};
}
async function payableBalance(){
  const accountsRows=await db.getAll('account_chart');
  const payable=accountsRows.find(x=>x.code==='201');
  assert.ok(payable,'payable control account missing');
  const lines=await db.getAll('journal_lines');
  return lines.filter(x=>x.accountId===payable.id&&x.contactId==='g316-supplier')
    .reduce((n,x)=>n+Number(x.credit||0)-Number(x.debit||0),0);
}
test('G316: purchase return offsets supplier payable and blocks a second payment beyond net payable',async()=>{
  await setup();
  const purchased=await retail.issueInvoice(invoice('purchase',10,100));
  await retail.postTransaction({id:'g316-supplier-payment-700',type:'payment',date,amount:700,
    contactId:'g316-supplier',refInvoiceId:purchased.id,fromAccountId:'g316-cash',method:'cash'});
  const returned=await retail.issueInvoice(invoice('purchase_return',4,100,{originalInvoiceId:purchased.id}));
  await retail.postTransaction({id:'g316-supplier-recovery-100',type:'receipt',date,amount:100,
    contactId:'g316-supplier',refInvoiceId:returned.id,toAccountId:'g316-cash',method:'cash',
    reasonCode:'goods_return',explicitlyApproved:true});
  const original=await db.get('invoices',purchased.id);
  const creditNote=await db.get('invoices',returned.id);
  assert.equal(original.remaining,0);
  assert.equal(creditNote.remaining,0);
  assert.equal(await payableBalance(),0,'supplier control-account balance must net to zero');
  const before={
    transactions:(await db.getAll('treasury')).filter(x=>x.recordType==='transaction').length,
    journals:(await db.getAll('journal_entries')).length,
    settlements:(await db.getAll('settlements')).length,
    lines:(await db.getAll('journal_lines')).length
  };
  await assert.rejects(retail.postTransaction({id:'g316-prohibited-extra-supplier-payment',
    type:'payment',date,amount:1,contactId:'g316-supplier',
    refInvoiceId:purchased.id,fromAccountId:'g316-cash',method:'cash'}));
  const after={
    transactions:(await db.getAll('treasury')).filter(x=>x.recordType==='transaction').length,
    journals:(await db.getAll('journal_entries')).length,
    settlements:(await db.getAll('settlements')).length,
    lines:(await db.getAll('journal_lines')).length
  };
  assert.deepEqual(after,before,'blocked payment must leave all financial records unchanged');
  assert.equal(await payableBalance(),0);
  assert.equal((await db.get('invoices',purchased.id)).remaining,0);
  assert.equal((await db.get('invoices',returned.id)).remaining,0);
});
