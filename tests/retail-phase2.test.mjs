import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { StorageService as db } from '../src/core/StorageService.js';
import { AccountingService as accounts } from '../src/core/AccountingService.js';
import { RetailPostingService as retail } from '../src/core/RetailPostingService.js';
import { Auth } from '../src/core/Auth.js';
import { CompanyService } from '../src/core/CompanyService.js';

const date='1405/07/18';
const company='c2-phase2';
async function setup(){
  await db.clearAll();
  await db.put('companies',{id:company,name:'Store 2'});
  Auth.currentUser={id:'phase2-admin',role:'admin',username:'admin'};
  CompanyService.activeCompanyId=company;
  const period=await accounts.createPeriod({name:'۱۴۰۵',startDate:'1405/01/01',endDate:'1405/12/29'});
  await accounts.seedDefaultChart();
  const bank={id:'cash-1',companyId:company,recordType:'account',
    type:'cashbox',name:'صندوق',isActive:true,isDefault:true,initialBalance:0};
  const product={id:'product-1',companyId:company,name:'کالای تست',
    code:'X1',buyPrice:100,sellPrice:200,trackInventory:true};
  const contact={id:'contact-1',companyId:company,name:'مشتری'};
  await db.put('treasury',bank);await db.put('products',product);await db.put('contacts',contact);
  assert.deepEqual(await retail.activate(),{enabled:true});
  return {period,bank,product,contact,warehouse:(await retail.warehouses())[0]};
}
let seq=100;
function invoice(kind,qty,price,rest={}){
  const total=qty*price;
  return {id:'phase2-inv-'+(++seq),companyId:company,
    number:String(seq),clientUuid:'test-'+seq,ownerUserId:'phase2-admin',kind,
    date,contactId:'contact-1',contactName:'مشتری',isPreInvoice:false,
    items:[{productId:'product-1',productName:'کالای تست',qty,price,
      lineSubtotal:total,lineTotal:total,discount:0}],subtotal:total,
    totalDiscount:0,vatAmount:0,grandTotal:total,paidAmount:0,
    paymentMethod:'cash',status:'unpaid',remaining:total,...rest};
}
async function purchase10(){return retail.issueInvoice(invoice('purchase',10,100))}
async function sale3(rest={}){return retail.issueInvoice(invoice('sale',3,200,rest))}
test('v2 sale-purchase cash settlement balance, weighted average and exactly once',async()=>{
 const {warehouse}=await setup();
 const p=await purchase10();
 const first=(await retail.stockBalances())[0];
 assert.equal(first.quantityUnits,10000);assert.equal(first.value,1000);
 const sold=await sale3({paidAmount:200});
 assert.equal(sold.paidAmount,200);assert.equal(sold.remaining,400);
 const second=(await retail.stockBalances())[0];
 assert.equal(second.quantityUnits,7000);assert.equal(second.value,700);
 const stock=await db.getAllByIndex('stock_movements','productId','product-1');
 assert.equal(stock.filter(m=>m.financePosted).length,0);
 assert.equal(stock.length,2);
 const journals=await accounts.listJournals();
 assert.equal(journals.length,3);
 const trial=await accounts.trialBalance();
 assert.equal(trial.totals.debit,trial.totals.credit);
 await assert.rejects(retail.issueInvoice(sold),/قطعی|تکراری/);
 assert.equal((await accounts.listJournals()).length,3);
 const receipt=await retail.postTransaction({id:'receipt-1',type:'receipt',date,amount:400,
   contactId:'contact-1',refInvoiceId:sold.id,toAccountId:'cash-1',method:'cash'});
 assert.equal(receipt.amount,400);
 assert.equal((await db.get('invoices',sold.id)).remaining,0);
 assert.equal((await db.getAllByIndex('settlements','invoiceId',sold.id)).length,2);
 assert.deepEqual((await accounts.trialBalance()).totals.debit,(await accounts.trialBalance()).totals.credit);
 assert.equal((await retail.stockBalances({warehouseId:warehouse.id}))[0].value,700);
});
test('v2 stock over-issue aborts invoice, stock and journal atomically',async()=>{
 await setup();await purchase10();
 const invoiceTooBig=invoice('sale',11,200);
 await assert.rejects(retail.issueInvoice(invoiceTooBig),/موجودی/);
 assert.equal(await db.get('invoices',invoiceTooBig.id),undefined);
 assert.equal((await accounts.listJournals()).length,1);
 assert.equal((await retail.stockBalances())[0].quantityUnits,10000);
});
test('v2 sale return references original COGS and limits cumulative returned quantity',async()=>{
 await setup();await purchase10();
 const sold=await sale3();
 const back=invoice('sale_return',1,200,{originalInvoiceId:sold.id});
 const returned=await retail.issueInvoice(back);
 assert.equal(returned.kind,'sale_return');
 assert.equal((await retail.stockBalances())[0].value,800);
 assert.equal((await retail.stockBalances())[0].quantityUnits,8000);
 await assert.rejects(retail.issueInvoice(invoice('sale_return',3,200,{originalInvoiceId:sold.id})),/بیشتر/);
 assert.equal((await accounts.listJournals()).length,3);
});
test('v2 cash expense, cheque deposit and bank transfer produce balanced journals',async()=>{
 await setup();await purchase10();await sale3();
 const e=await retail.postExpense({id:'exp-phase2',kind:'expense',date,amount:60,method:'cash',category:'اجاره'});
 assert.equal(e.financePosted,true);
 await assert.rejects(retail.postExpense(e),/تکراری/);
 const c=await retail.postCheque({id:'cheque-in-1',issueDate:date,dueDate:date,
   direction:'inbound',status:'pending',contactId:'contact-1',amount:250,chequeNumber:'C1'});
 assert.equal(c.status,'pending');
 const cleared=await retail.changeChequeStatus(c.id,'cleared',{date});
 assert.equal(cleared.status,'cleared');
 await assert.rejects(retail.changeChequeStatus(c.id,'cleared',{date}),/در جریان/);
 assert.equal((await db.getAll('treasury')).filter(r=>r.refChequeId===c.id).length,1);
 const b=await retail.addWarehouse('انبار دوم');
 assert.ok(b.id);
 const trial=await accounts.trialBalance();
 assert.equal(trial.totals.credit,trial.totals.debit);
});
test('v2 multiwarehouse transfer and stocktake adjustment preserve value reconciliation',async()=>{
 const {warehouse}=await setup();await purchase10();
 const other=await retail.addWarehouse('شعبه دوم');
 const transfer=await retail.transferStock({fromWarehouseId:warehouse.id,
   toWarehouseId:other.id,productId:'product-1',quantity:4,date});
 assert.equal(transfer.cost,400);
 let balances=await retail.stockBalances();
 assert.equal(balances.reduce((s,x)=>s+x.value,0),1000);
 assert.equal(balances.find(x=>x.warehouseId===warehouse.id).quantityUnits,6000);
 const take=await retail.newStocktake({warehouseId:other.id,date});
 const count=(await retail.getStocktakeLines(take.id))[0];
 assert.equal(count.expectedUnits,4000);
 await retail.countStocktake(take.id,'product-1',3);
 const done=await retail.finalizeStocktake(take.id);
 assert.equal(done.decrease,100);
 balances=await retail.stockBalances();
 assert.equal(balances.reduce((s,x)=>s+x.value,0),900);
 await assert.rejects(retail.finalizeStocktake(take.id),/قبلاً/);
 assert.equal((await accounts.trialBalance()).totals.debit,(await accounts.trialBalance()).totals.credit);
});
test('v2 activation refuses silently migrating legacy movements',async()=>{
 await db.clearAll();
 await db.put('companies',{id:company,name:'old'});
 Auth.currentUser={id:'phase2-admin',role:'admin'};
 CompanyService.activeCompanyId=company;
 await accounts.createPeriod({name:'۱۴۰۵',startDate:'1405/01/01',endDate:'1405/12/29'});
 await accounts.seedDefaultChart();
 await db.put('stock_movements',{id:'historical',companyId:company,productId:'old',type:'in',qty:5});
 await assert.rejects(retail.activate(),/گردش قبلی/);
 assert.equal(await retail.isEnabled(),false);
});

