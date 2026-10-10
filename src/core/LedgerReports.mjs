// Posted-ledger reporting: integer rials and immutable posted journal lines.
const safeAdd=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n))throw Error('سرریز مبلغ گزارش');return n};
const validAmount=n=>Number.isSafeInteger(n)&&n>=0;
export function buildLedgerReports(accounts,journals,lines,{periodId=null,from=null,to=null}={}){
  if(from&&to&&from>to)throw Error('بازه تاریخ گزارش نامعتبر است');
  const chart=new Map(accounts.map(a=>[a.id,a]));
  const allPosted=journals.filter(j=>j.status==='posted'&&(!to||j.date<=to));
  const selected=allPosted.filter(j=>(!periodId||j.periodId===periodId)&&(!from||j.date>=from));
  const selectedIds=new Set(selected.map(j=>j.id));
  const allIds=new Map(allPosted.map(j=>[j.id,j]));
  const detail=[],totals=new Map(),cumulative=new Map();
  for(const line of lines){
    const j=allIds.get(line.journalId);if(!j)continue;
    const a=chart.get(line.accountId);if(!a)throw Error('حساب سطر سند پیدا نشد');
    const debit=Number(line.debit||0),credit=Number(line.credit||0);
    if(!validAmount(debit)||!validAmount(credit)||debit&&credit)throw Error('مبلغ سند نامعتبر است');
    const add=(map)=>{const row=map.get(a.id)||{accountId:a.id,code:a.code,name:a.name,type:a.type,debit:0,credit:0,balance:0};
      row.debit=safeAdd(row.debit,debit);row.credit=safeAdd(row.credit,credit);
      row.balance=safeAdd(row.debit,-row.credit);map.set(a.id,row);};
    add(cumulative);
    if(!selectedIds.has(j.id))continue;
    add(totals);
    detail.push({journalId:j.id,date:j.date,description:j.description||'',sourceType:j.sourceType||null,accountId:a.id,code:a.code,name:a.name,debit,credit,position:line.position||0});
  }
  detail.sort((a,b)=>a.date.localeCompare(b.date)||a.journalId.localeCompare(b.journalId)||a.position-b.position);
  const sortRows=map=>[...map.values()].sort((a,b)=>String(a.code).localeCompare(String(b.code),'fa'));
  const trial=sortRows(totals),cumulativeTrial=sortRows(cumulative);
  const sum=(arr,key)=>arr.reduce((v,r)=>safeAdd(v,r[key]),0);
  const debit=sum(trial,'debit'),credit=sum(trial,'credit');
  if(debit!==credit||sum(cumulativeTrial,'debit')!==sum(cumulativeTrial,'credit'))throw Error('دفتر کل تراز نیست');
  const computePL=rows=>{const result={revenue:0,expenses:0,netProfit:0};
    for(const r of rows){if(r.type==='revenue')result.revenue=safeAdd(result.revenue,-r.balance);
      if(r.type==='expense')result.expenses=safeAdd(result.expenses,r.balance);}
    result.netProfit=safeAdd(result.revenue,-result.expenses);return result;};
  const profitLoss=computePL(trial);
  const cumulativeProfit=computePL(cumulativeTrial);
  const balanceSheet={assets:0,liabilities:0,equity:0};
  for(const r of cumulativeTrial){
    if(r.type==='asset')balanceSheet.assets=safeAdd(balanceSheet.assets,r.balance);
    if(r.type==='liability')balanceSheet.liabilities=safeAdd(balanceSheet.liabilities,-r.balance);
    if(r.type==='equity')balanceSheet.equity=safeAdd(balanceSheet.equity,-r.balance);
  }
  balanceSheet.equityWithProfit=safeAdd(balanceSheet.equity,cumulativeProfit.netProfit);
  balanceSheet.difference=safeAdd(safeAdd(balanceSheet.assets,-balanceSheet.liabilities),-balanceSheet.equityWithProfit);
  return {detail,trial,totals:{debit,credit},balanceSheet,profitLoss,postedCount:selected.length,cumulativeTrial};
}
