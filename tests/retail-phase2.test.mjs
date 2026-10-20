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
test('regression: pre-existing 101 cash subsidiary permits activation and cash settlement',async()=>{
  await db.clearAll();
  await db.put('companies',{id:company,name:'Existing account hierarchy'});
  Auth.currentUser={id:'phase2-admin',role:'admin',username:'admin'};
  CompanyService.activeCompanyId=company;
  await accounts.createPeriod({name:'۱۴۰۵',startDate:'1405/01/01',endDate:'1405/12/29'});
  await accounts.seedDefaultChart();
  const existing=await accounts.addAccount({code:'101001',name:'صندوق متصل قبلی',
    level:'subsidiary',parentCode:'101',type:'asset'});
  await db.put('treasury',{id:'cash-existing',companyId:company,recordType:'account',
    name:'صندوق قبلی',isActive:true,isDefault:true,initialBalance:0,ledgerAccountId:existing.id});
  assert.deepEqual(await retail.activate(),{enabled:true});
  assert.equal((await retail.activate()).alreadyEnabled,true);
  const cashParent=(await accounts.listAccounts()).find(x=>x.code==='101');
  assert.equal(cashParent.postable,false);
  const cash=(await db.get('treasury','cash-existing'));
  assert.equal(cash.ledgerAccountId,existing.id);
  assert.equal((await accounts.listAccounts()).filter(a=>a.parentCode==='101').length,1);
  await db.put('products',{id:'product-1',companyId:company,trackInventory:true,name:'کالا'});
  await db.put('contacts',{id:'contact-1',companyId:company,name:'مشتری'});
  await purchase10();
  const sale=await sale3({paidAmount:200});
  assert.equal(sale.paidAmount,200);
  const lines=await db.getAll('journal_lines');
  assert.ok(lines.some(l=>l.accountId===existing.id&&l.debit===200));
  const totals=(await accounts.trialBalance()).totals;
  assert.equal(totals.debit,totals.credit);
});
test('regression: non-postable 101 with other children creates valid mapped cash subledger',async()=>{
  await db.clearAll();
  await db.put('companies',{id:company,name:'Previous chart'});
  Auth.currentUser={id:'phase2-admin',role:'admin',username:'admin'};
  CompanyService.activeCompanyId=company;
  await accounts.createPeriod({name:'۱۴۰۵',startDate:'1405/01/01',endDate:'1405/12/29'});
  await accounts.seedDefaultChart();
  await accounts.addAccount({code:'101001',name:'صندوق فرعی قدیمی',
    level:'subsidiary',parentCode:'101',type:'asset'});
  const cashParent=(await accounts.listAccounts()).find(x=>x.code==='101');
  await db.put('account_chart',{...cashParent,postable:false});
  assert.deepEqual(await retail.activate(),{enabled:true});
  const cashAccounts=(await db.getAll('treasury')).filter(x=>x.companyId===company&&x.recordType==='account');
  assert.equal(cashAccounts.length,1);
  const ledger=(await accounts.listAccounts()).find(x=>x.id===cashAccounts[0].ledgerAccountId);
  assert.equal(ledger.parentCode,'101');
  assert.notEqual(ledger.code,'101001');
  assert.equal(ledger.active,true);
});

test('A01: sales and purchase returns cannot silently refund or collect cash', async () => {
  await setup();
  const purchased = await purchase10();
  const sold = await sale3({ paidAmount: 200 });
  const original = {
    invoices: (await db.getAll('invoices')).length,
    treasury: (await db.getAll('treasury')).length,
    journals: (await db.getAll('journal_entries')).length,
    stock: (await db.getAll('stock_movements')).length,
    settlements: (await db.getAll('settlements')).length
  };
  for (const draft of [
    invoice('sale_return', 1, 200, { originalInvoiceId: sold.id, paidAmount: 100 }),
    invoice('purchase_return', 1, 100, { originalInvoiceId: purchased.id, paidAmount: 100 })
  ]) {
    await assert.rejects(retail.issueInvoice(draft), /سند مستقل خزانه/);
    assert.equal(await db.get('invoices', draft.id), undefined);
    assert.equal((await db.getAll('invoices')).length, original.invoices);
    assert.equal((await db.getAll('treasury')).length, original.treasury);
    assert.equal((await db.getAll('journal_entries')).length, original.journals);
    assert.equal((await db.getAll('stock_movements')).length, original.stock);
    assert.equal((await db.getAll('settlements')).length, original.settlements);
  }
});

