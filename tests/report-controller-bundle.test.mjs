import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window ??= globalThis;
const { ReportController } = await import('../src/controllers/ReportController.js');

const filter = { preset: 'custom', from: '1405/01/01', to: '1405/12/29' };
const fixture = {
  invoices: [
    {
      id: 'sale-1', kind: 'sale', isPreInvoice: false, date: '1405/01/02',
      subtotal: 100, totalDiscount: 10, grandTotal: 90, paidAmount: 30,
      remaining: 60, contactId: 'contact-1', contactName: 'Synthetic customer',
      items: [{ productId: 'product-1', productName: 'Synthetic product',
        unit: 'عدد', qty: 2, price: 50, lineTotal: 90 }]
    },
    {
      id: 'return-1', kind: 'sale_return', isPreInvoice: false, date: '1405/01/03',
      subtotal: 10, grandTotal: 10, contactId: 'contact-1', contactName: 'Synthetic customer',
      items: [{ productId: 'product-1', productName: 'Synthetic product',
        unit: 'عدد', qty: 1, price: 10, lineTotal: 10 }]
    },
    {
      id: 'pre-invoice', kind: 'sale', isPreInvoice: true, date: '1405/01/04',
      subtotal: 999, totalDiscount: 0, grandTotal: 999, items: []
    }
  ],
  products: [{ id: 'product-1', name: 'Synthetic product', buyPrice: 20 }],
  expenses: [
    { id: 'expense-1', kind: 'expense', date: '1405/01/02', amount: 5 },
    { id: 'income-1', kind: 'income', date: '1405/01/02', amount: 2 }
  ],
  contacts: [{ id: 'contact-1', entityType: 'legal' }],
  cheques: [],
  treasury: []
};

test('report bundle reads one company-scoped snapshot and preserves all four report results', async () => {
  const originalLoad = ReportController._loadData;
  let loadCount = 0;
  ReportController._loadData = async () => {
    loadCount++;
    return fixture;
  };
  try {
    const bundle = await ReportController.getReportBundle(filter);
    assert.equal(loadCount, 1, 'all report tabs must share exactly one data snapshot');
    assert.deepEqual(bundle.pl, await ReportController.getProfitLoss(filter, fixture));
    assert.deepEqual(bundle.sales, await ReportController.getSalesAnalysis(filter, fixture));
    assert.deepEqual(bundle.products, await ReportController.getProductProfitability(filter, fixture));
    assert.deepEqual(bundle.customers, await ReportController.getCustomerReport(filter, fixture));
    assert.equal(bundle.pl.netSales, 80);
    assert.equal(bundle.pl.cogs, 20);
    assert.equal(bundle.pl.netProfit, 57);
    assert.equal(bundle.sales.invoiceCount, 1);
    assert.equal(bundle.products.length, 1);
    assert.equal(bundle.customers[0].totalReturns, 10);
  } finally {
    ReportController._loadData = originalLoad;
  }
});

test('standalone report APIs retain their original self-loading contract', async () => {
  const originalLoad = ReportController._loadData;
  let loadCount = 0;
  ReportController._loadData = async () => {
    loadCount++;
    return fixture;
  };
  try {
    const result = await ReportController.getProfitLoss(filter);
    assert.equal(loadCount, 1);
    assert.equal(result.netProfit, 57);
  } finally {
    ReportController._loadData = originalLoad;
  }
});
