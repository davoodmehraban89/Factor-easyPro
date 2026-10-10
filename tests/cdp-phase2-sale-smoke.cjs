process.env.CDP_PORT=process.env.CDP_PORT||'9252';
process.env.CDP_EXPR=`(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const assert=(yes,msg)=>{if(!yes)throw Error(msg)};
 await FINORA.Router.go('treasury');await wait(250);
 if(!(await FINORA.Storage.getAll('treasury')).some(a=>a.recordType==='account')){
 await window.TreasuryView.openAccountModal();
 document.getElementById('accName').value='صندوق فاز دوم';
 document.getElementById('accInitialBalance').value='0';
 await window.TreasuryView.saveAccount(null);
 }
 assert(!document.querySelector('.modal-backdrop'),'Cash account form failed to save');
 const accounts=(await FINORA.Storage.getAll('treasury')).filter(a=>a.recordType==='account');
 assert(accounts.length>=1 && accounts[0].ledgerAccountId,'Treasury subledger missing');
 const person=(await FINORA.Storage.getAll('contacts')).find(x=>x.name.includes('فاز دو'));
 const product=(await FINORA.Storage.getAll('products')).find(x=>x.code==='V2-DEMO');
 await FINORA.Router.go('invoices');await wait(250);
 await window.InvoiceFormView.open();await wait(120);
 document.getElementById('invKind').value='sale';
 await window.InvoiceFormView._onKindChange();
 document.getElementById('invDate').value='1405/07/18';
 const input=document.getElementById('invContactSearch');
 input.value=person.name;window.InvoiceFormView._showContactOptions(true);
 document.querySelector('.contact-option[data-id="'+person.id+'"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
 const prod=document.querySelector('.row-product-search');
 prod.value='V2-DEMO';window.InvoiceFormView._showProductOptions(0,true);
 document.querySelector('.product-option[data-id="'+product.id+'"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
 document.querySelector('.row-qty').value='3';window.InvoiceFormView._onFieldChange(0,'qty','3');
 document.querySelector('.row-price').value='200';window.InvoiceFormView._onFieldChange(0,'price','200');
 document.getElementById('invPayment').value='partial';
 window.InvoiceFormView._onPaymentChange();
 document.getElementById('invPaidAmount').value='200';window.InvoiceFormView._recalc();
 await window.InvoiceFormView._save(false);await wait(150);
 const sale=(await FINORA.Storage.getAll('invoices')).filter(x=>x.kind==='sale'&&x.contactId===person.id).sort((a,b)=>Number(a.number)-Number(b.number)).at(-1);
 assert(sale?.financePosted,'Sale not financially posted');
 assert(sale.paidAmount===200 && sale.remaining===400,'Sale payment mismatch');
 const lines=await FINORA.Storage.getAll('journal_lines');
 assert(lines.some(x=>x.accountId===accounts[0].ledgerAccountId && x.debit===200),'Cash ledger mapping missing');
 return JSON.stringify({sale:sale.number,paid:sale.paidAmount,remaining:sale.remaining,
   stockMoves:(await FINORA.Storage.getAll('stock_movements')).length,
   journals:(await FINORA.Storage.getAll('journal_entries')).length});
})()`;
require('./cdp-smoke.cjs');