test('A01/A03: a referenced customer return creates one atomic correction and correlated audit record', async () => {
  await setup();
  await purchase10();
  const sold = await sale3({ paidAmount: 200 });
  const returned = await retail.issueInvoice(invoice('sale_return', 1, 200, {
    originalInvoiceId: sold.id
  }));
  const corrections = await db.getAll('document_corrections');
  assert.equal(corrections.length, 1);
  const correction = corrections[0];
  assert.equal(correction.companyId, company);
  assert.equal(correction.sourceId, sold.id);
  assert.equal(correction.resultId, returned.id);
  assert.equal(correction.correctionType, 'return');
  assert.equal(correction.reasonCode, 'customer_return');
  assert.equal(correction.actorId, 'phase2-admin');
  assert.ok(correction.idempotencyKey.includes(returned.id));
  const audits = await db.getAll('audit_events');
  assert.ok(audits.some(a => a.sourceId === returned.journalId &&
    a.correlationId === correction.correlationId &&
    a.eventType === 'commercial_journal_posted'));
  assert.equal((await db.get('invoices', sold.id)).grandTotal, 600);
  assert.equal((await db.get('invoices', sold.id)).paidAmount, 200);
  assert.equal((await db.getAll('settlements')).length, 1);
  assert.equal((await db.getAll('stock_movements')).filter(x => x.refId === returned.id).length, 1);
  await assert.rejects(retail.issueInvoice(invoice('sale_return', 3, 200, {
    originalInvoiceId: sold.id
  })), /بیشتر/);
  assert.equal((await db.getAll('document_corrections')).length, 1);
});

test('A01: customer returns reject non-posted legacy origin without partial writes', async () => {
  await setup();
  await purchase10();
  await db.put('invoices', {
    id: 'old-unposted', companyId: company, kind: 'sale',
    financePosted: false, isPreInvoice: false,
    contactId: 'contact-1', items: [{
      productId: 'product-1', qty: 2, price: 200,
      lineTotal: 400, lineSubtotal: 400
    }],
    grandTotal: 400, subtotal: 400, totalDiscount: 0, vatAmount: 0, number: 'legacy'
  });
  const countBefore = (await db.getAll('journal_entries')).length;
  const target = invoice('sale_return', 1, 200, { originalInvoiceId: 'old-unposted' });
  await assert.rejects(retail.issueInvoice(target), /سازگار نیست/);
  assert.equal(await db.get('invoices', target.id), undefined);
  assert.equal((await db.getAll('journal_entries')).length, countBefore);
  assert.equal((await db.getAll('document_corrections')).length, 0);
});

test('A01: inflated return price cannot credit more than the original sale total', async () => {
  await setup();
  await purchase10();
  const original = await sale3({ paidAmount: 200 });
  const before = {
    stock: await db.getAll('stock_movements'),
    journals: await db.getAll('journal_entries'),
    settlements: await db.getAll('settlements'),
    invoices: await db.getAll('invoices')
  };
  const inflated = invoice('sale_return', 1, 650, { originalInvoiceId: original.id });
  await assert.rejects(retail.issueInvoice(inflated), /مجموع مبلغ مرجوعی/);
  assert.deepEqual(await db.getAll('stock_movements'), before.stock);
  assert.deepEqual(await db.getAll('journal_entries'), before.journals);
  assert.deepEqual(await db.getAll('settlements'), before.settlements);
  assert.deepEqual(await db.getAll('invoices'), before.invoices);
});

test('A01: successive returns cannot exceed original gross even if total quantities fit', async () => {
  await setup();
  await purchase10();
  const original = await sale3();
  await retail.issueInvoice(invoice('sale_return', 1, 400, {
    originalInvoiceId: original.id
  }));
  const excessive = invoice('sale_return', 1, 300, { originalInvoiceId: original.id });
  await assert.rejects(retail.issueInvoice(excessive), /مجموع مبلغ مرجوعی/);
  assert.equal((await db.getAll('document_corrections')).length, 1);
});

