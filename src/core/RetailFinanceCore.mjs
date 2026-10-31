// Factor-easyPro V2: deterministic inventory valuation and financial validation.
export const QTY_SCALE = 1000;
export const LEDGER_CODES = Object.freeze({
  cash:'101',receivable:'102',inventory:'103',inputVat:'104',chequeIn:'105',
  payable:'201',outputVat:'202',chequeOut:'203',revenue:'401',
  otherRevenue:'402',cogs:'501',expense:'502',variance:'503'
});
export const INVOICE_DIRECTIONS = Object.freeze({
  sale:'out',non_formal:'out',purchase:'in',sale_return:'in',purchase_return:'out'
});
export function amount(value,label='مبلغ') {
  if(typeof value==='string' && !/^\d+$/.test(value.trim())) throw Error(label+' باید عدد صحیح باشد');
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<0) throw Error(label+' نامعتبر است');
  return n;
}
export function positiveAmount(v,label) {
  const n=amount(v,label);
  if(!n) throw Error('مبلغ باید مثبت باشد');
  return n;
}
export function qtyUnits(q) {
  const n=Number(q), scaled=n*QTY_SCALE;
  if(!Number.isFinite(n)||n<=0||!Number.isSafeInteger(Math.round(scaled))||
    Math.abs(scaled-Math.round(scaled))>1e-7) throw Error('مقدار کالا نامعتبر است');
  return Math.round(scaled);
}
// Round a quantity multiplied by a whole-rial unit price ONCE per line.
// Integer thousandths and bigint avoid binary-float centering errors and
// enforce the application's whole-rial accounting policy at the source.
export function lineGrossRials(quantity, unitPrice) {
  const units = qtyUnits(quantity);
  const price = amount(unitPrice, 'قیمت');
  const gross = (BigInt(units) * BigInt(price) + BigInt(QTY_SCALE) / 2n) /
    BigInt(QTY_SCALE);
  if (gross > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('جمع ردیف فاکتور از محدوده مجاز ریالی بیشتر است');
  return Number(gross);
}
// Exact whole-rial percentages: 2-decimal rate, integer basis points and BigInt.
// Reject rates not representable without silently losing fractional percent.
export function percentOfRials(rials, rate, label='درصد') {
  const base=amount(rials,'مبلغ مبنای درصد');
  if(typeof rate!=='number'&&typeof rate!=='string')throw Error(label+' نامعتبر است');
  if(typeof rate==='string'&&!/^\d+(?:\.\d{1,2})?$/.test(rate.trim()))
    throw Error(label+' باید حداکثر دو رقم اعشار داشته باشد');
  const n=Number(rate), scaled=n*100;
  if(!Number.isFinite(n)||n<0||n>100||
     Math.abs(scaled-Math.round(scaled))>1e-7)
    throw Error(label+' باید بین صفر و صد با حداکثر دو رقم اعشار باشد');
  return Number((BigInt(base)*BigInt(Math.round(scaled))+5000n)/10000n);
}
export const fromQtyUnits=q=>q/QTY_SCALE;
const plus=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n))throw Error('سرریز موجودی یا مبلغ');return n};
export function receiveStock(current,quantity,totalCost) {
  const units=qtyUnits(quantity), cost=amount(totalCost,'بهای کالا');
  const q=current?.quantityUnits||0,v=current?.value||0;
  if(!Number.isSafeInteger(q)||q<0||!Number.isSafeInteger(v)||v<0)throw Error('مانده انبار نامعتبر است');
  return {quantityUnits:plus(q,units),value:plus(v,cost),cost};
}
export function issueStock(current,quantity) {
  const units=qtyUnits(quantity),q=current?.quantityUnits||0,v=current?.value||0;
  if(!Number.isSafeInteger(q)||q<units||q<=0)throw Error('موجودی کالا برای خروج کافی نیست');
  if(!Number.isSafeInteger(v)||v<0)throw Error('ارزش موجودی نامعتبر است');
  const cost=units===q?v:Number((BigInt(v)*BigInt(units)+BigInt(q)/2n)/BigInt(q));
  return {quantityUnits:q-units,value:v-cost,cost};
}
export function allocateDiscount(items,discount) {
  const total=items.reduce((s,i)=>plus(s,amount(i.lineTotal)),0),d=amount(discount);
  if(d>total)throw Error('تخفیف بیش از جمع اقلام است');
  if(!total)return items.map(i=>({...i,netLineTotal:0}));
  const bigTotal=BigInt(total),bigDiscount=BigInt(d);
  const values=items.map(i=>amount(i.lineTotal));
  const reduced=values.map(v=>Number(BigInt(v)*bigDiscount/bigTotal));
  const remainders=values.map((v,i)=>({i,rem:BigInt(v)*bigDiscount%bigTotal}));
  let remaining=d-reduced.reduce((a,b)=>a+b,0);
  remainders.sort((a,b)=>a.rem===b.rem?a.i-b.i:(a.rem>b.rem?-1:1));
  for(const r of remainders){if(!remaining)break;if(reduced[r.i]<values[r.i]){reduced[r.i]++;remaining--;}}
  if(remaining)throw Error('توزیع تخفیف نامعتبر است');
  return items.map((i,j)=>({...i,netLineTotal:values[j]-reduced[j]}));
}
export function postLine(accountId,debit,credit,extra={}) {
  const d=amount(debit),c=amount(credit);
  if(!d&&!c)return null;
  if(d&&c)throw Error('ردیف بدهکار و بستانکار همزمان مجاز نیست');
  return {accountId,debit:d,credit:c,...extra};
}
export function differenceLines(accountId,signed,extra={}) {
  if(!Number.isSafeInteger(signed))throw Error('اختلاف مبلغ نامعتبر است');
  return signed>0?postLine(accountId,signed,0,extra):signed<0?postLine(accountId,0,-signed,extra):null;
}
export function assertInvoiceTotals(inv) {
  if(!INVOICE_DIRECTIONS[inv.kind])throw Error('نوع فاکتور نامعتبر است');
  if(!Array.isArray(inv.items)||!inv.items.length)throw Error('فاکتور بدون قلم کالا مجاز نیست');
  // The transaction service is the last trust boundary. Never trust a
  // caller-supplied line total merely because the journal balances.
  const total=inv.items.reduce((sum,i)=>{
    const gross=lineGrossRials(i.qty,i.price);
    if(i.lineSubtotal!==undefined && amount(i.lineSubtotal,'جمع ناخالص ردیف')!==gross)
      throw Error('جمع ناخالص ردیف با مقدار و قیمت ناسازگار است');
    const discountType=i.discountType||'fixed';
    if(!['fixed','percent'].includes(discountType))
      throw Error('نوع تخفیف ردیف نامعتبر است');
    const discount=amount(i.discount??0,'تخفیف ردیف');
    if(discount>gross)throw Error('تخفیف ردیف بیش از مبلغ ناخالص است');
    if(i.discountInput!==undefined) {
      if(discountType==='percent'){
        if(discount!==percentOfRials(gross,i.discountInput,'درصد تخفیف ردیف'))
          throw Error('تخفیف محاسبه‌شده ردیف با درصد واردشده ناسازگار است');
      }else if(discount!==amount(i.discountInput,'تخفیف ثابت ردیف')){
        throw Error('تخفیف ثابت ردیف با ورودی اصلی ناسازگار است');
      }
    }
    const net=amount(i.lineTotal,'جمع ردیف');
    if(net!==gross-discount)throw Error('جمع خالص ردیف با تعداد، قیمت و تخفیف ناسازگار است');
    return plus(sum,net);
  },0);
  if(amount(inv.subtotal)!==total)throw Error('جمع ردیف‌ها نادرست است');
  const disc=amount(inv.totalDiscount,'تخفیف'),vat=amount(inv.vatAmount,'مالیات');
  if(disc>total)throw Error('تخفیف نامعتبر است');
  if(inv.discountInput!==undefined) {
    const mode=inv.discountType||'fixed';
    if(!['fixed','percent'].includes(mode))throw Error('نوع تخفیف کل فاکتور نامعتبر است');
    const expected=mode==='percent'
      ? percentOfRials(total,inv.discountInput,'درصد تخفیف کل')
      : Math.min(total,amount(inv.discountInput,'تخفیف ثابت کل'));
    if(disc!==expected)throw Error('تخفیف کل با ورودی ثبت‌شده ناسازگار است');
  }
  if(inv.vatEnabled!==undefined) {
    const expected=inv.vatEnabled && inv.kind!=='non_formal'
      ? percentOfRials(total-disc,inv.vatRate??0,'درصد مالیات') : 0;
    if(vat!==expected)throw Error('مالیات فاکتور با نرخ و وضعیت مالیات ناسازگار است');
  }
  if(amount(inv.grandTotal)!==total-disc+vat)throw Error('مبلغ کل فاکتور ناسازگار است');
  if(amount(inv.paidAmount)>inv.grandTotal)throw Error('مبلغ پرداخت بیش از مبلغ فاکتور است');
  return true;
}
