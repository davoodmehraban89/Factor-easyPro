// ============================================================
// ReportController — محاسبات سود و زیان و تحلیل مالی
// ============================================================

import { allocateDiscount } from '../core/RetailFinanceCore.mjs';
import { Auth } from '../core/Auth.js';
import { DataScope } from '../core/DataScope.js';
import { Jalali } from '../utils/Jalali.js';

class ReportControllerImpl {
  async _loadData() {
    const user = Auth.current();
    if (!user) throw new Error('کاربر یافت نشد');
    const [invoices, products, expenses, contacts, cheques, treasury, stockMovements] = await Promise.all([
      DataScope.list('invoices'),
      DataScope.list('products'),
      DataScope.list('expenses'),
      DataScope.list('contacts'),
      DataScope.list('cheques'),
      DataScope.list('treasury'),
      DataScope.list('stock_movements')
    ]);
    return { invoices: invoices || [], products: products || [], expenses: expenses || [], contacts: contacts || [], cheques: cheques || [], treasury: treasury || [], stockMovements: stockMovements || [] };
  }

  _parseJalali(str) {
    if (!str) return null;
    const parts = String(str).split('/').map(Number);
    if (parts.length !== 3) return null;
    const [jy, jm, jd] = parts;
    if (!jy || !jm || !jd) return null;
    let gy = (jy <= 979) ? 621 : 1600;
    let jy2 = jy - (jy <= 979 ? 0 : 979);
    let days = (365 * jy2) + (Math.floor(jy2 / 33) * 8) + Math.floor(((jy2 % 33) + 3) / 4) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    gy += 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    let gd = days + 1;
    const sal_a = [0,31,((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
    let gm = 0;
    for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
    return new Date(gy, gm - 1, gd);
  }

  _inRange(dateStr, from, to) {
    const d = this._parseJalali(dateStr);
    if (!d) return false;
    if (from && d < from) return false;
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59);
      if (d > toEnd) return false;
    }
    return true;
  }

  _getRange(filter = {}) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let from = null, to = new Date();

    if (filter.preset) {
      switch (filter.preset) {
        case 'today':
          from = new Date(today);
          break;
        case '7days':
          from = new Date(today); from.setDate(from.getDate() - 6);
          break;
        case '30days':
          from = new Date(today); from.setDate(from.getDate() - 29);
          break;
        case '3months':
          from = new Date(today); from.setMonth(from.getMonth() - 3);
          break;
        case 'thisYear': {
          const j = Jalali.now();
          const g = this._parseJalali(`${j.year}/01/01`);
          from = g || new Date(today);
          break;
        }
        case 'lastYear': {
          const j = Jalali.now();
          const start = this._parseJalali(`${j.year - 1}/01/01`);
          const end = this._parseJalali(`${j.year - 1}/12/29`);
          from = start;
          to = end || new Date();
          break;
        }
        case 'custom':
          from = filter.from ? this._parseJalali(filter.from) : null;
          to = filter.to ? this._parseJalali(filter.to) : new Date();
          break;
        default:
          from = null;
      }
    } else {
      // پیش‌فرض: ۳۰ روز اخیر
      from = new Date(today); from.setDate(from.getDate() - 29);
    }

    return { from, to };
  }