test('A05: inactive treasury accounts reject transfers, expenses and cheque clearance atomically',async()=>{
 await setup();await purchase10();await sale3();
 const active=await db.get('treasury','cash-1');
 const second=await retail.createTreasuryAccount({
   id:'disabled-a05',companyId:company,recordType:'account',
   type:'bank',name:'بانک مسدود',ownerUserId:'phase2-admin',
   initialBalance:0,isActive:true,isDefault:false
 });
 await db.put('treasury',{...second,isActive:false});
 const count=(name)=>db.getAll(name).then(rows=>rows.length);
 const before={journals:await count('journal_entries'),money:await count('treasury')};
 for(const [id,fromAccountId,toAccountId] of [
   ['disabled-transfer-to',active.id,second.id],
   ['disabled-transfer-from',second.id,active.id]
 ]){
   await assert.rejects(retail.postTransaction({
     id,type:'transfer',date,amount:45,fromAccountId,toAccountId
   }),/غیرفعال/);
   assert.equal(await db.get('treasury',id),undefined);
 }
 assert.equal(await count('journal_entries'),before.journals);
 assert.equal(await count('treasury'),before.money);
 await db.put('treasury',{...active,isActive:false});
 await assert.rejects(retail.postExpense({
   id:'disabled-expense',kind:'expense',date,amount:60,method:'cash',category:'تست'
 }),/صندوق یا بانک/);
 assert.equal(await db.get('expenses','disabled-expense'),undefined);
 await db.put('treasury',active);
 const cheque=await retail.postCheque({
   id:'disabled-cheque',direction:'inbound',status:'pending',
   issueDate:date,dueDate:date,contactId:'contact-1',amount:120,
   chequeNumber:'A05'
 });
 const preClear=await count('journal_entries');
 await assert.rejects(retail.changeChequeStatus(cheque.id,'cleared',{
   date,accountId:second.id
 }),/فعال نیست/);
 assert.equal((await db.get('cheques',cheque.id)).status,'pending');
 assert.equal(await count('journal_entries'),preClear);
 assert.equal((await db.getAll('treasury')).filter(x=>x.refChequeId===cheque.id).length,0);
 const cleared=await retail.changeChequeStatus(cheque.id,'cleared',{
   date,accountId:active.id
 });
 assert.equal(cleared.status,'cleared');
 await assert.rejects(retail.changeChequeStatus(cheque.id,'cleared',{
   date,accountId:active.id
 }),/در جریان/);
 assert.equal((await db.getAll('treasury')).filter(x=>x.refChequeId===cheque.id).length,1);
 const balance=await accounts.trialBalance();
 assert.equal(balance.totals.debit,balance.totals.credit);
});

test('A01: a return offsets receivables before any cash refund and caps later receipts to net amount',async()=>{
 await setup();await purchase10();
 const sold=await retail.issueInvoice(invoice('sale',3,200,{paidAmount:200}));
 const returned=await retail.issueInvoice(invoice('sale_return',1,200,{
   originalInvoiceId:sold.id
 }));
 const before=(await db.getAll('journal_entries')).length;
 await assert.rejects(retail.postTransaction({
   id:'a01-invalid-refund',type:'payment',date,amount:1,
   refInvoiceId:returned.id,contactId:'contact-1',fromAccountId:'cash-1'
 }),/بازپرداخت مجاز/);
 await assert.rejects(retail.postTransaction({
   id:'a01-overcollect',type:'receipt',date,amount:201,
   refInvoiceId:sold.id,contactId:'contact-1',toAccountId:'cash-1'
 }),/مانده خالص/);
 assert.equal((await db.getAll('journal_entries')).length,before);
 assert.equal(await db.get('treasury','a01-invalid-refund'),undefined);
 assert.equal(await db.get('treasury','a01-overcollect'),undefined);
 const receipt=await retail.postTransaction({
   id:'a01-valid-remaining',type:'receipt',date,amount:200,
   refInvoiceId:sold.id,contactId:'contact-1',toAccountId:'cash-1'
 });
 assert.equal(receipt.amount,200);
 assert.equal((await db.get('invoices',sold.id)).paidAmount,400);
 await assert.rejects(retail.postTransaction({
   id:'a01-extra-collection',type:'receipt',date,amount:1,
   refInvoiceId:sold.id,contactId:'contact-1',toAccountId:'cash-1'
 }),/مانده خالص/);
 const trial=await accounts.trialBalance();
 assert.equal(trial.totals.debit,trial.totals.credit);
});

