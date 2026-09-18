// ============================================================
// ReportController — محاسبات سود و زیان و تحلیل مالی
// ============================================================

import { StorageService } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';
import { Jalali } from '../utils/Jalali.js';

class ReportControllerImpl {
  async _loadData() {
    const user = Auth.current();
    if (!user) throw new Error('کاربر یافت نشد');
    const [invoices, products, expenses, contacts, cheques, treasury] = await Promise.all([
      StorageService.getByOwner('invoices', user.id),
      StorageService.getByOwner('products', user.id),
      StorageService.getByOwner('expenses', user.id),
      StorageService.getByOwner('contacts', user.id),
      StorageService.getByOwner('cheques', user.id),
      StorageService.getByOwner('treasury', user.id)
    ]);
    return { invoices: invoices || [], products: products || [], expenses: expenses || [], contacts: contacts || [], cheques: cheques || [], treasury: treasury || [] };
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

  // ============================================================
  // ۱. سود و زیان
  // ============================================================
  async getProfitLoss(filter = {}) {
    const { invoices, products, expenses } = await this._loadData();
    const { from, to } = this._getRange(filter);

    // فقط فاکتورهای فروش (بدون پیش‌فاکتور)
    const salesInRange = invoices.filter(i =>
      i.kind === 'sale' &&
      !i.isPreInvoice &&
      this._inRange(i.date, from, to)
    );

    // برگشت از فروش
    const returnsInRange = invoices.filter(i =>
      i.kind === 'sale_return' &&
      !i.isPreInvoice &&
      this._inRange(i.date, from, to)
    );

    // فروش ناخالص = مجموع فروش بدون مالیات و تخفیف نهایی
    const grossSales = salesInRange.reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
    const salesDiscounts = salesInRange.reduce((s, i) => s + (Number(i.totalDiscount) || 0), 0);
    const returnsAmount = returnsInRange.reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
    const netSales = grossSales - salesDiscounts - returnsAmount;

    // بهای تمام‌شده (COGS) — از قیمت خرید هر کالا
    let cogs = 0;
    const productMap = {};
    products.forEach(p => productMap[p.id] = p);

    salesInRange.forEach(inv => {
      (inv.items || []).forEach(it => {
        const p = productMap[it.productId];
        const buyPrice = p ? (Number(p.buyPrice) || 0) : 0;
        const qty = Number(it.qty) || 0;
        cogs += buyPrice * qty;
      });
    });

    // برگشت‌ها رو از COGS کم کن
    returnsInRange.forEach(inv => {
      (inv.items || []).forEach(it => {
        const p = productMap[it.productId];
        const buyPrice = p ? (Number(p.buyPrice) || 0) : 0;
        const qty = Number(it.qty) || 0;
        cogs -= buyPrice * qty;
      });
    });

    cogs = Math.max(0, cogs);
    const grossProfit = netSales - cogs;
    const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

    // هزینه‌های عملیاتی و سایر درآمدها
    const expensesInRange = expenses.filter(e => this._inRange(e.date, from, to));
    const operatingExpenses = expensesInRange.filter(e => e.kind === 'expense').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const otherIncome = expensesInRange.filter(e => e.kind === 'income').reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const netProfit = grossProfit - operatingExpenses + otherIncome;
    const netMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0;

    return {
      grossSales,
      salesDiscounts,
      returnsAmount,
      netSales,
      cogs,
      grossProfit,
      grossMargin,
      operatingExpenses,
      otherIncome,
      netProfit,
      netMargin,
      invoiceCount: salesInRange.length,
      returnCount: returnsInRange.length,
      periodFrom: from,
      periodTo: to
    };
  }

  // ============================================================
  // ۲. تحلیل فروش (Top Products & Customers)
  // ============================================================
  async getSalesAnalysis(filter = {}) {
    const { invoices, products, contacts } = await this._loadData();
    const { from, to } = this._getRange(filter);

    const salesInRange = invoices.filter(i =>
      i.kind === 'sale' &&
      !i.isPreInvoice &&
      this._inRange(i.date, from, to)
    );

    // محصولات
    const productStats = {};
    const productMap = {};
    products.forEach(p => productMap[p.id] = p);

    salesInRange.forEach(inv => {
      (inv.items || []).forEach(it => {
        const key = it.productId || 'unknown_' + (it.productName || '');
        if (!productStats[key]) {
          productStats[key] = {
            productId: it.productId,
            productName: it.productName || 'ناشناس',
            qty: 0,
            totalSales: 0,
            cogs: 0,
            count: 0
          };
        }
        const qty = Number(it.qty) || 0;
        const lineTotal = Number(it.lineTotal) || (qty * (Number(it.price) || 0));
        const p = productMap[it.productId];
        const buyPrice = p ? (Number(p.buyPrice) || 0) : 0;
        productStats[key].qty += qty;
        productStats[key].totalSales += lineTotal;
        productStats[key].cogs += buyPrice * qty;
        productStats[key].count += 1;
      });
    });

    const topProductsBySales = Object.values(productStats)
      .map(s => ({ ...s, profit: s.totalSales - s.cogs }))
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 10);

    const topProductsByQty = Object.values(productStats)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    // مشتریان
    const contactStats = {};
    salesInRange.forEach(inv => {
      const key = inv.contactId || 'unknown';
      if (!contactStats[key]) {
        contactStats[key] = {
          contactId: inv.contactId,
          contactName: inv.contactName || 'ناشناس',
          invoiceCount: 0,
          totalSales: 0,
          totalPaid: 0,
          totalRemaining: 0
        };
      }
      contactStats[key].invoiceCount += 1;
      contactStats[key].totalSales += Number(inv.grandTotal) || 0;
      contactStats[key].totalPaid += Number(inv.paidAmount) || 0;
      contactStats[key].totalRemaining += Number(inv.remaining) || 0;
    });

    const topCustomers = Object.values(contactStats)
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 10);

