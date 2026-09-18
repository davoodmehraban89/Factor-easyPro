// ============================================================
// InvoiceController — منطق کامل فاکتور
// ============================================================

import { StorageService } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';
import { ProductController } from './ProductController.js';

class InvoiceControllerImpl {
  // شماره‌ی بعدی سریال (بر اساس نوع سند)
  async getNextNumber(kind = 'sale') {
    const user = Auth.current();
    const all = await StorageService.getByOwner('invoices', user.id);
    const kindInvoices = all.filter(i => i.kind === kind && !i.isPreInvoice);
    if (kindInvoices.length === 0) return 1;
    const maxNum = Math.max(...kindInvoices.map(i => Number(i.number) || 0));
    return maxNum + 1;
  }

  // ذخیره‌ی فاکتور (ایجاد یا ویرایش)
  async save(data, id = null) {
    const user = Auth.current();
    const items = (data.items || []).map(it => {
      const qty = Number(it.qty) || 0;
      const price = Number(it.price) || 0;
      const lineSubtotal = qty * price;
      let lineDiscount = 0;
      const discInput = Number(it.discount) || 0;
      if (it.discountType === 'percent') {
        lineDiscount = Math.round(lineSubtotal * discInput / 100);
      } else {
        lineDiscount = discInput;
      }
      lineDiscount = Math.max(0, Math.min(lineDiscount, lineSubtotal));
      const lineTotal = lineSubtotal - lineDiscount;
      return {
        productId: it.productId || null,
        productName: it.productName || '',
        unit: it.unit || 'عدد',
        qty,
        price,
        discount: lineDiscount,
        discountInput: discInput,
        discountType: it.discountType || 'fixed',
        lineSubtotal,
        lineTotal
      };
    });

    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);

    // تخفیف کلی
    let totalDiscount = 0;
    const discInput = Number(data.discountInput) || 0;
    if (data.discountType === 'percent') {
      totalDiscount = Math.round(subtotal * discInput / 100);
    } else {
      totalDiscount = discInput;
    }
    totalDiscount = Math.max(0, Math.min(totalDiscount, subtotal));

    const afterDiscount = Math.max(0, subtotal - totalDiscount);

    // مالیات
    let vatAmount = 0;
    if (data.vatEnabled && data.kind !== 'non_formal') {
      const rate = Number(data.vatRate) || 0;
      vatAmount = Math.round(afterDiscount * rate / 100);
    }
    const grandTotal = afterDiscount + vatAmount;

    // پرداخت
    const paidAmount = Math.max(0, Math.min(Number(data.paidAmount) || 0, grandTotal));
    const remaining = Math.max(0, grandTotal - paidAmount);

    const baseData = {
      ownerUserId: user.id,
      kind: data.kind || 'sale',
      isPreInvoice: !!data.isPreInvoice,
      date: data.date || this._todayJalali(),
      contactId: data.contactId || null,
      contactName: data.contactName || '',
      items,
      subtotal,
      totalDiscount,
      discountType: data.discountType || 'fixed',
      discountInput: discInput,
      vatEnabled: !!data.vatEnabled,
      vatRate: Number(data.vatRate) || 0,
      vatAmount,
      grandTotal,
      paymentMethod: data.paymentMethod || 'cash',
      paidAmount,
      remaining,
      description: (data.description || '').trim(),
      status: remaining === 0 ? 'paid' : (paidAmount > 0 ? 'partial' : 'unpaid')
    };

    let saved;
    if (id) {
      const existing = await StorageService.get('invoices', id);
      if (!existing) throw new Error('فاکتور یافت نشد');
      saved = { ...existing, ...baseData };
      await StorageService.put('invoices', saved);
    } else {
      const number = await this.getNextNumber(baseData.kind);
      saved = {
        id: StorageService.uid('inv_'),
        clientUuid: this._uuid(),
        number,
        ...baseData
      };
      await StorageService.put('invoices', saved);
    }