  _netInvoiceLines(invoice) {
    const source = Array.isArray(invoice?.items) ? invoice.items : [];
    if (!source.length) return { items: [], allocationComplete: true };
    const items = [];
    for (const item of source) {
      let lineTotal = Number(item.lineTotal);
      if (!Number.isSafeInteger(lineTotal) || lineTotal < 0) {
        const gross = Number(item.qty) * Number(item.price);
        const rowDiscount = Number(item.discount ?? 0);
        const fallback = Math.round(gross) - rowDiscount;
        if (!Number.isSafeInteger(fallback) || fallback < 0) {
          return {
            items: source.map(row => ({ ...row, netLineTotal: Number(row.lineTotal) || 0 })),
            allocationComplete: false
          };
        }
        lineTotal = fallback;
      }
      items.push({ ...item, lineTotal });
    }
    const total = items.reduce((sum, item) => {
      const next = sum + item.lineTotal;
      return Number.isSafeInteger(next) ? next : NaN;
    }, 0);
    const discount = Number(invoice.totalDiscount ?? 0);
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(discount) ||
        discount < 0 || discount > total) {
      return {
        items: items.map(item => ({ ...item, netLineTotal: item.lineTotal })),
        allocationComplete: false
      };
    }
    try {
      return { items: allocateDiscount(items, discount), allocationComplete: true };
    } catch {
      return {
        items: items.map(item => ({ ...item, netLineTotal: item.lineTotal })),
        allocationComplete: false
      };
    }
  }

  _invoiceTotals(invoice) {
    const normalized = this._netInvoiceLines(invoice);
    const fallbackSubtotal = normalized.items.reduce((sum, item) => {
      const next = sum + item.lineTotal;
      return Number.isSafeInteger(next) ? next : NaN;
    }, 0);
    const storedSubtotal = Number(invoice.subtotal);
    const subtotal = Number.isSafeInteger(storedSubtotal) && storedSubtotal >= 0
      ? storedSubtotal : fallbackSubtotal;
    const storedDiscount = Number(invoice.totalDiscount ?? 0);
    const validDiscount = Number.isSafeInteger(subtotal) &&
      Number.isSafeInteger(storedDiscount) && storedDiscount >= 0 && storedDiscount <= subtotal;
    const normalizedSubtotal = normalized.items.reduce((sum, item) => {
      const next = sum + item.lineTotal;
      return Number.isSafeInteger(next) ? next : NaN;
    }, 0);
    const discount = validDiscount ? storedDiscount : 0;
    return {
      subtotal,
      discount,
      net: Number.isSafeInteger(subtotal) ? subtotal - discount : 0,
      valid: validDiscount && normalized.allocationComplete &&
        Number.isSafeInteger(normalizedSubtotal) && normalizedSubtotal === subtotal
    };
  }

  _stockMovementCostIndex(stockMovements = []) {
    const costs = new Map();
    for (const movement of stockMovements) {
      if (movement.refType !== 'invoice' || !movement.refId || !movement.productId ||
          !['in', 'out'].includes(movement.type) ||
          !Number.isSafeInteger(movement.cost) || movement.cost < 0) continue;
      const key = JSON.stringify([movement.refId, movement.productId, movement.type]);
      const next = (costs.get(key) || 0) + movement.cost;
      if (!Number.isSafeInteger(next)) throw Error('سرریز بهای تمام‌شده در گردش انبار');
      costs.set(key, next);
    }
    return costs;
  }

  _invoiceProductCosts(invoice, productsById, movementCosts) {
    const direction = invoice.kind === 'sale' ? 'out' :
      invoice.kind === 'sale_return' ? 'in' : null;
    const quantities = new Map();
    for (const item of (invoice.items || [])) {
      if (!item.productId) continue;
      const qty = Number(item.qty);
      const previous = quantities.get(item.productId) || 0;
      const next = previous + qty;
      if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(next))
        throw Error('مقدار کالا برای گزارش سودآوری نامعتبر است');
      quantities.set(item.productId, next);
    }
    const byProduct = new Map();
    const counts = { historical: 0, estimated: 0, unknown: 0 };
    for (const [productId, qty] of quantities) {
      const movementKey = JSON.stringify([invoice.id, productId, direction]);
      if (direction && movementCosts.has(movementKey)) {
        byProduct.set(productId, { cost: movementCosts.get(movementKey), basis: 'historical' });
        counts.historical++;
        continue;
      }
      const product = productsById.get(productId);
      if (product && product.trackInventory === false) {
        byProduct.set(productId, { cost: 0, basis: 'not-applicable' });
        continue;
      }
      const buyPrice = Number(product?.buyPrice);
      const estimated = buyPrice * qty;
      if (product && Number.isSafeInteger(buyPrice) && buyPrice >= 0 &&
          Number.isSafeInteger(Math.round(estimated)) && estimated >= 0) {
        byProduct.set(productId, { cost: Math.round(estimated), basis: 'estimated' });
        counts.estimated++;
      } else {
        byProduct.set(productId, { cost: 0, basis: 'unknown' });
        counts.unknown++;
      }
    }
    return { byProduct, counts };
  }

  _costBasisSummary(counts) {
    const historical = counts.historical || 0;
    const estimated = counts.estimated || 0;
    const unknown = counts.unknown || 0;
    const basis = unknown ? 'incomplete' :
      (historical && estimated) ? 'mixed' :
      estimated ? 'estimated' :
      historical ? 'historical' : 'not-applicable';
    return { basis, historical, estimated, unknown };
  }

  _buildProductStats(invoices, products, stockMovements) {
    const productsById = new Map(products.map(product => [product.id, product]));
    const movementCosts = this._stockMovementCostIndex(stockMovements);
    const stats = new Map();
    for (const invoice of invoices) {
      if (!['sale', 'sale_return'].includes(invoice.kind) || invoice.isPreInvoice) continue;
      const isReturn = invoice.kind === 'sale_return';
      const sign = isReturn ? -1 : 1;
      const normalized = this._netInvoiceLines(invoice);
      const byProduct = new Map();
      for (const item of normalized.items) {
        const productId = item.productId || null;
        const key = productId || 'unknown_' + (item.productName || '');
        const row = byProduct.get(key) || {
          productId,
          productName: item.productName || 'ناشناس',
          unit: item.unit || 'عدد',
          qty: 0,
          totalSales: 0
        };
        row.qty += Number(item.qty) || 0;
        row.totalSales += Number(item.netLineTotal) || 0;
        byProduct.set(key, row);
      }
      const costs = this._invoiceProductCosts(invoice, productsById, movementCosts);
      for (const [key, item] of byProduct) {
        const row = stats.get(key) || {
          productId: item.productId,
          productName: item.productName,
          unit: item.unit,
          qty: 0,
          totalSales: 0,
          cogs: 0,
          profit: 0,
          margin: 0,
          count: 0,
          returnCount: 0,
          costBasisCounts: { historical: 0, estimated: 0, unknown: 0 },
          discountAllocationIncomplete: false
        };
        row.qty += sign * item.qty;
        row.totalSales += sign * item.totalSales;
        if (isReturn) row.returnCount++;
        else row.count++;
        if (item.productId) {
          const cost = costs.byProduct.get(item.productId);
          if (cost?.basis === 'historical' || cost?.basis === 'estimated') {
            row.cogs += sign * cost.cost;
            row.costBasisCounts[cost.basis]++;
          } else if (cost?.basis === 'unknown') {
            row.costBasisCounts.unknown++;
          }
        }
        row.discountAllocationIncomplete ||= !normalized.allocationComplete;
        stats.set(key, row);
      }
    }
    return [...stats.values()].map(row => {
      row.profit = row.totalSales - row.cogs;
      row.margin = row.totalSales > 0 ? (row.profit / row.totalSales) * 100 : 0;
      row.costBasis = this._costBasisSummary(row.costBasisCounts).basis;
      row.costBasisDetails = this._costBasisSummary(row.costBasisCounts);
      return row;
    });
  }

  // ============================================================
  // ۱. سود و زیان
  // ============================================================
  async getProfitLoss(filter = {}, data = null) {
    const { invoices, products, expenses, stockMovements = [] } = data || await this._loadData();
    const { from, to } = this._getRange(filter);
    const inRange = invoices.filter(invoice => this._inRange(invoice.date, from, to));
    const salesInRange = inRange.filter(invoice =>
      invoice.kind === 'sale' && !invoice.isPreInvoice
    );
    const returnsInRange = inRange.filter(invoice =>
      invoice.kind === 'sale_return' && !invoice.isPreInvoice
    );

    const salesTotals = salesInRange.map(invoice => this._invoiceTotals(invoice));
    const returnTotals = returnsInRange.map(invoice => this._invoiceTotals(invoice));
    const grossSales = salesTotals.reduce((sum, totals) => sum + totals.subtotal, 0);
    const salesDiscounts = salesTotals.reduce((sum, totals) => sum + totals.discount, 0);
    const returnsAmount = returnTotals.reduce((sum, totals) => sum + totals.net, 0);
    const netSales = grossSales - salesDiscounts - returnsAmount;

    const productsById = new Map(products.map(product => [product.id, product]));
    const movementCosts = this._stockMovementCostIndex(stockMovements);
    const costCounts = { historical: 0, estimated: 0, unknown: 0 };
    let cogs = 0;
    for (const [rows, sign] of [[salesInRange, 1], [returnsInRange, -1]]) {
      for (const invoice of rows) {
        const result = this._invoiceProductCosts(invoice, productsById, movementCosts);
        for (const cost of result.byProduct.values()) cogs += sign * cost.cost;
        for (const key of Object.keys(costCounts)) costCounts[key] += result.counts[key];
      }
    }

    const expensesInRange = expenses.filter(expense => this._inRange(expense.date, from, to));
    const operatingExpenses = expensesInRange
      .filter(expense => expense.kind === 'expense')
      .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    const otherIncome = expensesInRange
      .filter(expense => expense.kind === 'income')
      .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    const netProfit = netSales - cogs - operatingExpenses + otherIncome;
    const netMargin = netSales !== 0 ? (netProfit / netSales) * 100 : 0;
    const costBasisDetails = this._costBasisSummary(costCounts);

    return {
      grossSales,
      salesDiscounts,
      returnsAmount,
      netSales,
      cogs,
      grossProfit: netSales - cogs,
      grossMargin: netSales !== 0 ? ((netSales - cogs) / netSales) * 100 : 0,
      operatingExpenses,
      otherIncome,
      netProfit,
      netMargin,
      invoiceCount: salesInRange.length,
      returnCount: returnsInRange.length,
      periodFrom: from,
      periodTo: to,
      costBasis: costBasisDetails.basis,
      costBasisDetails,
      discountAllocationIncomplete: [...salesTotals, ...returnTotals].some(totals => !totals.valid)
    };
  }

  async getSalesAnalysis(filter = {}, data = null) {
    const { invoices, products, stockMovements = [] } = data || await this._loadData();
    const { from, to } = this._getRange(filter);
    const rows = invoices.filter(invoice =>
      ['sale', 'sale_return'].includes(invoice.kind) &&
      !invoice.isPreInvoice &&
      this._inRange(invoice.date, from, to)
    );
    const productStats = this._buildProductStats(rows, products, stockMovements);
    const topProductsBySales = [...productStats]
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 10);
    const topProductsByQty = [...productStats]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    const contactStats = {};
    rows.forEach(invoice => {
      const key = invoice.contactId || 'unknown';
      if (!contactStats[key]) {
        contactStats[key] = {
          contactId: invoice.contactId,
          contactName: invoice.contactName || 'ناشناس',
          invoiceCount: 0,
          returnCount: 0,
          totalSales: 0,
          totalReturns: 0,
          netSales: 0,
          totalPaid: 0,
          totalRemaining: 0
        };
      }
      if (invoice.kind === 'sale') {
        contactStats[key].invoiceCount += 1;
        contactStats[key].totalSales += Number(invoice.grandTotal) || 0;
        contactStats[key].totalPaid += Number(invoice.paidAmount) || 0;
        contactStats[key].totalRemaining += Number(invoice.remaining) || 0;
      } else {
        contactStats[key].returnCount += 1;
        contactStats[key].totalReturns += Number(invoice.grandTotal) || 0;
      }
    });

    const topCustomers = Object.values(contactStats)
      .map(customer => ({ ...customer, netSales: customer.totalSales - customer.totalReturns }))
      .sort((a, b) => b.netSales - a.netSales)
      .slice(0, 10);
    return {
      topProductsBySales,
      topProductsByQty,
      topCustomers,
      invoiceCount: rows.filter(invoice => invoice.kind === 'sale').length
    };
  }

  async getProductProfitability(filter = {}, data = null) {
    const { invoices, products, stockMovements = [] } = data || await this._loadData();
    const { from, to } = this._getRange(filter);
    const rows = invoices.filter(invoice =>
      ['sale', 'sale_return'].includes(invoice.kind) &&
      !invoice.isPreInvoice &&
      this._inRange(invoice.date, from, to)
    );
    return this._buildProductStats(rows, products, stockMovements)
      .sort((a, b) => b.profit - a.profit);
  }

  async getCustomerReport(filter = {}, data = null) {
    const { invoices, contacts } = data || await this._loadData();
    const { from, to } = this._getRange(filter);
    const contactMap = {};
    contacts.forEach(contact => { contactMap[contact.id] = contact; });

    const stats = {};
    invoices.forEach(invoice => {
      if (!['sale', 'sale_return'].includes(invoice.kind) || invoice.isPreInvoice) return;
      if (!this._inRange(invoice.date, from, to)) return;
      const key = invoice.contactId || 'unknown';
      if (!stats[key]) {
        const contact = contactMap[invoice.contactId];
        stats[key] = {
          contactId: invoice.contactId,
          contactName: invoice.contactName || contact?.name || 'ناشناس',
          entityType: contact?.entityType || 'natural',
          totalInvoices: 0,
          returnCount: 0,
          totalSales: 0,
          totalReturns: 0,
          netSales: 0,
          totalPaid: 0,
          totalRemaining: 0,
          lastInvoiceDate: ''
        };
      }
      if (invoice.kind === 'sale') {
        stats[key].totalInvoices += 1;
        stats[key].totalSales += Number(invoice.grandTotal) || 0;
        stats[key].totalPaid += Number(invoice.paidAmount) || 0;
        stats[key].totalRemaining += Number(invoice.remaining) || 0;
      } else {
        stats[key].returnCount += 1;
        stats[key].totalReturns += Number(invoice.grandTotal) || 0;
      }
      if (invoice.date > (stats[key].lastInvoiceDate || ''))
        stats[key].lastInvoiceDate = invoice.date;
    });

    return Object.values(stats)
      .map(customer => ({ ...customer, netSales: customer.totalSales - customer.totalReturns }))
      .sort((a, b) => b.netSales - a.netSales);
  }

  // Load one company-scoped snapshot and reuse it across all report calculations.
  // The standalone methods keep their existing behavior when no snapshot is passed.
  async getReportBundle(filter = {}) {
    const data = await this._loadData();
    const [pl, sales, products, customers] = await Promise.all([
      this.getProfitLoss(filter, data),
      this.getSalesAnalysis(filter, data),
      this.getProductProfitability(filter, data),
      this.getCustomerReport(filter, data)
    ]);
    return { pl, sales, products, customers };
  }

  // ============================================================
  // آمار کمکی برای هدر صفحه
  // ============================================================
  async getQuickStats(filter = {}) {
    const pl = await this.getProfitLoss(filter);
    return {
      netSales: pl.netSales,
      netProfit: pl.netProfit,
      netMargin: pl.netMargin,
      grossMargin: pl.grossMargin
    };
  }
}

export const ReportController = new ReportControllerImpl();
window.ReportController = ReportController;