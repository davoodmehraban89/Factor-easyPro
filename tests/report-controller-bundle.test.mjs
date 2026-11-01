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
        unit: 'عدد', qty: 2, price: 50, lineTotal: 100 }]
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
    assert.equal(bundle.pl.costBasis, 'estimated');
    assert.equal(bundle.products[0].totalSales, 80);
    assert.equal(bundle.products[0].cogs, 20);
    assert.equal(bundle.products[0].profit, 60);
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


test('posted reports use immutable inventory movement cost, net returns and allocated invoice discounts', async () => {
  const originalLoad = ReportController._loadData;
  const data = {
    invoices: [
      {
        id: 'historical-sale', kind: 'sale', isPreInvoice: false, date: '1405/01/02',
        subtotal: 200, totalDiscount: 20, grandTotal: 180, paidAmount: 180, remaining: 0,
        items: [
          { productId: 'product-1', productName: 'Product one', unit: 'عدد', qty: 2, price: 50, lineTotal: 100 },
          { productId: 'product-2', productName: 'Product two', unit: 'عدد', qty: 1, price: 100, lineTotal: 100 }
        ]
      },
      {
        id: 'historical-return', kind: 'sale_return', isPreInvoice: false, date: '1405/01/03',
        subtotal: 30, totalDiscount: 5, grandTotal: 25, paidAmount: 0, remaining: 25,
        items: [{ productId: 'product-1', productName: 'Product one', unit: 'عدد', qty: 1, price: 30, lineTotal: 30 }]
      }
    ],
    products: [
      { id: 'product-1', name: 'Product one', buyPrice: 999, trackInventory: true },
      { id: 'product-2', name: 'Product two', buyPrice: 888, trackInventory: true }
    ],
    stockMovements: [
      { id: 'move-sale-1', refType: 'invoice', refId: 'historical-sale', productId: 'product-1', type: 'out', cost: 40 },
      { id: 'move-sale-2', refType: 'invoice', refId: 'historical-sale', productId: 'product-2', type: 'out', cost: 30 },
      { id: 'move-return-1', refType: 'invoice', refId: 'historical-return', productId: 'product-1', type: 'in', cost: 10 }
    ],
    expenses: [{ id: 'expense', kind: 'expense', date: '1405/01/02', amount: 5 },
      { id: 'income', kind: 'income', date: '1405/01/02', amount: 2 }],
    contacts: [], cheques: [], treasury: []
  };
  ReportController._loadData = async () => data;
  try {
    const bundle = await ReportController.getReportBundle(filter);
    assert.equal(bundle.pl.grossSales, 200);
    assert.equal(bundle.pl.salesDiscounts, 20);
    assert.equal(bundle.pl.returnsAmount, 25);
    assert.equal(bundle.pl.netSales, 155);
    assert.equal(bundle.pl.cogs, 60, 'current product buyPrice must not rewrite historical weighted-average cost');
    assert.equal(bundle.pl.grossProfit, 95);
    assert.equal(bundle.pl.netProfit, 92);
    assert.equal(bundle.pl.costBasis, 'historical');
    assert.deepEqual(bundle.pl.costBasisDetails, { basis: 'historical', historical: 3, estimated: 0, unknown: 0 });
    const one = bundle.products.find(row => row.productId === 'product-1');
    const two = bundle.products.find(row => row.productId === 'product-2');
    assert.deepEqual({ qty: one.qty, sales: one.totalSales, cogs: one.cogs, profit: one.profit },
      { qty: 1, sales: 65, cogs: 30, profit: 35 });
    assert.deepEqual({ qty: two.qty, sales: two.totalSales, cogs: two.cogs, profit: two.profit },
      { qty: 1, sales: 90, cogs: 30, profit: 60 });
    assert.equal(bundle.sales.topProductsBySales[0].productId, 'product-2');
  } finally {
    ReportController._loadData = originalLoad;
  }
});

