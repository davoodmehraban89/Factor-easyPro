import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window ??= globalThis;
const { ReportController } = await import('../src/controllers/ReportController.js');

test('G317 customer reports show net receivable after return-credit allocation and cash refunds',async()=>{
  const originalLoad=ReportController._loadData;
  const data={
    invoices:[
      {id:'a-sale',kind:'sale',isPreInvoice:false,date:'1405/01/02',contactId:'a',contactName:'Customer A',
        grandTotal:1000,paidAmount:400,creditAppliedAmount:250,remaining:350},
      {id:'a-return',kind:'sale_return',isPreInvoice:false,date:'1405/01/03',contactId:'a',contactName:'Customer A',
        grandTotal:250,paidAmount:0,creditAppliedAmount:250,remaining:0},
      {id:'b-sale',kind:'sale',isPreInvoice:false,date:'1405/01/02',contactId:'b',contactName:'Customer B',
        grandTotal:1000,paidAmount:900,creditAppliedAmount:100,remaining:0},
      {id:'b-return',kind:'sale_return',isPreInvoice:false,date:'1405/01/03',contactId:'b',contactName:'Customer B',
        grandTotal:400,paidAmount:100,creditAppliedAmount:100,remaining:200},
      {id:'c-return',kind:'sale_return',isPreInvoice:false,date:'1405/01/04',contactId:'c',contactName:'Customer C',
        grandTotal:50,paidAmount:0,creditAppliedAmount:0,remaining:50}
    ],
    contacts:[{id:'a',name:'Customer A'},{id:'b',name:'Customer B'},{id:'c',name:'Customer C'}],
    products:[],expenses:[],stockMovements:[],cheques:[],treasury:[]
  };
  ReportController._loadData=async()=>data;
  try{
    const filter={preset:'custom',from:'1405/01/01',to:'1405/12/29'};
    const rows=await ReportController.getCustomerReport(filter);
    const a=rows.find(x=>x.contactId==='a');
    const b=rows.find(x=>x.contactId==='b');
    const c=rows.find(x=>x.contactId==='c');
    assert.deepEqual({netSales:a.netSales,netCash:a.totalPaid,netReceivable:a.totalRemaining,
      returnCreditRemaining:a.returnCreditRemaining},{netSales:750,netCash:400,netReceivable:350,returnCreditRemaining:0});
    assert.deepEqual({netSales:b.netSales,netCash:b.totalPaid,netReceivable:b.totalRemaining,
      returnCreditRemaining:b.returnCreditRemaining},{netSales:600,netCash:800,netReceivable:-200,returnCreditRemaining:200});
    assert.equal(c.totalRemaining,-50,'return-only credit is a liability to the customer, not a receivable');
    const sales=await ReportController.getSalesAnalysis(filter);
    const salesA=sales.topCustomers.find(x=>x.contactId==='a');
    const salesB=sales.topCustomers.find(x=>x.contactId==='b');
    assert.equal(salesA.totalRemaining,350);
    assert.equal(salesA.totalPaid,400);
    assert.equal(salesB.totalRemaining,-200);
    assert.equal(salesB.totalPaid,800);
  }finally{ReportController._loadData=originalLoad;}
});