    return {
      topProductsBySales,
      topProductsByQty,
      topCustomers,
      invoiceCount: salesInRange.length
    };
  }

  // ============================================================
  // ۳. سودآوری کالا (همه کالاها)
  // ============================================================
  async getProductProfitability(filter = {}) {
    const { invoices, products } = await this._loadData();
    const { from, to } = this._getRange(filter);

    const salesInRange = invoices.filter(i =>
      i.kind === 'sale' &&
      !i.isPreInvoice &&
      this._inRange(i.date, from, to)
    );

    const productMap = {};
    products.forEach(p => productMap[p.id] = p);

    const stats = {};
    salesInRange.forEach(inv => {
      (inv.items || []).forEach(it => {
        const key = it.productId || 'unknown_' + (it.productName || '');
        if (!stats[key]) {
          const p = productMap[it.productId];
          stats[key] = {
            productId: it.productId,
            productName: it.productName || 'ناشناس',
            unit: it.unit || 'عدد',
            qty: 0,
            totalSales: 0,
            cogs: 0,
            profit: 0,
            margin: 0
          };
        }
        const qty = Number(it.qty) || 0;
        const lineTotal = Number(it.lineTotal) || (qty * (Number(it.price) || 0));
        const p = productMap[it.productId];
        const buyPrice = p ? (Number(p.buyPrice) || 0) : 0;
        stats[key].qty += qty;
        stats[key].totalSales += lineTotal;
        stats[key].cogs += buyPrice * qty;
      });
    });

    const rows = Object.values(stats).map(s => {
      s.profit = s.totalSales - s.cogs;
      s.margin = s.totalSales > 0 ? (s.profit / s.totalSales) * 100 : 0;
      return s;
    }).sort((a, b) => b.profit - a.profit);

    return rows;
  }

  // ============================================================
  // ۴. گزارش مشتریان
  // ============================================================
  async getCustomerReport(filter = {}) {
    const { invoices, contacts } = await this._loadData();
    const { from, to } = this._getRange(filter);

    const contactMap = {};
    contacts.forEach(c => contactMap[c.id] = c);

    const stats = {};
    invoices.forEach(inv => {
      if (inv.isPreInvoice) return;
      if (!this._inRange(inv.date, from, to)) return;
      const key = inv.contactId || 'unknown';
      if (!stats[key]) {
        const c = contactMap[inv.contactId];
        stats[key] = {
          contactId: inv.contactId,
          contactName: inv.contactName || 'ناشناس',
          entityType: c?.entityType || 'natural',
          totalInvoices: 0,
          totalSales: 0,
          totalReturns: 0,
          totalPaid: 0,
          totalRemaining: 0,
          lastInvoiceDate: ''
        };
      }
      const isSale = inv.kind === 'sale';
      const isReturn = inv.kind === 'sale_return';
      if (isSale) {
        stats[key].totalInvoices += 1;
        stats[key].totalSales += Number(inv.grandTotal) || 0;
        stats[key].totalPaid += Number(inv.paidAmount) || 0;
        stats[key].totalRemaining += Number(inv.remaining) || 0;
      } else if (isReturn) {
        stats[key].totalReturns += Number(inv.grandTotal) || 0;
      }
      if (inv.date > (stats[key].lastInvoiceDate || '')) {
        stats[key].lastInvoiceDate = inv.date;
      }
    });

    return Object.values(stats).sort((a, b) => b.totalSales - a.totalSales);
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