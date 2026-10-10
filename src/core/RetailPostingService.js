// Phase 2 transactional commercial posting. Every dependent row shares one IndexedDB transaction.
import { StorageService } from './StorageService.js';
import { DataScope } from './DataScope.js';
import { Auth } from './Auth.js';
import { validateJournal, journalSourceKey, assertJalaliDate } from './AccountingCore.mjs';
import { LEDGER_CODES, INVOICE_DIRECTIONS, amount, positiveAmount,
  qtyUnits, fromQtyUnits, receiveStock, issueStock, allocateDiscount,
  postLine, differenceLines, assertInvoiceTotals } from './RetailFinanceCore.mjs';

export const FINANCE_STORES = Object.freeze([
  'account_chart','fiscal_periods','journal_entries','journal_lines',
  'invoices','invoice_items','stock_movements','products','contacts','treasury',
  'warehouses','inventory_balances','stocktakes','stocktake_lines',
  'settlements','expenses','cheques','settings','account_mappings'
]);
const uid=p=>StorageService.uid(p);
const actor=()=>Auth.current()?.id||null;
const activeKey=company=>'finance_v2_enabled_'+company;
const balanceId=(c,w,p)=>JSON.stringify([c,w,p]);
const today=()=>new Date().toISOString();
const sameCompany=(record,company,label)=>{
  if(!record||record.companyId!==company)throw Error(label+' در شرکت فعال یافت نشد');
  return record;
};
const leg=(ctx,code)=> {
  const acct=ctx.accounts.find(a=>a.code===code);
  if(!acct||acct.active===false||acct.postable===false||acct.level==='group'||
     ctx.accounts.some(a=>a.parentCode===acct.code))throw Error('حساب عملیاتی '+code+' فعال یا قابل ثبت نیست');
  return acct.id;
};

