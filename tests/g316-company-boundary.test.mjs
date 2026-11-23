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
const company='g316-scope-local';
async function setup(){
  await db.clearAll();
  LicenseService.state={trialStartedAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),installationId:'g316-scope-test',issuedInvoiceCount:0};
  LicenseService.verifiedPayload=null;
  LicenseService.clockRollback=false;
  await db.put('companies',{id:company,name:'G316 local'});
  await db.put('companies',{id:'g316-scope-foreign',name:'G316 foreign'});
  Auth.currentUser={id:'g316-admin',role:'admin',username:'admin',companyIds:[company]};
  CompanyService.activeCompanyId=company;
  await accounts.createPeriod({name:'G316 scope FY1405',startDate:'1405/01/01',endDate:'1405/12/29'});
  await accounts.seedDefaultChart();
  await db.put('treasury',{id:'g316-local-cash',companyId:company,recordType:'account',type:'cashbox',name:'G316 local cash',isActive:true,isDefault:true,initialBalance:0});
  await db.put('treasury',{id:'g316-foreign-cash',companyId:'g316-scope-foreign',recordType:'account',type:'cashbox',name:'G316 foreign cash',isActive:true,isDefault:true,initialBalance:0});
  await db.put('contacts',{id:'g316-local-contact',companyId:company,name:'G316 local supplier',role:'supplier'});
  await db.put('contacts',{id:'g316-foreign-contact',companyId:'g316-scope-foreign',name:'G316 foreign supplier',role:'supplier'});
  await db.put('invoices',{id:'g316-foreign-purchase',companyId:'g316-scope-foreign',kind:'purchase',
    financePosted:true,isPreInvoice:false,grandTotal:1000,paidAmount:0,remaining:1000,
    contactId:'g316-foreign-contact',date});
  await retail.activate();
}
test('G316: treasury posting rejects foreign-company invoice, contact and bank account without writes',async()=>{
  await setup();
  const before={
    transactions:(await db.getAll('treasury')).filter(x=>x.recordType==='transaction').length,
    journals:(await db.getAll('journal_entries')).length,
    settlements:(await db.getAll('settlements')).length
  };
  await assert.rejects(retail.postTransaction({id:'g316-foreign-invoice-attempt',type:'payment',date,
    amount:1,contactId:'g316-foreign-contact',refInvoiceId:'g316-foreign-purchase',
    fromAccountId:'g316-local-cash',method:'cash'}));
  await assert.rejects(retail.postTransaction({id:'g316-foreign-account-attempt',type:'payment',date,
    amount:1,contactId:'g316-local-contact',fromAccountId:'g316-foreign-cash',method:'cash'}));
  const after={
    transactions:(await db.getAll('treasury')).filter(x=>x.recordType==='transaction').length,
    journals:(await db.getAll('journal_entries')).length,
    settlements:(await db.getAll('settlements')).length
  };
  assert.deepEqual(after,before,'cross-company attempts must not write financial records');
  assert.equal(await db.get('treasury','g316-foreign-invoice-attempt'),undefined);
  assert.equal(await db.get('treasury','g316-foreign-account-attempt'),undefined);
});
