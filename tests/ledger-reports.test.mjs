import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLedgerReports} from '../src/core/LedgerReports.mjs';
const accounts=[
{id:'cash',code:'101',name:'Cash',type:'asset'},
{id:'stock',code:'103',name:'Inventory',type:'asset'},
{id:'sales',code:'401',name:'Sales',type:'revenue'},
{id:'cogs',code:'501',name:'COGS',type:'expense'}];
const journals=[{id:'purchase',status:'posted',date:'1405/01/01',periodId:'p'},{id:'sale',status:'posted',date:'1405/01/02',periodId:'p'},{id:'draft',status:'draft',date:'1405/01/02',periodId:'p'}];
const lines=[
{journalId:'purchase',accountId:'stock',debit:100,credit:0},{journalId:'purchase',accountId:'cash',debit:0,credit:100},
{journalId:'sale',accountId:'cash',debit:200,credit:0},{journalId:'sale',accountId:'sales',debit:0,credit:200},
{journalId:'sale',accountId:'cogs',debit:70,credit:0},{journalId:'sale',accountId:'stock',debit:0,credit:70},
{journalId:'draft',accountId:'sales',debit:900,credit:0}];
test('posted journal reports use historical COGS, exclude drafts, and balance',()=>{
const r=buildLedgerReports(accounts,journals,lines);
assert.equal(r.profitLoss.netProfit,130);assert.equal(r.profitLoss.expenses,70);
assert.equal(r.balanceSheet.difference,0);assert.equal(r.postedCount,2);assert.equal(r.detail.length,6);
assert.deepEqual(r.totals,{debit:370,credit:370});
});
test('report date filter and invalid ledger detection',()=>{
const r=buildLedgerReports(accounts,journals,lines,{to:'1405/01/01'});
assert.equal(r.profitLoss.netProfit,0);assert.equal(r.postedCount,1);
assert.throws(()=>buildLedgerReports(accounts,journals,[...lines,{journalId:'sale',accountId:'cash',debit:1,credit:0}]),/تراز نیست/);
});
test('balance sheet stays cumulative when P&L is filtered to later period',()=>{
 const extended=[...journals,{id:'later',status:'posted',date:'1405/02/01',periodId:'q'}];
 const movements=[...lines,{journalId:'later',accountId:'cash',debit:40,credit:0},{journalId:'later',accountId:'sales',debit:0,credit:40}];
 const r=buildLedgerReports(accounts,extended,movements,{periodId:'q'});
 assert.equal(r.profitLoss.netProfit,40);
 assert.equal(r.balanceSheet.assets,170);
 assert.equal(r.balanceSheet.equityWithProfit,170);
 assert.equal(r.balanceSheet.difference,0);
 assert.equal(r.postedCount,1);
 assert.equal(r.trial.length,2);
 assert.equal(r.cumulativeTrial.length,4);
});
