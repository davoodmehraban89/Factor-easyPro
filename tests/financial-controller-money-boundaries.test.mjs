import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService } from '../src/core/StorageService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';
globalThis.window ??= globalThis;

const company='financial-controller-money-company';
async function setup(){
 await StorageService.clearAll();
 Auth.currentUser={id:'financial-controller-money-admin',username:'admin',role:'admin'};
 await StorageService.put('companies',{id:company,name:'Synthetic finance'});
 CompanyService.activeCompanyId=company;
}
const rows=store=>StorageService.getByCompany(store,company);

test('treasury account and transaction controller reject malformed, fractional and unsafe rial amounts before writes',async()=>{
 await setup();
 const {TreasuryController}=await import('../src/controllers/TreasuryController.js');
 const optionalInvalid=[-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1,'bad','1.2','1e2',true,{}];
 const requiredInvalid=[...optionalInvalid,null];
 for(const invalid of optionalInvalid){
  await assert.rejects(TreasuryController.createAccount({name:'Rejected',initialBalance:invalid}),/نامعتبر|صحیح/);
  assert.deepEqual(await rows('treasury'),[]);
 }
 const account=await TreasuryController.createAccount({name:'Synthetic cash',initialBalance:0});
 for(const invalid of optionalInvalid){
  await assert.rejects(TreasuryController.updateAccount(account.id,{name:'Synthetic cash',initialBalance:invalid}),/نامعتبر|صحیح/);
  assert.equal((await StorageService.get('treasury',account.id)).initialBalance,0);
 }
 for(const invalid of requiredInvalid){
  await assert.rejects(TreasuryController.createTransaction({type:'receipt',toAccountId:account.id,amount:invalid}),/نامعتبر|صحیح/);
  assert.equal((await rows('treasury')).filter(x=>x.recordType==='transaction').length,0);
 }
 await assert.rejects(TreasuryController.createTransaction({type:'unknown',amount:1}),/نوع تراکنش/);
 await assert.rejects(TreasuryController.createTransaction({type:'transfer',amount:1,fromAccountId:account.id,toAccountId:account.id}),/مبدا و مقصد/);
 await assert.rejects(TreasuryController.createTransaction({type:'receipt',amount:1}),/مقصد/);
 await assert.rejects(TreasuryController.createTransaction({type:'payment',amount:1}),/مبدا/);
 const receipt=await TreasuryController.createTransaction({type:'receipt',amount:125,toAccountId:account.id});
 assert.equal(receipt.amount,125);
});

test('cheque controller rejects invalid directions and all nonpositive/nonintegral rial amounts',async()=>{
 await setup();
 const {ChequeController}=await import('../src/controllers/ChequeController.js');
 const base={direction:'inbound',sayadNumber:'1234567890123456',issueDate:'1405/01/01',dueDate:'1405/01/02'};
 for(const invalid of [-1,0,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1,'bad','1.2','1e2',null,true,{}]){
  await assert.rejects(ChequeController.create({...base,amount:invalid}),/مبلغ|نامعتبر|صحیح/);
  assert.deepEqual(await rows('cheques'),[]);
 }
 await assert.rejects(ChequeController.create({...base,direction:'invalid',amount:1}),/جهت چک/);
 const cheque=await ChequeController.create({...base,amount:100});
 await assert.rejects(ChequeController.update(cheque.id,{...base,amount:1.5}),/مبلغ|نامعتبر|صحیح/);
 assert.equal((await StorageService.get('cheques',cheque.id)).amount,100);
});

test('expense controller rejects malformed amounts and kinds without silent zero coercion',async()=>{
 await setup();
 const {ExpenseController}=await import('../src/controllers/ExpenseController.js');
 for(const invalid of [-1,0,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1,'bad','1.2','1e2',null,true,{}]){
  await assert.rejects(ExpenseController.create({kind:'expense',category:'test',amount:invalid}),/مبلغ|نامعتبر|صحیح/);
  assert.deepEqual(await rows('expenses'),[]);
 }
 await assert.rejects(ExpenseController.create({kind:'adjustment',category:'test',amount:100}),/نوع سند/);
 const expense=await ExpenseController.create({kind:'expense',category:'test',amount:250});
 assert.equal(expense.amount,250);
 await assert.rejects(ExpenseController.update(expense.id,{kind:'expense',category:'test',amount:0}),/مبلغ|نامعتبر|صحیح/);
 assert.equal((await StorageService.get('expenses',expense.id)).amount,250);
});

test('visible monetary forms use strict integer-rial parsing before controller calls',async()=>{
 const fs=await import('node:fs');
 const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
 assert.ok(source('src/views/TreasuryView.js').includes("NumberInput.parseStrict(document.getElementById('accInitialBalance'))"));
 assert.ok(source('src/views/TreasuryView.js').includes("NumberInput.parseStrict(document.getElementById('txAmount'))"));
 assert.ok(source('src/views/ChequesView.js').includes("NumberInput.parseStrict(document.getElementById('chqAmount'))"));
 assert.ok(source('src/views/ExpensesView.js').includes("NumberInput.parseStrict(document.getElementById('expAmount'))"));
});
