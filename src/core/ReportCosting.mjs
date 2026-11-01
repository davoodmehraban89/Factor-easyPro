// Historical inventory costing for management reports.
// Posted invoice costs come from immutable stock movements, never mutable product buyPrice.
// Legacy, unposted invoices can only have an ESTIMATED cost; surface that status.
const safeRials = (value, label) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw Error('مبلغ نامعتبر در گزارش: ' + label);
  return value;
};
const safePlus = (a, b) => {
  const n = a + b;
  if (!Number.isSafeInteger(n)) throw Error('سرریز مبلغ گزارش');
  return n;
};
const keyOf = (invoiceId, productId, direction) =>
  JSON.stringify([invoiceId, productId, direction]);

export function buildInvoiceCosting(invoices, products, movements) {
  const productMap = new Map(products.map(p => [p.id, p]));
  const stock = new Map();
  for (const m of movements) {
    // Only movements issued by finalized invoices may establish historical COGS.
    if (m.refType !== 'invoice' || !m.refId || !m.productId ||
        !['in', 'out'].includes(m.type)) continue;
    const key = keyOf(m.refId, m.productId, m.type);
    const prior = stock.get(key) || { total: 0, count: 0 };
    prior.total = safePlus(prior.total, safeRials(m.cost, 'بهای گردش انبار'));
    prior.count++;
    stock.set(key, prior);
  }

  const byInvoice = new Map();
  const summary = { recordedLines: 0, estimatedLines: 0, missingCostLines: 0,
    serviceLines: 0 };
  for (const invoice of invoices) {
    const items = invoice.items || [];
    const results = Array(items.length);
    const groups = new Map();
    items.forEach((item, index) => {
      const quantity = Number(item.qty);
      if (!Number.isFinite(quantity) || quantity <= 0)
        throw Error('مقدار نامعتبر در گزارش فاکتور');
      if (!item.productId) {
        results[index] = { cost: 0, source: 'service' };
        summary.serviceLines++;
        return;
      }
      if (!groups.has(item.productId)) groups.set(item.productId, []);
      groups.get(item.productId).push({ index, quantity });
    });

    for (const [productId, group] of groups) {
      const direction = invoice.kind === 'sale_return' ? 'in' : 'out';
      const movement = invoice.financePosted === true
        ? stock.get(keyOf(invoice.id, productId, direction)) : null;
      const product = productMap.get(productId);
      // Preserve a posted cost even if the catalog price has since changed or
      // the product record is no longer available.
      if (movement && movement.count > 0) {
        const totalQty = group.reduce((n, row) => n + row.quantity, 0);
        let distributed = 0;
        group.forEach((row, index) => {
          const last = index === group.length - 1;
          const share = last ? movement.total - distributed :
            Math.min(movement.total - distributed,
              Math.round(movement.total * row.quantity / totalQty));
          results[row.index] = { cost: safeRials(share, 'تخصیص بهای تمام‌شده'),
            source: 'recorded' };
          distributed = safePlus(distributed, share);
          summary.recordedLines++;
        });
      } else if (product?.trackInventory === false) {
        group.forEach(row => {
          results[row.index] = { cost: 0, source: 'service' };
          summary.serviceLines++;
        });
      } else if (product && product.buyPrice !== undefined &&
        product.buyPrice !== null) {
        const unitCost = safeRials(product.buyPrice, 'قیمت خرید فعلی');
        group.forEach(row => {
          const cost = Math.round(unitCost * row.quantity);
          results[row.index] = {
            cost: safeRials(cost, 'بهای برآوردی'), source: 'estimated'
          };
          summary.estimatedLines++;
        });
      } else {
        group.forEach(row => {
          // Do not misrepresent missing cost information as confirmed zero.
          results[row.index] = { cost: 0, source: 'missing' };
          summary.missingCostLines++;
        });
      }
    }

    let total = 0;
    for (const row of results) total = safePlus(total, row.cost);
    byInvoice.set(invoice.id, { lines: results, total });
  }
  return { byInvoice, summary };
}