class RetailPostingServiceImpl {
  async isEnabled() {
    const company=await DataScope.companyId();
    return !!(await StorageService.get('settings',activeKey(company)))?.enabled;
  }
  async activate() {
    if(!Auth.isAdmin())throw Error('فعال‌سازی فقط با مدیر سیستم مجاز است');
    const company=await DataScope.companyId(),user=actor();
    return StorageService.transaction(FINANCE_STORES,async tx=>{
      if((await tx.get('settings',activeKey(company)))?.enabled)return {alreadyEnabled:true};
      const issued=(await tx.getAll('invoices')).filter(x=>x.companyId===company&&!x.isPreInvoice);
      const moves=(await tx.getAll('stock_movements')).filter(x=>x.companyId===company);
      const money=(await tx.getAll('treasury')).filter(x=>x.companyId===company&&x.recordType==='transaction');
      const costs=(await tx.getAll('expenses')).filter(x=>x.companyId===company);
      const cheques=(await tx.getAll('cheques')).filter(x=>x.companyId===company);
      if(issued.length||moves.length||money.length||costs.length||cheques.length){
        throw Error('این شرکت گردش قبلی دارد؛ ابتدا مانده افتتاحیه و تبدیل اطلاعات در محیط کنترل‌شده تأیید شود. برای آزمون از شرکت خالی استفاده کنید');
      }
      const accounts=await tx.getAllByIndex('account_chart','companyId',company);
      const moneyAccounts=(await tx.getAll('treasury')).filter(a=>a.companyId===company&&a.recordType==='account');
      if(!moneyAccounts.length){
        const defaultCash={id:uid('cash_'),companyId:company,ownerUserId:user,
          recordType:'account',type:'cashbox',name:'صندوق اصلی',
          initialBalance:0,isActive:true,isDefault:true};
        await tx.put('treasury',defaultCash);
        moneyAccounts.push(defaultCash);
      }
      if(moneyAccounts.some(a=>Number(a.initialBalance||0)!==0))
        throw Error('مانده افتتاحیه صندوق/بانک باید ابتدا با سند افتتاحیه کنترل شود؛ فعال‌سازی متوقف شد');
      const periods=await tx.getAllByIndex('fiscal_periods','companyId',company);
      if(!periods.some(p=>!p.closed))throw Error('ابتدا یک دوره مالی باز تعریف کنید');
      const ctx={accounts};
      for(const code of Object.values(LEDGER_CODES))leg(ctx,code);
      const cashHeader=accounts.find(a=>a.code==='101');
      const oldLines=await tx.getAllByIndex('journal_lines','companyId',company);
      if(moneyAccounts.length && oldLines.some(l=>l.accountId===cashHeader?.id))
        throw Error('حساب ۱۰۱ گردش سند دستی دارد؛ قبل از ایجاد حساب‌های بانک باید انتقال و افتتاحیه آن تطبیق شود');
      let nextCash=1;
      for(const account of moneyAccounts){
        let code;
        do{code='101'+String(nextCash++).padStart(3,'0')}while(accounts.some(a=>a.code===code));
        const sub={id:uid('acc_'),code,name:account.name||'صندوق یا بانک',companyId:company,
          type:'asset',level:'subsidiary',parentCode:'101',active:true,postable:true};
        await tx.put('account_chart',sub);accounts.push(sub);
        await tx.put('treasury',{...account,ledgerAccountId:sub.id});
      }
      const warehouses=await tx.getAllByIndex('warehouses','companyId',company);
      if(!warehouses.length)await tx.put('warehouses',{id:uid('wh_'),companyId:company,ownerUserId:user,name:'انبار اصلی',isDefault:true,active:true});
      await tx.put('settings',{id:activeKey(company),companyId:company,enabled:true,createdBy:user,enabledAt:today()});
      return {enabled:true};
    });
  }
  async createTreasuryAccount(row) {
    const company=await DataScope.companyId();
    if(!Auth.isAdmin())throw Error('ایجاد صندوق/بانک فقط برای مدیر مجاز است');
    if(amount(row.initialBalance||0)!==0)throw Error('مانده افتتاحیه بانک باید در سند افتتاحیه ثبت شود');
    return StorageService.transaction(FINANCE_STORES,async tx=>{
      const accounts=await tx.getAllByIndex('account_chart','companyId',company);
      const parent=accounts.find(a=>a.code==='101'&&a.level==='general');
      if(!parent)throw Error('حساب ۱۰۱ موجود نیست');
      const history=await tx.getAllByIndex('journal_lines','companyId',company);
      if(history.some(l=>l.accountId===parent.id))
        throw Error('حساب ۱۰۱ دارای گردش مستقیم است؛ افزودن زیرحساب بانکی نیازمند اصلاح کدینگ است');
      let n=1,code;
      do{code='101'+String(n++).padStart(3,'0')}while(accounts.some(a=>a.code===code));
      const account={id:uid('acc_'),companyId:company,code,type:'asset',
        level:'subsidiary',parentCode:'101',name:row.name,active:true,postable:true};
      await tx.put('account_chart',account);
      const existing=(await tx.getAll('treasury')).filter(x=>x.companyId===company&&x.recordType==='account');
      const result={...row,companyId:company,recordType:'account',
        ledgerAccountId:account.id,isDefault:!existing.length};
      await tx.put('treasury',result);
      return result;
    });
  }
  async defaultWarehouse(tx,company) {
    const all=await tx.getAllByIndex('warehouses','companyId',company);
    const warehouse=all.find(x=>x.isDefault&&x.active!==false)||all.find(x=>x.active!==false);
    if(!warehouse)throw Error('انبار فعالی وجود ندارد');
    return warehouse.id;
  }
  async context(tx,company,date) {
    assertJalaliDate(date);
    const accounts=await tx.getAllByIndex('account_chart','companyId',company);
    const periods=await tx.getAllByIndex('fiscal_periods','companyId',company);
    const period=periods.find(p=>p.startDate<=date&&date<=p.endDate);
    if(!period||period.closed||period.status==='closed')throw Error('برای تاریخ رویداد، دوره مالی باز وجود ندارد');
    return {companyId:company,date,period,accounts};
  }
  async journal(tx,ctx,kind,id,lines,description,revision=1) {
    const filtered=lines.filter(Boolean);
    const totals=validateJournal({companyId:ctx.companyId,date:ctx.date,lines:filtered},ctx.accounts,ctx.period);
    const key=journalSourceKey(ctx.companyId,kind,id,revision);
    if((await tx.getAllByIndex('journal_entries','sourceKey',key)).length)throw Error('رویداد مالی قبلاً ثبت شده است');
    const journal={id:uid('jn_'),companyId:ctx.companyId,periodId:ctx.period.id,date:ctx.date,
      status:'posted',sourceKey:key,sourceType:kind,sourceId:id,revision,
      description,createdBy:actor(),postedBy:actor(),postedAt:today(),...totals};
    await tx.put('journal_entries',journal);
    for(const [position,line] of filtered.entries()) {
      await tx.put('journal_lines',{...line,id:uid('jl_'),journalId:journal.id,
        companyId:ctx.companyId,position});
    }
    return journal;
  }
  async stock(tx,ctx,warehouseId,item,direction,costValue,refId,refType='invoice') {
    if(refType!=='stocktake'){
      const sessions=await tx.getAllByIndex('stocktakes','warehouseId',warehouseId);
      if(sessions.some(s=>s.companyId===ctx.companyId&&s.status==='draft'))
        throw Error('انبار در حال شمارش است؛ تا بستن جلسه، ورود و خروج کالا متوقف است');
    }
    const product=sameCompany(await tx.get('products',item.productId),ctx.companyId,'کالا');
    if(product.trackInventory===false)return {cost:0};
    const id=balanceId(ctx.companyId,warehouseId,product.id);
    const before=await tx.get('inventory_balances',id);
    const next=direction==='in'?receiveStock(before,item.qty,costValue):issueStock(before,item.qty);
    await tx.put('inventory_balances',{id,companyId:ctx.companyId,warehouseId,productId:product.id,
      quantityUnits:next.quantityUnits,value:next.value});
    await tx.put('stock_movements',{id:uid('mv_'),companyId:ctx.companyId,ownerUserId:actor(),
      warehouseId,productId:product.id,type:direction,qty:item.qty,
      cost:next.cost,refType,refId,note:'سند '+refId,date:ctx.date});
    return {cost:next.cost};
  }
  async issueInvoice(invoice) {
    const company=await DataScope.companyId();
    if(!await this.isEnabled())throw Error('حسابداری یکپارچه برای این شرکت فعال نیست');
    assertInvoiceTotals(invoice);
    if(invoice.isPreInvoice)throw Error('پیش‌فاکتور نباید سند مالی تولید کند');
    if(!invoice.id)throw Error('شناسه یکتای فاکتور الزامی است');
    return StorageService.transaction(FINANCE_STORES,async tx=>{
      const ctx=await this.context(tx,company,invoice.date);
      const kinds=INVOICE_DIRECTIONS;
      if(!kinds[invoice.kind])throw Error('نوع فاکتور نامعتبر است');
      const old=await tx.get('invoices',invoice.id);
      if(old&&(!old.isPreInvoice||old.companyId!==company))throw Error('فاکتور قطعی از این مسیر قابل بازنویسی نیست');
      const existing=(await tx.getAll('invoices')).filter(i=>i.companyId===company&&!i.isPreInvoice);
      if(existing.some(i=>String(i.number)===String(invoice.number)))throw Error('شماره فاکتور تکراری است');
      if(invoice.contactId)sameCompany(await tx.get('contacts',invoice.contactId),company,'طرف حساب');
      if(['sale_return','purchase_return'].includes(invoice.kind)){
        if(!invoice.originalInvoiceId)throw Error('فاکتور مرجوعی باید به فاکتور اولیه متصل باشد');
        const origin=sameCompany(await tx.get('invoices',invoice.originalInvoiceId),company,'فاکتور اولیه');
        const validKinds=invoice.kind==='sale_return'?['sale','non_formal']:['purchase'];
        if(!validKinds.includes(origin.kind)||origin.isPreInvoice)
          throw Error('نوع فاکتور اولیه با مرجوعی سازگار نیست');
        if(origin.contactId!==invoice.contactId)
          throw Error('طرف حساب مرجوعی با فاکتور اولیه مطابقت ندارد');
        const otherReturns=existing.filter(x=>x.kind===invoice.kind&&x.originalInvoiceId===origin.id);
        const returnedRows=otherReturns.flatMap(x=>x.items||[]);
        const ids=new Set(invoice.items.map(x=>x.productId||x.productName));
        for(const id of ids){
          const matching=x=>(x.productId||x.productName)===id;
          const base=(origin.items||[]).filter(matching).reduce((sum,x)=>sum+qtyUnits(x.qty),0);
          const was=returnedRows.filter(matching).reduce((sum,x)=>sum+qtyUnits(x.qty),0);
          const requested=invoice.items.filter(matching).reduce((sum,x)=>sum+qtyUnits(x.qty),0);
          if(!base||was+requested>base)throw Error('تعداد مرجوعی از مقدار فاکتور اصلی بیشتر است');
        }
      }
      const warehouseId=invoice.warehouseId||await this.defaultWarehouse(tx,company);
      sameCompany(await tx.get('warehouses',warehouseId),company,'انبار');
      const details=allocateDiscount(invoice.items,invoice.totalDiscount);
      let stockCost=0,trackedNet=0,serviceNet=0;
      const returnAllocated = new Map();
      for(const item of details){
        if(!item.productId){serviceNet+=item.netLineTotal;continue}
        const product=sameCompany(await tx.get('products',item.productId),company,'کالا');
        if(product.trackInventory===false){serviceNet+=item.netLineTotal;continue}
        trackedNet+=item.netLineTotal;
        let inboundCost=item.netLineTotal;
        if(invoice.kind==='sale_return'){
          if(!invoice.originalInvoiceId)throw Error('مرجوعی فروش کالای انباری باید به فاکتور فروش اولیه متصل باشد');
          const origin=sameCompany(await tx.get('invoices',invoice.originalInvoiceId),company,'فاکتور اصلی');
          if(!['sale','non_formal'].includes(origin.kind)||origin.isPreInvoice)throw Error('مرجع برگشت فروش معتبر نیست');
          if(origin.contactId!==invoice.contactId)throw Error('طرف حساب برگشت با فروش اولیه یکسان نیست');
          const priorReturns=(await tx.getAll('invoices')).filter(x=>x.companyId===company &&
            x.kind==='sale_return'&&!x.isPreInvoice&&x.originalInvoiceId===origin.id);
          const alreadyReturned=priorReturns.flatMap(x=>x.items||[])
            .filter(x=>x.productId===item.productId).reduce((sum,x)=>sum+qtyUnits(x.qty),0);
          const originalLines=(await tx.getAll('stock_movements')).filter(m=>m.companyId===company&&
            m.refId===origin.id&&m.productId===item.productId&&m.type==='out');
          const originUnits=originalLines.reduce((s,m)=>s+qtyUnits(m.qty),0);
          const originCost=originalLines.reduce((s,m)=>s+amount(m.cost||0),0);
          if(!originUnits)throw Error('بهای تمام‌شده سند فروش اولیه یافت نشد');
          const incomingUnits=invoice.items.filter(x=>x.productId===item.productId)
            .reduce((sum,x)=>sum+qtyUnits(x.qty),0);
          if(alreadyReturned+incomingUnits>originUnits)throw Error('تعداد برگشت از مقدار فروخته‌شده بیشتر است');
          const priorReturnIds=new Set(priorReturns.map(x=>x.id));
          const priorCost=(await tx.getAll('stock_movements')).filter(m=>m.companyId===company&&
            priorReturnIds.has(m.refId)&&m.productId===item.productId&&m.type==='in')
            .reduce((sum,m)=>sum+amount(m.cost||0),0);
          const seen=returnAllocated.get(item.productId)||{units:0,cost:0};
          const rowUnits=qtyUnits(item.qty);
          const completes=alreadyReturned+incomingUnits===originUnits &&
            seen.units+rowUnits===incomingUnits;
          inboundCost=completes?originCost-priorCost-seen.cost:
            Math.round(originCost*rowUnits/originUnits);
          if(inboundCost<0)throw Error('بهای تمام‌شده برگشت بیش از بهای فاکتور اصلی است');
          returnAllocated.set(item.productId,{units:seen.units+rowUnits,cost:seen.cost+inboundCost});
        }
        const update=await this.stock(tx,ctx,warehouseId,item,kinds[invoice.kind],inboundCost,invoice.id);
        stockCost+=update.cost;
      }
      const net=amount(invoice.subtotal)-amount(invoice.totalDiscount);
      const grand=amount(invoice.grandTotal),vat=amount(invoice.vatAmount);
      const ref={contactId:invoice.contactId||null};
      const lines=[];
      const add=(code,debit,credit)=>{const l=postLine(leg(ctx,LEDGER_CODES[code]),debit,credit,ref);if(l)lines.push(l)};
      switch(invoice.kind){
        case 'sale': case 'non_formal':
          add('receivable',grand,0);add('revenue',0,net);add('outputVat',0,vat);
          add('cogs',stockCost,0);add('inventory',0,stockCost);break;
        case 'purchase':
          add('inventory',trackedNet,0);add('expense',serviceNet,0);
          add('inputVat',vat,0);add('payable',0,grand);break;
        case 'sale_return':
          add('revenue',net,0);add('outputVat',vat,0);add('receivable',0,grand);
          add('inventory',stockCost,0);add('cogs',0,stockCost);break;
        case 'purchase_return':
          add('payable',grand,0);add('inventory',0,stockCost);
          add('expense',0,serviceNet);add('inputVat',0,vat);
          { const variance=differenceLines(leg(ctx,LEDGER_CODES.variance),stockCost-trackedNet,ref);
            if(variance)lines.push(variance); }
          break;
      }
      const journal=await this.journal(tx,ctx,'invoice',invoice.id,lines,'فاکتور '+invoice.number);
      const issued={...invoice,companyId:company,ownerUserId:actor(),warehouseId,
        financePosted:true,journalId:journal.id,status:invoice.paidAmount?'partial':'unpaid',
        remaining:grand,paidAmount:0};
      await tx.put('invoices',issued);
      const previousItems=await tx.getAllByIndex('invoice_items','invoiceId',invoice.id);
      for(const oldItem of previousItems){
        if(oldItem.companyId!==company)throw Error('اقلام فاکتور متعلق به شرکت دیگری است');
        await tx.delete('invoice_items',oldItem.id);
      }
      for(const [position,item] of invoice.items.entries()){
        await tx.put('invoice_items',{...item,id:uid('ii_'),companyId:company,
          invoiceId:invoice.id,position});
      }
      if(invoice.paidAmount){
        const isIncoming=['sale','non_formal','purchase_return'].includes(invoice.kind);
        await this.recordCash(tx,ctx,{amount:invoice.paidAmount,
          contactId:invoice.contactId,invoiceId:invoice.id,method:invoice.paymentMethod,
          type:isIncoming?'receipt':'payment',referenceKind:invoice.kind});
      }
      return (await tx.get('invoices',invoice.id));
    });
  }
  async recordCash(tx,ctx,info) {
    const sum=positiveAmount(info.amount);
    if(!['receipt','payment','transfer'].includes(info.type))throw Error('نوع دریافت و پرداخت نامعتبر است');
    if(info.method==='cheque')throw Error('پرداخت چکی باید از گردش چک ثبت شود');
    const cashAccounts=(await tx.getAll('treasury')).filter(a=>a.companyId===ctx.companyId&&
      a.recordType==='account'&&a.isActive!==false);
    const chosen= info.type==='payment'?info.fromAccountId:info.toAccountId;
    if(chosen&&!cashAccounts.some(a=>a.id===chosen))throw Error('حساب بانکی/صندوق انتخاب‌شده متعلق به شرکت فعال نیست');
    const to=cashAccounts.find(a=>a.id===chosen)||cashAccounts.find(a=>a.isDefault)||cashAccounts[0];
    if(!to)throw Error('برای تسویه نقدی، حساب صندوق یا بانک فعال تعریف کنید');
    const cashLedger=to.ledgerAccountId?
      sameCompany(ctx.accounts.find(a=>a.id===to.ledgerAccountId),ctx.companyId,'حساب معین بانک').id:
      leg(ctx,LEDGER_CODES.cash);
    const id=info.transactionId||uid('tx_');
    if(await tx.get('treasury',id))throw Error('دریافت یا پرداخت تکراری است');
    if(info.contactId)sameCompany(await tx.get('contacts',info.contactId),ctx.companyId,'طرف حساب دریافت/پرداخت');
    let related=null;
    if(info.invoiceId) {
      related=sameCompany(await tx.get('invoices',info.invoiceId),ctx.companyId,'فاکتور تسویه');
      if(related.isPreInvoice||!related.financePosted)throw Error('این فاکتور در دفتر مالی قطعی نشده است');
      if(info.contactId&&related.contactId!==info.contactId)throw Error('شخص تراکنش با فاکتور متفاوت است');
      if(sum>related.remaining)throw Error('مبلغ تسویه بیش از مانده فاکتور است');
    }
    const isReceipt=info.type==='receipt';
    let otherCode=isReceipt?LEDGER_CODES.receivable:LEDGER_CODES.payable;
    if(related){
      const kind=related.kind;
      const expected=isReceipt?['sale','non_formal','purchase_return']:['purchase','sale_return'];
      if(!expected.includes(kind))throw Error('جهت دریافت/پرداخت با فاکتور مطابقت ندارد');
      if(kind==='purchase_return')otherCode=LEDGER_CODES.payable;
      if(kind==='sale_return')otherCode=LEDGER_CODES.receivable;
    }
    const side=leg(ctx,otherCode);
    const lines=[postLine(isReceipt?cashLedger:side,sum,0,{contactId:info.contactId||related?.contactId||null}),
      postLine(isReceipt?side:cashLedger,0,sum,{contactId:info.contactId||related?.contactId||null})];
    const journal=await this.journal(tx,ctx,'treasury',id,lines,'دریافت/پرداخت '+id);
    const transaction={id,companyId:ctx.companyId,ownerUserId:actor(),
      recordType:'transaction',type:info.type,date:ctx.date,amount:sum,
      fromAccountId:isReceipt?null:to.id,toAccountId:isReceipt?to.id:null,
      contactId:info.contactId||related?.contactId||null,refInvoiceId:related?.id||null,
      method:info.method||'cash',description:info.description||'',financePosted:true,journalId:journal.id};
    await tx.put('treasury',transaction);
    if(related){
      const paid=amount(related.paidAmount||0)+sum;
      await tx.put('invoices',{...related,paidAmount:paid,remaining:related.grandTotal-paid,
        status:paid===related.grandTotal?'paid':'partial'});
      await tx.put('settlements',{id:uid('set_'),companyId:ctx.companyId,
        invoiceId:related.id,transactionId:id,amount:sum,date:ctx.date,ownerUserId:actor()});
    }
    return transaction;
  }
  async transferCash(tx,ctx,info) {
    const sum=positiveAmount(info.amount),all=await tx.getAll('treasury');
    const from=sameCompany(all.find(a=>a.id===info.fromAccountId&&a.recordType==='account'),
      ctx.companyId,'حساب مبدا');
    const to=sameCompany(all.find(a=>a.id===info.toAccountId&&a.recordType==='account'),
      ctx.companyId,'حساب مقصد');
    if(from.id===to.id)throw Error('حساب مبدا و مقصد باید متفاوت باشند');
    const mapping=account=>account.ledgerAccountId?
      sameCompany(ctx.accounts.find(a=>a.id===account.ledgerAccountId),ctx.companyId,'سرفصل صندوق').id:
      leg(ctx,LEDGER_CODES.cash);
    const id=info.transactionId||uid('tx_');
    if(await tx.get('treasury',id))throw Error('تراکنش انتقال تکراری است');
    const journal=await this.journal(tx,ctx,'treasury',id,[
      postLine(mapping(to),sum,0),postLine(mapping(from),0,sum)
    ],'انتقال داخلی بین حساب‌ها');
    const row={id,companyId:ctx.companyId,ownerUserId:actor(),recordType:'transaction',
      type:'transfer',amount:sum,date:ctx.date,fromAccountId:from.id,toAccountId:to.id,
      contactId:null,method:'transfer',financePosted:true,journalId:journal.id,
      description:info.description||''};
    await tx.put('treasury',row);
    return row;
  }
  async postTransaction(data) {
    const company=await DataScope.companyId();
    if(!await this.isEnabled())throw Error('حسابداری یکپارچه غیرفعال است');
    return StorageService.transaction(FINANCE_STORES,async tx=>{
      const ctx=await this.context(tx,company,data.date);
      if(data.type==='transfer')return this.transferCash(tx,ctx,{...data,transactionId:data.id});
      return this.recordCash(tx,ctx,{...data,invoiceId:data.refInvoiceId,transactionId:data.id});
    });
  }
  async postExpense(row) {
    const company=await DataScope.companyId();
    if(!await this.isEnabled())throw Error('حسابداری یکپارچه غیرفعال است');
    return StorageService.transaction(FINANCE_STORES,async tx=>{
      const ctx=await this.context(tx,company,row.date);
      if(await tx.get('expenses',row.id))throw Error('سند هزینه/درآمد تکراری است');
      const sum=positiveAmount(row.amount);
      if(row.method==='cheque')throw Error('هزینه یا درآمد چکی را در بخش چک‌ها ثبت کنید');
      const cash=(await tx.getAll('treasury')).filter(a=>a.companyId===company&&a.recordType==='account');
      const selected=cash.find(a=>a.isDefault)||cash[0];
      if(!selected)throw Error('صندوق یا بانک برای ثبت هزینه/درآمد موجود نیست');
      const cashLedger=selected.ledgerAccountId?
        sameCompany(ctx.accounts.find(a=>a.id===selected.ledgerAccountId),company,'حساب مالی').id:
        leg(ctx,LEDGER_CODES.cash);
      const income=row.kind==='income';
      const other=leg(ctx,LEDGER_CODES[income?'otherRevenue':'expense']);
      const journal=await this.journal(tx,ctx,'expense',row.id,[
        postLine(income?cashLedger:other,sum,0),
        postLine(income?other:cashLedger,0,sum)
      ],row.description||row.category);
      const output={...row,companyId:company,financePosted:true,journalId:journal.id,
        treasuryAccountId:selected.id};
      await tx.put('expenses',output);
      await tx.put('treasury',{id:uid('tx_'),companyId:company,recordType:'transaction',
        type:income?'receipt':'payment',date:ctx.date,amount:sum,
        fromAccountId:income?null:selected.id,toAccountId:income?selected.id:null,
        contactId:null,refExpenseId:row.id,method:row.method||'cash',ownerUserId:actor(),
        financePosted:true,journalId:journal.id,description:row.description||row.category});
      return output;
    });
  }
  async postCheque(row) {
    const company=await DataScope.companyId();
    return StorageService.transaction(FINANCE_STORES,async tx=>{
      if(await tx.get('cheques',row.id))throw Error('چک تکراری است');
      const ctx=await this.context(tx,company,row.issueDate);
      positiveAmount(row.amount);
      if(!row.contactId)throw Error('چک باید طرف‌حساب معتبر داشته باشد');
      sameCompany(await tx.get('contacts',row.contactId),company,'شخص چک');
      const inbound=row.direction==='inbound';
      if(!inbound&&row.direction!=='outbound')throw Error('جهت چک نامعتبر است');
      if(row.status!=='pending')throw Error('چک جدید ابتدا باید در جریان ثبت شود');
      const sum=amount(row.amount),ref={contactId:row.contactId};
      const debit=leg(ctx,LEDGER_CODES[inbound?'chequeIn':'payable']);
      const credit=leg(ctx,LEDGER_CODES[inbound?'receivable':'chequeOut']);
      const journal=await this.journal(tx,ctx,'cheque',row.id,[
        postLine(debit,sum,0,ref),postLine(credit,0,sum,ref)
      ],'ثبت چک '+row.chequeNumber);
      const item={...row,companyId:company,status:'pending',statusVersion:1,
        financePosted:true,journalId:journal.id};
      await tx.put('cheques',item);
      return item;
    });
  }
  async changeChequeStatus(id,status,options={}) {
    const company=await DataScope.companyId();
    return StorageService.transaction(FINANCE_STORES,async tx=>{
      const cheque=sameCompany(await tx.get('cheques',id),company,'چک');
      if(!cheque.financePosted)throw Error('چک قدیمی فاقد سند مالی است؛ ابتدا تعیین تکلیف شود');
      if(cheque.status!=='pending')throw Error('تنها چک در جریان قابل تعیین تکلیف است');
      if(!['cleared','bounced','returned','spent'].includes(status))throw Error('وضعیت چک نامعتبر است');
      if(status==='spent'&&cheque.direction!=='inbound')throw Error('فقط چک دریافتی قابل خرج‌کرد است');
      const ctx=await this.context(tx,company,options.date||cheque.dueDate);
      const sum=amount(cheque.amount),inbound=cheque.direction==='inbound';
      const ref={contactId:cheque.contactId};
      const accounts=(await tx.getAll('treasury')).filter(a=>a.companyId===company&&a.recordType==='account');
      if(options.accountId&&!accounts.some(a=>a.id===options.accountId))
        throw Error('حساب بانکی انتخاب‌شده در شرکت فعال وجود ندارد');
      const bank=accounts.find(a=>a.id===options.accountId)||accounts.find(a=>a.isDefault)||accounts[0];
      if(status==='cleared'&&!bank)throw Error('حساب بانک یا صندوق برای وصول چک مشخص نیست');
      const bankLedger=status==='cleared'?(bank?.ledgerAccountId?
        sameCompany(ctx.accounts.find(a=>a.id===bank.ledgerAccountId),company,'حساب بانک').id:
        leg(ctx,LEDGER_CODES.cash)):null;
      const chequeAccount=leg(ctx,LEDGER_CODES[inbound?'chequeIn':'chequeOut']);
      let target;
      if(status==='cleared')target=bankLedger;
      else if(status==='spent')target=leg(ctx,LEDGER_CODES.payable);
      else target=leg(ctx,LEDGER_CODES[inbound?'receivable':'payable']);
      const lines=inbound?
        [postLine(target,sum,0,ref),postLine(chequeAccount,0,sum,ref)]:
        [postLine(chequeAccount,sum,0,ref),postLine(target,0,sum,ref)];
      const journal=await this.journal(tx,ctx,'cheque_status',id,lines,'تغییر وضعیت چک '+status,2);
      const updated={...cheque,status,statusVersion:2,
        statusJournalId:journal.id,statusChangedAt:today()};
      await tx.put('cheques',updated);
      if(status==='cleared'){
        if(!bank)throw Error('بانک یا صندوق چک مشخص نیست');
        await tx.put('treasury',{id:uid('tx_'),companyId:company,recordType:'transaction',
          type:inbound?'receipt':'payment',date:ctx.date,amount:sum,
          toAccountId:inbound?bank.id:null,fromAccountId:inbound?null:bank.id,
          contactId:null,refChequeId:id,method:'cheque',financePosted:true,
          journalId:journal.id,ownerUserId:actor(),description:'وصول چک '+id});
      }
      return updated;
    });
  }
  async warehouses(){
    const company=await DataScope.companyId();
    return StorageService.getAllByIndex('warehouses','companyId',company);
  }
  async addWarehouse(name) {
    if(!Auth.isAdmin())throw Error('ایجاد انبار فقط برای مدیر مجاز است');
    const company=await DataScope.companyId();
    const value=String(name||'').trim();
    if(!value)throw Error('نام انبار الزامی است');
    return StorageService.transaction('warehouses',async tx=>{
      const existing=await tx.getAllByIndex('warehouses','companyId',company);
      if(existing.some(w=>w.name===value))throw Error('انبار تکراری است');
      const warehouse={id:uid('wh_'),name:value,companyId:company,
        ownerUserId:actor(),active:true,isDefault:!existing.length};
      await tx.put('warehouses',warehouse);return warehouse;
    });
  }
  async stockBalances({warehouseId=null}={}) {
    const company=await DataScope.companyId();
    const rows=await StorageService.getAllByIndex('inventory_balances','companyId',company);
    return warehouseId?rows.filter(r=>r.warehouseId===warehouseId):rows;
  }
  async transferStock({fromWarehouseId,toWarehouseId,productId,quantity,date}) {
    if(fromWarehouseId===toWarehouseId)throw Error('انبار مبدا و مقصد یکسان است');
    const company=await DataScope.companyId(),refId=uid('tr_');
    return StorageService.transaction(FINANCE_STORES,async tx=>{
      const ctx=await this.context(tx,company,date);
      sameCompany(await tx.get('warehouses',fromWarehouseId),company,'انبار مبدا');
      sameCompany(await tx.get('warehouses',toWarehouseId),company,'انبار مقصد');
      const product=sameCompany(await tx.get('products',productId),company,'کالا');
      if(product.trackInventory===false)throw Error('خدمات امکان انتقال انبار ندارند');
      const original=await this.stock(tx,ctx,fromWarehouseId,{productId,qty:quantity},
        'out',0,refId,'transfer');
      await this.stock(tx,ctx,toWarehouseId,{productId,qty:quantity},
        'in',original.cost,refId,'transfer');
      return {id:refId,cost:original.cost,quantity};
    });
  }
  async newStocktake({warehouseId,date}) {
    const company=await DataScope.companyId();
    return StorageService.transaction(FINANCE_STORES,async tx=>{
      await this.context(tx,company,date);
      sameCompany(await tx.get('warehouses',warehouseId),company,'انبار شمارش');
      const all=await tx.getAllByIndex('stocktakes','companyId',company);
      if(all.some(s=>s.warehouseId===warehouseId&&s.status==='draft'))
        throw Error('شمارش باز دیگری برای این انبار وجود دارد');
      const session={id:uid('stk_'),companyId:company,warehouseId,date,
        status:'draft',createdBy:actor(),createdAt:today()};
      await tx.put('stocktakes',session);
      const balances=(await tx.getAllByIndex('inventory_balances','warehouseId',warehouseId))
        .filter(b=>b.companyId===company);
      for(const balance of balances){
        await tx.put('stocktake_lines',{id:uid('stkl_'),stocktakeId:session.id,
          companyId:company,productId:balance.productId,
          expectedUnits:balance.quantityUnits,countedUnits:null,
          expectedValue:balance.value});
      }
      return session;
    });
  }
  async countStocktake(stocktakeId,productId,quantity,unitCost=null) {
    if(!Auth.isAdmin())throw Error('شمارش انبار فقط توسط مدیر قابل اصلاح است');
    const company=await DataScope.companyId();
    const counted=Number(quantity)===0?0:qtyUnits(quantity);
    return StorageService.transaction(FINANCE_STORES,async tx=>{
      const session=sameCompany(await tx.get('stocktakes',stocktakeId),company,'جلسه شمارش');
      if(session.status!=='draft')throw Error('انبارگردانی بسته شده است');
      const product=sameCompany(await tx.get('products',productId),company,'کالا');
      if(product.trackInventory===false)throw Error('خدمات در انبارگردانی وارد نمی‌شوند');
      const lines=await tx.getAllByIndex('stocktake_lines','stocktakeId',stocktakeId);
      const old=lines.find(l=>l.companyId===company&&l.productId===productId);
      const balance=await tx.get('inventory_balances',balanceId(company,session.warehouseId,productId));
      const row=old||{id:uid('stkl_'),companyId:company,stocktakeId,productId,
        expectedUnits:balance?.quantityUnits||0,expectedValue:balance?.value||0};
      if(unitCost!==null)row.unitCost=amount(unitCost);
      row.countedUnits=counted;row.countedBy=actor();row.countedAt=today();
      await tx.put('stocktake_lines',row);return row;
    });
  }
  async getStocktakes() {
    const company=await DataScope.companyId();
    return StorageService.getAllByIndex('stocktakes','companyId',company);
  }
  async getStocktakeLines(stocktakeId) {
    const company=await DataScope.companyId();
    const session=sameCompany(await StorageService.get('stocktakes',stocktakeId),company,'شمارش');
    return (await StorageService.getAllByIndex('stocktake_lines','stocktakeId',session.id))
      .filter(l=>l.companyId===company);
  }
  async finalizeStocktake(stocktakeId) {
    if(!Auth.isAdmin())throw Error('تأیید انبارگردانی فقط توسط مدیر مجاز است');
    const company=await DataScope.companyId();
    return StorageService.transaction(FINANCE_STORES,async tx=>{
      const session=sameCompany(await tx.get('stocktakes',stocktakeId),company,'جلسه شمارش');
      if(session.status!=='draft')throw Error('این انبارگردانی قبلاً بسته شده است');
      const ctx=await this.context(tx,company,session.date);
      const lines=(await tx.getAllByIndex('stocktake_lines','stocktakeId',session.id))
        .filter(l=>l.companyId===company);
      if(!lines.length)throw Error('برگه شمارش بدون کالا است');
      const amounts={increase:0,decrease:0};
      for(const l of lines){
        if(l.countedUnits===null||l.countedUnits===undefined)
          throw Error('همه اقلام باید شمارش شوند');
        const id=balanceId(company,session.warehouseId,l.productId);
        const current=await tx.get('inventory_balances',id);
        const base=current?.quantityUnits||0;
        if(base!==l.expectedUnits|| (current?.value||0)!==l.expectedValue)
          throw Error('در طول شمارش موجودی تغییر کرده است؛ شمارش را تجدید کنید');
        const delta=l.countedUnits-l.expectedUnits;
        if(!delta)continue;
        let update;
        if(delta>0){
          const rate=l.unitCost!==undefined?amount(l.unitCost):
            base>0?Math.round((current.value||0)*1000/base):null;
          if(rate===null)throw Error('برای مازاد کالای بدون سابقه، قیمت تمام‌شده واحد را وارد کنید');
          update=await this.stock(tx,ctx,session.warehouseId,
            {productId:l.productId,qty:fromQtyUnits(delta)},'in',
            Math.round(rate*fromQtyUnits(delta)),session.id,'stocktake');
          amounts.increase+=update.cost;
        }else{
          update=await this.stock(tx,ctx,session.warehouseId,
            {productId:l.productId,qty:fromQtyUnits(-delta)},'out',
            0,session.id,'stocktake');
          amounts.decrease+=update.cost;
        }
      }
      const net=amounts.increase-amounts.decrease;
      let journal=null;
      if(amounts.increase||amounts.decrease){
        journal=await this.journal(tx,ctx,'stocktake',session.id,[
          postLine(leg(ctx,LEDGER_CODES.inventory),amounts.increase,0),
          postLine(leg(ctx,LEDGER_CODES.variance),0,amounts.increase),
          postLine(leg(ctx,LEDGER_CODES.variance),amounts.decrease,0),
          postLine(leg(ctx,LEDGER_CODES.inventory),0,amounts.decrease)
        ],'تعدیل انبارگردانی '+session.id);
      }
      const updated={...session,status:'posted',journalId:journal?.id||null,
        approvedBy:actor(),approvedAt:today(),...amounts,net};
      await tx.put('stocktakes',updated);return updated;
    });
  }
}
export const RetailPostingService = new RetailPostingServiceImpl();
