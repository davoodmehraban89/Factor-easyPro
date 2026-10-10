// Disposable browser profile must already be initialized and phase 2 activated.
process.env.CDP_PORT=process.env.CDP_PORT||'9252';
process.env.CDP_EXPR=`(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const assert=(ok,m)=>{if(!ok)throw Error(m)};
  const c=await window.ContactController.create({name:'مشتری تست فاز دو',role:'both'});
  const p=await window.ProductController.createProduct({name:'کالای تست فاز دو',
    code:'V2-DEMO',trackInventory:true,buyPrice:100,sellPrice:200});
  await FINORA.Router.go('invoices');await wait(300);
  await window.InvoiceFormView.open();await wait(200);
  assert(document.getElementById('invWarehouse'),'Warehouse picker missing');
  document.getElementById('invKind').value='purchase';
  await window.InvoiceFormView._onKindChange();
  document.getElementById('invDate').value='1405/07/18';
  const contact=document.getElementById('invContactSearch');
  contact.value='مشتری تست فاز دو';
  window.InvoiceFormView._showContactOptions(true);
  const contactOption=document.querySelector('.contact-option[data-id="'+c.id+'"]');
  assert(contactOption,'Contact search failed');
  contactOption.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
  const prod=document.querySelector('.row-product-search');
  prod.value='V2-DEMO';
  window.InvoiceFormView._showProductOptions(0,true);
  const option=document.querySelector('.product-option[data-id="'+p.id+'"]');
  assert(option,'Product search failed');
  option.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
  const qty=document.querySelector('.row-qty');
  qty.value='10';window.InvoiceFormView._onFieldChange(0,'qty','10');
  const price=document.querySelector('.row-price');
  price.value='100';window.InvoiceFormView._onFieldChange(0,'price','100');
  await window.InvoiceFormView._save(false);await wait(120);
  const invoices=await FINORA.Storage.getAll('invoices');
  const saved=invoices.find(i=>i.contactId===c.id&&i.kind==='purchase');
  assert(saved&&saved.financePosted,'Invoice was not financially posted');
  const journals=await FINORA.Storage.getAll('journal_entries');
  const movements=await FINORA.Storage.getAll('stock_movements');
  assert(journals.some(j=>j.sourceId===saved.id),'Ledger source missing');
  assert(movements.some(m=>m.refId===saved.id&&m.type==='in'),'Inventory entry missing');
  assert(!document.querySelector('.modal-backdrop'),'Invoice modal failed to close');
  return JSON.stringify({invoice:saved.number,amount:saved.grandTotal,
    journals:journals.length,stock:movements.length});
})()`;
require('./cdp-smoke.cjs');