    // بازنویسی حرکات انبار
    await this._rebuildStockMovements(saved);
    return saved;
  }

  // ثبت حرکات انبار بر اساس نوع سند
  async _rebuildStockMovements(invoice) {
    const user = Auth.current();
    const all = await StorageService.getByOwner('stock_movements', user.id);

    // حذف حرکات قبلی این فاکتور
    for (const m of all.filter(x => x.refId === invoice.id)) {
      await StorageService.delete('stock_movements', m.id);
    }

    // تعیین جهت
    const inKinds = ['purchase', 'sale_return'];   // ورود به انبار
    const outKinds = ['sale', 'purchase_return'];  // خروج از انبار
    const direction = inKinds.includes(invoice.kind) ? 'in' :
                      outKinds.includes(invoice.kind) ? 'out' : 'out';

    // اگه پیش‌فاکتوره، حرکات ثبت نمی‌شه
    if (invoice.isPreInvoice) return;

    for (const item of invoice.items) {
      if (!item.productId) continue;
      const product = await StorageService.get('products', item.productId);
      if (!product || product.trackInventory === false) continue;

      const mv = {
        id: StorageService.uid('mv_'),
        ownerUserId: user.id,
        productId: item.productId,
        type: direction,
        qty: Number(item.qty) || 0,
        refType: 'invoice',
        refId: invoice.id,
        note: `فاکتور #${invoice.number}`,
        date: new Date().toISOString()
      };
      await StorageService.put('stock_movements', mv);
    }
  }

  async getAll(filter = {}) {
    const user = Auth.current();
    let list = await StorageService.getByOwner('invoices', user.id);

    if (filter.kind) list = list.filter(i => i.kind === filter.kind);
    if (filter.preInvoice !== undefined && filter.preInvoice !== '') {
      list = list.filter(i => !!i.isPreInvoice === filter.preInvoice);
    }
    if (filter.contactId) list = list.filter(i => i.contactId === filter.contactId);
    if (filter.paymentStatus) {
      list = list.filter(i => i.status === filter.paymentStatus);
    }
    if (filter.search) {
      const q = String(filter.search).toLowerCase();
      list = list.filter(i =>
        String(i.number || '').includes(q) ||
        (i.contactName || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q)
      );
    }
    if (filter.dateFrom) list = list.filter(i => (i.date || '') >= filter.dateFrom);
    if (filter.dateTo) list = list.filter(i => (i.date || '') <= filter.dateTo);

    return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  async get(id) {
    return await StorageService.get('invoices', id);
  }

  async delete(id) {
    const user = Auth.current();
    const movements = await StorageService.getByOwner('stock_movements', user.id);
    for (const m of movements.filter(x => x.refId === id)) {
      await StorageService.delete('stock_movements', m.id);
    }
    return await StorageService.delete('invoices', id);
  }

  // تبدیل پیش‌فاکتور به فاکتور
  async convertPreInvoice(id) {
    const inv = await StorageService.get('invoices', id);
    if (!inv) throw new Error('پیش‌فاکتور یافت نشد');
    const number = await this.getNextNumber(inv.kind);
    inv.isPreInvoice = false;
    inv.number = number;
    await StorageService.put('invoices', inv);
    await this._rebuildStockMovements(inv);
    return inv;
  }

  // علامت‌گذاری به‌عنوان پرداخت‌شده
  async markPaid(id, amount = null) {
    const inv = await StorageService.get('invoices', id);
    if (!inv) throw new Error('فاکتور یافت نشد');
    const pay = amount === null ? inv.grandTotal : Number(amount);
    inv.paidAmount = (Number(inv.paidAmount) || 0) + pay;
    inv.paidAmount = Math.min(inv.paidAmount, inv.grandTotal);
    inv.remaining = Math.max(0, inv.grandTotal - inv.paidAmount);
    inv.status = inv.remaining === 0 ? 'paid' : (inv.paidAmount > 0 ? 'partial' : 'unpaid');
    return await StorageService.put('invoices', inv);
  }

  // آمار برای داشبورد
  async getStats() {
    const user = Auth.current();
    const all = await StorageService.getByOwner('invoices', user.id);
    const salesInvoices = all.filter(i => i.kind === 'sale' && !i.isPreInvoice);

    const totalSales = salesInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0);
    const totalPaid = salesInvoices.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
    const totalRemaining = salesInvoices.reduce((s, i) => s + (Number(i.remaining) || 0), 0);

    return {
      count: all.length,
      salesCount: salesInvoices.length,
      totalSales,
      totalPaid,
      totalRemaining,
      preInvoiceCount: all.filter(i => i.isPreInvoice).length
    };
  }

  // لیبل نوع سند
  getKindLabel(kind) {
    const labels = {
      sale: 'فاکتور فروش',
      purchase: 'فاکتور خرید',
      sale_return: 'برگشت از فروش',
      purchase_return: 'برگشت از خرید',
      non_formal: 'غیررسمی'
    };
    return labels[kind] || kind;
  }

  _todayJalali() {
    const d = new Date();
    const gy = d.getFullYear(), gm = d.getMonth() + 1, gd = d.getDate();
    const g_d_m = [0,31,59,90,120,151,181,212,243,273,304,334];
    let jy = (gy <= 1600) ? 0 : 979;
    let gy2 = gy - (gy <= 1600 ? 621 : 1600);
    const gyAdj = (gm > 2) ? (gy2 + 1) : gy2;
    let days = (365 * gy2) + Math.floor((gyAdj + 3) / 4) - Math.floor((gyAdj + 99) / 100) + Math.floor((gyAdj + 399) / 400) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    const jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
  }

  _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

export const InvoiceController = new InvoiceControllerImpl();