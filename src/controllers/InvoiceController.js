// ============================================================
// InvoiceController — منطق کامل فاکتور
// ============================================================

import { StorageService } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';
import { ProductController } from './ProductController.js';
import { SettingsController } from './SettingsController.js';
import { LicenseService } from '../core/LicenseService.js';
import { DataScope } from '../core/DataScope.js';
import { RetailPostingService } from '../core/RetailPostingService.js';

class InvoiceControllerImpl {
  // شماره‌ی بعدی سریال (بر اساس نوع سند)
  async getNextNumber(kind = 'sale') {
    const all = await DataScope.list('invoices');
    const kindInvoices = all.filter(i => i.kind === kind && !i.isPreInvoice);
    const maxNum = kindInvoices.length ? Math.max(...kindInvoices.map(i => Number(i.number) || 0)) : 0;
    const settings = await SettingsController.getInvoiceSettings();
    return Math.max(maxNum + 1, Number(settings.nextNumber) || 1);
  }

  async _assertUniqueNumber(number, excludeId = null) {
    const all = await DataScope.list('invoices');
    if (all.some(i => i.id !== excludeId && !i.isPreInvoice && String(i.number) === String(number))) {
      throw new Error('شماره فاکتور تکراری است');
    }
  }

  // ذخیره‌ی فاکتور (ایجاد یا ویرایش)
  async save(data, id = null) {
    if (id) {
      const previous = await StorageService.get('invoices', id);
      if (!previous || previous.companyId !== await DataScope.companyId())
        throw new Error('فاکتور در شرکت فعال یافت نشد');
      if (previous.financePosted)
        throw new Error('فاکتور ثبت‌شده در حسابداری قطعی است؛ ویرایش مستقیم حتی به پیش‌فاکتور مجاز نیست');
    }
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
      companyId: await DataScope.companyId(),
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
      status: remaining === 0 ? 'paid' : (paidAmount > 0 ? 'partial' : 'unpaid'),
      originalInvoiceId: data.originalInvoiceId || null,
      warehouseId: data.warehouseId || null
    };

    // V2: once activated, issuance, stock movement, settlement and general ledger
    // must commit together. Existing posted documents are never silently rewritten.
    if (await RetailPostingService.isEnabled() && !baseData.isPreInvoice) {
      LicenseService.assertWritable();
      const previous = id ? await StorageService.get('invoices', id) : null;
      if (id && (!previous || previous.companyId !== baseData.companyId || !previous.isPreInvoice))
        throw new Error('فاکتور قطعی قابل ویرایش مستقیم نیست؛ اصلاح از مسیر مرجوعی یا سند معکوس انجام شود');
      const settings = await SettingsController.getInvoiceSettings();
      const minimum = await this.getNextNumber(baseData.kind);
      const typed = String(data.number ?? '').trim().replace(/[۰-۹]/g, c => String(c.charCodeAt(0)-1776));
      const number = settings.numberingMode === 'manual' && typed ? typed : String(minimum);
      if (!/^\d+$/.test(number) || !Number.isSafeInteger(Number(number)) || Number(number)<minimum)
        throw new Error('شماره فاکتور از محدوده مجاز کوچک‌تر است');
      const issued = await RetailPostingService.issueInvoice({ ...baseData,
        id: id || StorageService.uid('inv_'), clientUuid: previous?.clientUuid || this._uuid(), number });
      await LicenseService.recordIssuedInvoice();
      await SettingsController.saveInvoiceSettings({ ...settings,
        nextNumber: Math.max(Number(settings.nextNumber)||1, Number(number)+1) });
      return issued;
    }