test('v2 standalone GL reversal of a commercial invoice is prohibited',async()=>{
 const {period}=await setup();await purchase10();
 const journal=(await accounts.listJournals())[0];
 await assert.rejects(accounts.reverseJournal(journal.id,{periodId:period.id,date}),/تجاری/);
 assert.equal((await accounts.listJournals()).length,1);
});
test('v2 cross-company contact and treasury references roll back without leakage',async()=>{
 await setup();await purchase10();
 await db.put('contacts',{id:'foreign-person',companyId:'elsewhere',name:'foreign'});
 const receipt={id:'foreign-receipt',date,type:'receipt',amount:100,contactId:'foreign-person',toAccountId:'cash-1'};
 await assert.rejects(retail.postTransaction(receipt),/شرکت/);
 assert.equal(await db.get('treasury',receipt.id),undefined);
 const issued=invoice('sale',2,200,{contactId:'foreign-person'});
 await assert.rejects(retail.issueInvoice(issued),/شرکت/);
 assert.equal(await db.get('invoices',issued.id),undefined);
 assert.equal((await retail.stockBalances())[0].quantityUnits,10000);
});
test('v2 purchase-return financial variance remains balanced when costs and sale price differ',async()=>{
 await setup();const purchased=await purchase10();
 const result=await retail.issueInvoice(invoice('purchase_return',2,120,{originalInvoiceId:purchased.id}));
 assert.equal(result.grandTotal,240);
 assert.equal((await retail.stockBalances())[0].quantityUnits,8000);
 assert.equal((await retail.stockBalances())[0].value,800);
 const trial=await accounts.trialBalance();
 assert.equal(trial.totals.debit,trial.totals.credit);
 const chart=await accounts.listAccounts();
 const variance=chart.find(x=>x.code==='503');
 assert.ok(trial.rows.some(row=>row.accountId===variance.id));
});
test('v2 open stocktake locks other inventory transactions until approval',async()=>{
 const {warehouse}=await setup();await purchase10();
 const take=await retail.newStocktake({warehouseId:warehouse.id,date});
 const attempted=invoice('sale',1,200);
 await assert.rejects(retail.issueInvoice(attempted),/شمارش/);
 assert.equal(await db.get('invoices',attempted.id),undefined);
 await retail.countStocktake(take.id,'product-1',10);
 await retail.finalizeStocktake(take.id);
 const issued=await retail.issueInvoice(invoice('sale',1,200));
 assert.equal(issued.financePosted,true);
});
test('v2 full company backup/restore round trip preserves stock valuation and financial postings',async()=>{
 const {warehouse}=await setup();
 await purchase10();await sale3({paidAmount:200});
 const { SettingsController }=await import('../src/controllers/SettingsController.js');
 const backup=await SettingsController.exportBackup();
 assert.equal(backup.data.inventory_balances.length,1);
 assert.equal(backup.data.settlements.length,1);
 assert.equal(backup.data.journal_entries.length,3);
 await db.clearAll();
 await db.put('companies',{id:company,name:'restored'});
 CompanyService.activeCompanyId=company;
 const counts=await SettingsController.importBackup(backup,{mode:'merge'});
 assert.ok(counts.added>=10);
 assert.equal(await retail.isEnabled(),true);
 assert.equal((await retail.stockBalances())[0].value,700);
 assert.equal((await accounts.listJournals()).length,3);
 assert.equal((await db.getAllByIndex('settlements','companyId',company)).length,1);
 const corrupted=structuredClone(backup);
 corrupted.data.inventory_balances[0].warehouseId='missing-warehouse';
 await assert.rejects(SettingsController.importBackup(corrupted,{mode:'replace'}),/موجودی|انبار/);
 assert.equal((await retail.stockBalances())[0].value,700);
});
test('v2 fiscal period closure forbids invoice and stock writes atomically',async()=>{
 const {period}=await setup();await purchase10();
 await accounts.closePeriod(period.id);
 const newSale=invoice('sale',1,200);
 await assert.rejects(retail.issueInvoice(newSale),/دوره مالی باز/);
 assert.equal(await db.get('invoices',newSale.id),undefined);
 assert.equal((await accounts.listJournals()).length,1);
 assert.equal((await retail.stockBalances())[0].quantityUnits,10000);
});
test('v2 tax input/output and mixed transaction amounts remain balanced',async()=>{
 await setup();await retail.issueInvoice(invoice('purchase',10,100,
   {vatAmount:100,grandTotal:1100}));
 const s=await retail.issueInvoice(invoice('sale',1,200,
   {vatAmount:20,grandTotal:220}));
 assert.equal(s.remaining,220);
 const trial=await accounts.trialBalance();
 assert.equal(trial.totals.debit,trial.totals.credit);
 const chart=await accounts.listAccounts();
 assert.ok(trial.rows.find(x=>x.accountId===chart.find(a=>a.code==='104').id)?.debit===100);
 assert.ok(trial.rows.find(x=>x.accountId===chart.find(a=>a.code==='202').id)?.credit===20);
});
test('v2 stocktake can post shortage and surplus together in one balanced journal',async()=>{
 const {warehouse}=await setup();
 await purchase10();
 await db.put('products',{id:'product-extra',companyId:company,name:'extra',trackInventory:true});
 const second=invoice('purchase',4,100,{
  items:[{productId:'product-extra',qty:4,price:100,lineTotal:400,discount:0}],
  subtotal:400,grandTotal:400
 });
 await retail.issueInvoice(second);
 const take=await retail.newStocktake({warehouseId:warehouse.id,date});
 await retail.countStocktake(take.id,'product-1',9);
 await retail.countStocktake(take.id,'product-extra',5);
 const result=await retail.finalizeStocktake(take.id);
 assert.equal(result.increase,100);
 assert.equal(result.decrease,100);
 const trial=await accounts.trialBalance();
 assert.equal(trial.totals.debit,trial.totals.credit);
});
test('v2 concurrent posting of same invoice commits exactly once',async()=>{
 await setup();await purchase10();
 const same=invoice('sale',1,200);
 const [a,b]=await Promise.allSettled([retail.issueInvoice(same),retail.issueInvoice(same)]);
 assert.equal([a,b].filter(x=>x.status==='fulfilled').length,1);
 assert.equal([a,b].filter(x=>x.status==='rejected').length,1);
 assert.equal((await accounts.listJournals()).length,2);
 assert.equal((await retail.stockBalances())[0].quantityUnits,9000);
 assert.equal((await db.getAll('stock_movements')).length,2);
});
test('v2 concurrent invoice number collision commits only one',async()=>{
 await setup();await purchase10();
 const first=invoice('sale',1,200),second=invoice('sale',2,200);
 second.number=first.number;
 const results=await Promise.allSettled([retail.issueInvoice(first),retail.issueInvoice(second)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected').length,1);
 assert.equal((await accounts.listJournals()).length,2);
});
test('v2 all partial sale returns restore every rial of original COGS',async()=>{
 await setup();
 const buy=invoice('purchase',3,33);
 buy.items[0].lineTotal=100;buy.items[0].lineSubtotal=100;buy.subtotal=100;buy.grandTotal=100;buy.remaining=100;
 await retail.issueInvoice(buy);
 const sale=await retail.issueInvoice(invoice('sale',3,200));
 for(let j=0;j<3;j++){
   const returned=invoice('sale_return',1,200,{originalInvoiceId:sale.id});
   await retail.issueInvoice(returned);
 }
 const balance=(await retail.stockBalances())[0];
 assert.equal(balance.quantityUnits,3000);
 assert.equal(balance.value,100);
 assert.equal((await accounts.trialBalance()).totals.debit,(await accounts.trialBalance()).totals.credit);
});
test('v2 duplicate product lines on last sale return do not overvalue returned goods',async()=>{
 await setup();
 const buy=invoice('purchase',3,33);
 buy.items[0].lineTotal=100;buy.subtotal=100;buy.grandTotal=100;buy.remaining=100;
 await retail.issueInvoice(buy);
 const sale=await retail.issueInvoice(invoice('sale',3,200));
 const returned=invoice('sale_return',3,200,{originalInvoiceId:sale.id});
 returned.items=[{...returned.items[0],qty:1,lineTotal:200},
   {...returned.items[0],qty:2,lineTotal:400}];
 await retail.issueInvoice(returned);
 assert.equal((await retail.stockBalances())[0].value,100);
});
test('v2 product controller forbids bypass stock writes and uses inventory book valuation',async()=>{
 await setup();
 globalThis.window??={};
 const { ProductController } = await import('../src/controllers/ProductController.js');
 await purchase10();
 const b=invoice('purchase',10,200);
 await retail.issueInvoice(b);
 const valuation=await ProductController.getTotalStockValue();
 assert.equal(valuation.totalBuyValue,3000);
 assert.equal((await ProductController.getStockMap(['product-1']))['product-1'],20);
 await assert.rejects(
   ProductController.addStockMovement('product-1','in',100,'manual'),/دستی/
 );
 await assert.rejects(
   ProductController.updateProduct('product-1',{name:'کالای آزمایش',trackInventory:false}),
   /نوع کالا/
 );
 assert.equal((await retail.stockBalances())[0].value,3000);
});
test('v2 purchase returns require a matching original invoice and cannot exceed quantity',async()=>{
 await setup();const original=await purchase10();
 const without=invoice('purchase_return',1,100);
 await assert.rejects(retail.issueInvoice(without),/اولیه/);
 const returned=await retail.issueInvoice(invoice('purchase_return',4,100,{originalInvoiceId:original.id}));
 assert.equal(returned.financePosted,true);
 await assert.rejects(retail.issueInvoice(invoice('purchase_return',7,100,{originalInvoiceId:original.id})),/بیشتر/);
 assert.equal((await retail.stockBalances())[0].quantityUnits,6000);
});
test('v2 integrated issuance commits invoice item rows and rolls back on failure',async()=>{
 await setup();await purchase10();
 const rows=await db.getAll('invoice_items');
 assert.equal(rows.length,1);
 assert.equal(rows[0].invoiceId,(await db.getAll('invoices'))[0].id);
 assert.equal(rows[0].companyId,company);
 const bad=invoice('sale',100,200);
 await assert.rejects(retail.issueInvoice(bad),/موجودی/);
 assert.equal((await db.getAll('invoice_items')).length,1);
});
test('fresh-company activation creates default cash account and chart subledger',async()=>{
 await db.clearAll();
 await db.put('companies',{id:company,name:'empty'});
 Auth.currentUser={id:'phase2-admin',role:'admin'};
 CompanyService.activeCompanyId=company;
 await accounts.createPeriod({name:'سال',startDate:'1405/01/01',endDate:'1405/12/29'});
 await accounts.seedDefaultChart();
 await retail.activate();
 const banks=(await db.getAll('treasury')).filter(x=>x.companyId===company&&x.recordType==='account');
 assert.equal(banks.length,1);
 assert.ok(banks[0].ledgerAccountId);
 assert.ok((await accounts.listAccounts()).some(a=>a.id===banks[0].ledgerAccountId));
 assert.equal((await db.getAll('journal_entries')).length,0);
});
