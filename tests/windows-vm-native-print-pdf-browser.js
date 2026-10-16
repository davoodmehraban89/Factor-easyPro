(async () => {
  const ok=(value,msg)=>{if(!value)throw Error(msg);};
  ok(!!globalThis.__TAURI_INTERNALS__?.invoke,'Not installed Windows Tauri WebView2');
  ok(window.InvoicePrint?._formalTemplate,'Production print template is unavailable');
  const original=(await FINORA.Storage.getAll('invoices')).find(x=>x.kind==='sale'&&x.financePosted&&x.items?.length);
  ok(original,'Posted native sales invoice fixture is missing');
  const count=110;
  const lines=Array.from({length:count},(_,i)=>({
    productName:'کالای آزمایشی '+(i+1),qty:1,price:1000,discount:0,unit:'عدد'
  }));
  const invoice={...original,items:lines,kind:'sale',isPreInvoice:false,
    subtotal:110000,totalDiscount:0,vatEnabled:false,vatAmount:0,
    grandTotal:110000,paidAmount:0,remaining:110000,paymentMethod:'credit'};
  InvoicePrint.settings.template='formal';
  InvoicePrint.settings.paperSize='A4';
  InvoicePrint.settings.orientation='portrait';
  InvoicePrint.settings.showBalance='none';
  const rendered=InvoicePrint._formalTemplate(invoice,
    {name:'شرکت ساختگی'}, {name:'مشتری ساختگی'},0);
  ok(rendered.includes('dir="rtl"')&&rendered.includes('<thead>')&&
    rendered.includes('کالای آزمایشی 110'),'RTL template rows/header missing');
  const style=document.createElement('style');
  style.textContent='@page{size:A4 portrait;margin:0 !important;}'
    +'*{box-sizing:border-box;}'
    +'html,body,table,td,th{direction:rtl;text-align:right;}'
    +'html,body{font-family:"Vazirmatn FD",Tahoma,sans-serif;background:white;color:black;}'
    +'body{margin:0;padding:0;}'
    +'thead{display:table-header-group;}'
    +'tfoot{display:table-footer-group;}'
    +'tr,td,th{break-inside:avoid;page-break-inside:avoid;}'
    +'.print-doc{direction:rtl !important;page-break-inside:auto;}'
    +' *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}';
  document.head.appendChild(style);
  document.body.innerHTML=rendered;
  ok(document.querySelectorAll('.print-doc tbody tr').length>=110,
    'Rendered native printable invoice lost rows');
  await document.fonts.ready;
  return {engine:'native-WebView2-printToPDF',rtl:true,paper:'A4',itemRows:110};
})()