test('a return in a later period keeps its historical COGS credit instead of clamping period COGS to zero', async () => {
  const originalLoad = ReportController._loadData;
  ReportController._loadData = async () => ({
    invoices: [{
      id: 'late-return', kind: 'sale_return', isPreInvoice: false, date: '1405/01/03',
      subtotal: 20, totalDiscount: 0, grandTotal: 20,
      items: [{ productId: 'product-1', productName: 'Product one', qty: 1, price: 20, lineTotal: 20 }]
    }],
    products: [{ id: 'product-1', name: 'Product one', buyPrice: 999, trackInventory: true }],
    stockMovements: [{ id: 'late-return-move', refType: 'invoice', refId: 'late-return',
      productId: 'product-1', type: 'in', cost: 7 }],
    expenses: [], contacts: [], cheques: [], treasury: []
  });
  try {
    const result = await ReportController.getProfitLoss(filter);
    assert.equal(result.netSales, -20);
    assert.equal(result.cogs, -7);
    assert.equal(result.grossProfit, -13);
    assert.equal(result.costBasis, 'historical');
  } finally {
    ReportController._loadData = originalLoad;
  }
});

test('reports label legacy current-price COGS estimates instead of presenting them as historical costs', async () => {
  const originalLoad = ReportController._loadData;
  ReportController._loadData = async () => ({
    invoices: [{
      id: 'legacy-sale', kind: 'sale', isPreInvoice: false, date: '1405/01/02',
      subtotal: 50, totalDiscount: 0, grandTotal: 50,
      items: [{ productId: 'product-legacy', productName: 'Legacy item', qty: 2, price: 25, lineTotal: 50 }]
    }],
    products: [{ id: 'product-legacy', name: 'Legacy item', buyPrice: 12, trackInventory: true }],
    stockMovements: [], expenses: [], contacts: [], cheques: [], treasury: []
  });
  try {
    const result = await ReportController.getProfitLoss(filter);
    assert.equal(result.cogs, 24);
    assert.equal(result.costBasis, 'estimated');
    assert.deepEqual(result.costBasisDetails, { basis: 'estimated', historical: 0, estimated: 1, unknown: 0 });
  } finally {
    ReportController._loadData = originalLoad;
  }
});


test('legacy invoice subtotal mismatches are surfaced as incomplete line discount allocation', async () => {
  const originalLoad = ReportController._loadData;
  ReportController._loadData = async () => ({
    invoices: [{
      id: 'mismatched-legacy-sale', kind: 'sale', isPreInvoice: false, date: '1405/01/02',
      subtotal: 100, totalDiscount: 10, grandTotal: 90,
      items: [{ productId: 'product-1', productName: 'Product one', qty: 1, price: 80, lineTotal: 80 }]
    }],
    products: [{ id: 'product-1', name: 'Product one', buyPrice: 20, trackInventory: true }],
    stockMovements: [{ id: 'move', refType: 'invoice', refId: 'mismatched-legacy-sale',
      productId: 'product-1', type: 'out', cost: 15 }],
    expenses: [], contacts: [], cheques: [], treasury: []
  });
  try {
    const result = await ReportController.getProfitLoss(filter);
    assert.equal(result.costBasis, 'historical');
    assert.equal(result.discountAllocationIncomplete, true);
  } finally {
    ReportController._loadData = originalLoad;
  }
});

test('a missing historical and current product cost is explicitly classified as incomplete', async () => {
  const originalLoad = ReportController._loadData;
  ReportController._loadData = async () => ({
    invoices: [{
      id: 'orphan-sale', kind: 'sale', isPreInvoice: false, date: '1405/01/02',
      subtotal: 50, totalDiscount: 0, grandTotal: 50,
      items: [{ productId: 'deleted-product', productName: 'Unknown item', qty: 1, price: 50, lineTotal: 50 }]
    }],
    products: [], stockMovements: [], expenses: [], contacts: [], cheques: [], treasury: []
  });
  try {
    const result = await ReportController.getProfitLoss(filter);
    assert.equal(result.cogs, 0);
    assert.equal(result.costBasis, 'incomplete');
    assert.equal(result.costBasisDetails.unknown, 1);
  } finally {
    ReportController._loadData = originalLoad;
  }
});