    let saved;
    if (id) {
      const existing = await StorageService.get('invoices', id);
      if (!existing) throw new Error('فاکتور یافت نشد');
      const becomesIssued = !!existing.isPreInvoice && !baseData.isPreInvoice;
      if (becomesIssued) LicenseService.assertWritable();
      saved = { ...existing, ...baseData };
      await StorageService.put('invoices', await DataScope.stamp('invoices', saved));
      if (becomesIssued) await LicenseService.recordIssuedInvoice();
    } else {
      if (!baseData.isPreInvoice) LicenseService.assertWritable();
      const settings = await SettingsController.getInvoiceSettings();
      const minimum = await this.getNextNumber(baseData.kind);
      const rawNumber = String(data.number ?? '').trim().replace(/[۰-۹]/g, ch => String(ch.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - 1632));
      const number = settings.numberingMode === 'manual' ? (rawNumber || String(minimum)) : String(minimum);
      if (!/^\d+$/.test(number) || !Number.isSafeInteger(Number(number)) || Number(number) < minimum) {
        throw new Error(`شماره فاکتور باید عددی و حداقل ${minimum} باشد؛ شماره‌های قبلی مجاز نیستند`);
      }
      await this._assertUniqueNumber(number);
      saved = {
        id: StorageService.uid('inv_'),
        clientUuid: this._uuid(),
        number,
        ...baseData
      };
      await StorageService.put('invoices', await DataScope.stamp('invoices', saved));
      if (!baseData.isPreInvoice) await LicenseService.recordIssuedInvoice();
      if (!baseData.isPreInvoice) {
        await SettingsController.saveInvoiceSettings({ ...settings, nextNumber: Math.max(Number(settings.nextNumber), Number(number) + 1) });
      }
    }

    // بازنویسی حرکات انبار
    await this._rebuildStockMovements(saved);
    return saved;
  }

  // ثبت حرکات انبار بر اساس نوع سند
  async _rebuildStockMovements(invoice) {
    const user = Auth.current();
    const all = await DataScope.list('stock_movements');

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
      await StorageService.put('stock_movements', await DataScope.stamp('stock_movements', mv));
    }
  }

  async getAll(filter = {}) {
    const user = Auth.current();
    let list = await DataScope.list('invoices');

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
    const record = await this.get(id);
    if (!record || record.companyId !== await DataScope.companyId()) throw new Error('فاکتور در شرکت فعال یافت نشد');
    if (record.financePosted) throw new Error('فاکتور قطعی دارای سند مالی است و قابل حذف نیست؛ از سند مرجوعی استفاده کنید');
    const user = Auth.current();
    const movements = await DataScope.list('stock_movements');
    for (const m of movements.filter(x => x.refId === id)) {
      await StorageService.delete('stock_movements', m.id);
    }
    return await StorageService.delete('invoices', id);
  }

  // تبدیل پیش‌فاکتور به فاکتور
  async convertPreInvoice(id) {
    LicenseService.assertWritable();
    const inv = await StorageService.get('invoices', id);
    if (!inv || inv.companyId !== await DataScope.companyId() || !inv.isPreInvoice) throw new Error('پیش‌فاکتور در این شرکت یافت نشد');
    if (await RetailPostingService.isEnabled()) {
      const number = await this.getNextNumber(inv.kind);
      const issued = await RetailPostingService.issueInvoice({ ...inv, isPreInvoice: false, number });
      await LicenseService.recordIssuedInvoice();
      const settings = await SettingsController.getInvoiceSettings();
      await SettingsController.saveInvoiceSettings({ ...settings, nextNumber: Math.max(Number(settings.nextNumber)||1, Number(number)+1) });
      return issued;
    }
    const number = await this.getNextNumber(inv.kind);
    await this._assertUniqueNumber(number, inv.id);
    inv.isPreInvoice = false;
    inv.number = number;
    await StorageService.put('invoices', await DataScope.stamp('invoices', inv));
    await this._rebuildStockMovements(inv);
    await LicenseService.recordIssuedInvoice();
    return inv;
  }

  // علامت‌گذاری به‌عنوان پرداخت‌شده
  async markPaid(id, amount = null) {
    const inv = await StorageService.get('invoices', id);
    if (!inv || inv.companyId !== await DataScope.companyId()) throw new Error('فاکتور در این شرکت یافت نشد');
    if (inv.financePosted) throw new Error('برای تسویه فاکتور دارای سند مالی، از بخش دریافت و پرداخت استفاده کنید');
    const pay = amount === null ? inv.grandTotal : Number(amount);
    inv.paidAmount = (Number(inv.paidAmount) || 0) + pay;
    inv.paidAmount = Math.min(inv.paidAmount, inv.grandTotal);
    inv.remaining = Math.max(0, inv.grandTotal - inv.paidAmount);
    inv.status = inv.remaining === 0 ? 'paid' : (inv.paidAmount > 0 ? 'partial' : 'unpaid');
    return await StorageService.put('invoices', await DataScope.stamp('invoices', inv));
  }

  // آمار برای داشبورد
  async getStats() {
    const all = await DataScope.list('invoices');
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