test('A01: only genuinely paid customer credit may be refunded, once, even with concurrent requests',async()=>{
 await setup();await purchase10();
 const sold=await retail.issueInvoice(invoice('sale',3,200,{paidAmount:500}));
 const returned=await retail.issueInvoice(invoice('sale_return',1,200,{
   originalInvoiceId:sold.id
 }));
 const attempts=await Promise.allSettled([
   retail.postTransaction({id:'refund-a',type:'payment',date,amount:70,
     refInvoiceId:returned.id,contactId:'contact-1',fromAccountId:'cash-1'}),
   retail.postTransaction({id:'refund-b',type:'payment',date,amount:70,
     refInvoiceId:returned.id,contactId:'contact-1',fromAccountId:'cash-1'})
 ]);
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(attempts.filter(x=>x.status==='rejected').length,1);
 assert.equal((await db.get('invoices',returned.id)).paidAmount,70);
 const finish=await retail.postTransaction({
   id:'refund-final',type:'payment',date,amount:30,
   refInvoiceId:returned.id,contactId:'contact-1',fromAccountId:'cash-1'
 });
 assert.equal(finish.amount,30);
 await assert.rejects(retail.postTransaction({
   id:'refund-excess',type:'payment',date,amount:1,
   refInvoiceId:returned.id,contactId:'contact-1',fromAccountId:'cash-1'
 }),/بازپرداخت مجاز/);
 assert.equal((await db.get('invoices',returned.id)).paidAmount,100);
 assert.equal((await db.getAll('treasury')).filter(t=>
   t.refInvoiceId===returned.id&&t.recordType==='transaction').length,2);
 const balance=await accounts.trialBalance();
 assert.equal(balance.totals.debit,balance.totals.credit);
});

test('A01: customer credit refund requires administrator and rejected attempt leaves no writes',async()=>{
  await setup();await purchase10();
  const sold=await retail.issueInvoice(invoice('sale',3,200,{paidAmount:500}));
  const returned=await retail.issueInvoice(invoice('sale_return',1,200,{
    originalInvoiceId:sold.id
  }));
  const beforeJournals=(await db.getAll('journal_entries')).length;
  const beforeAudits=(await db.getAll('audit_events')).length;
  Auth.currentUser={id:'phase2-clerk',role:'user',username:'clerk',companyIds:[company]};
  await assert.rejects(retail.postTransaction({
    id:'unauthorized-return-refund',type:'payment',date,amount:25,
    refInvoiceId:returned.id,contactId:'contact-1',fromAccountId:'cash-1'
  }),/فقط توسط مدیر/);
  assert.equal(await db.get('treasury','unauthorized-return-refund'),undefined);
  assert.equal((await db.get('invoices',returned.id)).paidAmount,0);
  assert.equal((await db.getAll('journal_entries')).length,beforeJournals);
  assert.equal((await db.getAll('audit_events')).length,beforeAudits);
  Auth.currentUser={id:'phase2-admin',role:'admin',username:'admin'};
  const approved=await retail.postTransaction({
    id:'approved-return-refund',type:'payment',date,amount:25,
    refInvoiceId:returned.id,contactId:'contact-1',fromAccountId:'cash-1'
  });
  assert.equal(approved.amount,25);
  assert.equal((await db.get('invoices',returned.id)).paidAmount,25);
  const trial=await accounts.trialBalance();
  assert.equal(trial.totals.debit,trial.totals.credit);
});

test('A01: supplier cash recovery cannot exceed previously paid credit after purchase return',async()=>{
 await setup();
 const purchased=await retail.issueInvoice(invoice('purchase',10,100,{paidAmount:700}));
 const returned=await retail.issueInvoice(invoice('purchase_return',4,100,{
   originalInvoiceId:purchased.id
 }));
 await assert.rejects(retail.postTransaction({
   id:'supplier-refund-over',type:'receipt',date,amount:101,
   refInvoiceId:returned.id,contactId:'contact-1',toAccountId:'cash-1'
 }),/بازپرداخت مجاز/);
 const cash=await retail.postTransaction({
   id:'supplier-refund-valid',type:'receipt',date,amount:100,
   refInvoiceId:returned.id,contactId:'contact-1',toAccountId:'cash-1'
 });
 assert.equal(cash.amount,100);
 await assert.rejects(retail.postTransaction({
   id:'supplier-refund-excess',type:'receipt',date,amount:1,
   refInvoiceId:returned.id,contactId:'contact-1',toAccountId:'cash-1'
 }),/بازپرداخت مجاز/);
 const trial=await accounts.trialBalance();
 assert.equal(trial.totals.debit,trial.totals.credit);
});
