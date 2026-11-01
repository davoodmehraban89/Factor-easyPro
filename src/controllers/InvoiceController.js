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
import { amount, lineGrossRials, percentOfRials } from '../core/RetailFinanceCore.mjs';

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
      const qty = Number(it.qty);
      const price = amount(it.price ?? 0, 'قیمت');
      // Both UI and persisted invoice use the exact same whole-rial rule.
      // Reject quantities with >3 decimals and monetary overflow before writes.
      const lineSubtotal = lineGrossRials(qty, price);
      let lineDiscount = 0;
      // The form stores the USER'S percentage in discountInput and the
      // resulting rial discount in discount. Reusing discount as a percent
      // would apply the reduction twice when saving a line.
      const discInput = Number(it.discountInput ?? it.discount ?? 0);
      if (!Number.isFinite(discInput) || discInput < 0 ||
          !['fixed','percent'].includes(it.discountType || 'fixed'))
        throw Error('تخفیف ردیف فاکتور نامعتبر است');
      if (it.discountType === 'percent') {
        lineDiscount = percentOfRials(lineSubtotal,it.discountInput ?? it.discount ?? 0,'درصد تخفیف ردیف');
      } else {
        lineDiscount = amount(it.discountInput ?? it.discount ?? 0,'تخفیف ثابت ردیف');
      }
      if (lineDiscount > lineSubtotal)
        throw Error('تخفیف ردیف بیش از مبلغ ناخالص است');
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

    // Every intermediate must fit a safe integer, including pre-invoices
    // that bypass the finalized double-entry posting boundary.
    const subtotal = items.reduce((sum, it) => amount(sum + it.lineTotal, 'جمع فاکتور'), 0);

    // تخفیف کلی
    let totalDiscount = 0;
    const discInput = data.discountInput ?? 0;
    if (!['fixed','percent'].includes(data.discountType || 'fixed'))
      throw Error('نوع تخفیف کل فاکتور نامعتبر است');
    if (data.discountType === 'percent') {
      totalDiscount = percentOfRials(subtotal,discInput,'درصد تخفیف کل');
    } else {
      totalDiscount = amount(discInput,'تخفیف ثابت کل');
    }
    if (totalDiscount > subtotal)
      throw Error('تخفیف کل نمی‌تواند بیشتر از مبلغ فاکتور باشد');

    const afterDiscount = Math.max(0, subtotal - totalDiscount);

    // مالیات
    // Validate supplied VAT rate even for tax-exempt invoices.
    const vatRate = data.vatRate ?? 0;
    percentOfRials(0,vatRate,'درصد مالیات');
    let vatAmount = 0;
    if (data.vatEnabled && data.kind !== 'non_formal')
      vatAmount = percentOfRials(afterDiscount,vatRate,'درصد مالیات');
    const grandTotal = amount(afterDiscount + vatAmount, 'جمع کل فاکتور');

    // پرداخت
    const paidAmount = amount(data.paidAmount ?? 0, 'مبلغ پرداخت');
    if (paidAmount > grandTotal)
      throw Error('مبلغ پرداخت بیش از مبلغ فاکتور است');
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
      discountInput: Number(discInput),
      vatEnabled: !!data.vatEnabled,
      vatRate: Number(vatRate),
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

    // Prepare the legacy invoice before opening IndexedDB transaction.
    // License counters and settings are secondary metadata and cannot be
    // atomically committed with IndexedDB; they are updated only after commit.
    let saved;
    let settings = null;
    let issuedNow = false;
    let nextNumber = null;
    if (id) {
      const existing = await StorageService.get('invoices', id);
      if (!existing || existing.companyId !== baseData.companyId) throw new Error('Invoice not found in active company');
      issuedNow = !!existing.isPreInvoice && !baseData.isPreInvoice;
      if (issuedNow) LicenseService.assertWritable();
      saved = { ...existing, ...baseData };
    } else {
      if (!baseData.isPreInvoice) LicenseService.assertWritable();
      settings = await SettingsController.getInvoiceSettings();
      const minimum = await this.getNextNumber(baseData.kind);
      const rawNumber = String(data.number ?? '').trim().replace(/[۰-۹]/g, ch => String(ch.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - 1632));
      const number = settings.numberingMode === 'manual' ? (rawNumber || String(minimum)) : String(minimum);
      if (!/^\d+$/.test(number) || !Number.isSafeInteger(Number(number)) || Number(number) < minimum) {
        throw new Error(`Invoice number must be at least ${minimum}`);
      }
      saved = {
        id: StorageService.uid('inv_'),
        clientUuid: this._uuid(),
        number,
        ...baseData
      };
      issuedNow = !baseData.isPreInvoice;
      if (issuedNow) nextNumber = Math.max(Number(settings.nextNumber) || 1, Number(number) + 1);
    }

    await this._commitLegacyInvoiceWithStock(saved, { requireExisting: Boolean(id), requirePreInvoice: false });
    if (issuedNow) await LicenseService.recordIssuedInvoice();
    if (nextNumber !== null) {
      await SettingsController.saveInvoiceSettings({ ...settings, nextNumber });
    }
    return saved;
  }

  // All legacy invoice and inventory mutations share one transaction. Both
  // active-company checks and concurrent update checks run inside the lock.
  async _commitLegacyInvoiceWithStock(invoice, { requireExisting = false, requirePreInvoice = false } = {}) {
    const companyId = await DataScope.companyId();
    if (!invoice || invoice.companyId !== companyId) throw new Error('Invoice outside active company');
    const user = Auth.current();
    const direction = ['purchase', 'sale_return'].includes(invoice.kind) ? 'in' : 'out';
    return StorageService.transaction(['invoices', 'stock_movements', 'products'], async tx => {
      const existing = await tx.get('invoices', invoice.id);
      if (requireExisting && (!existing || existing.companyId !== companyId)) throw new Error('Invoice not found in active company');
      if (!requireExisting && existing) throw new Error('Duplicate invoice id');
      if (existing?.financePosted) throw new Error('Posted invoice is immutable');
      if (requirePreInvoice && !existing?.isPreInvoice) throw new Error('Preinvoice required');
      if (existing && !requirePreInvoice && existing.isPreInvoice !== invoice.isPreInvoice && !existing.isPreInvoice) {
        throw new Error('Issued invoice cannot be reverted to preinvoice');
      }
      const allInvoices = await tx.getAll('invoices');
      if (!invoice.isPreInvoice && allInvoices.some(row =>
        row.id !== invoice.id && row.companyId === companyId && !row.isPreInvoice &&
        String(row.number) === String(invoice.number))) {
        throw new Error('Duplicate issued invoice number');
      }
      const movements = await tx.getAll('stock_movements');
      for (const movement of movements.filter(row => row.companyId === companyId && row.refType === 'invoice' && row.refId === invoice.id)) {
        await tx.delete('stock_movements', movement.id);
      }
      if (!invoice.isPreInvoice) {
        for (const item of invoice.items || []) {
          if (!item.productId) continue;
          const product = await tx.get('products', item.productId);
          if (!product || product.companyId !== companyId) throw new Error('Invoice item references a product outside the active company');
          if (product.trackInventory === false) continue;
          await tx.put('stock_movements', {
            id: StorageService.uid('mv_'), ownerUserId: user.id, companyId,
            productId: item.productId, type: direction, qty: Number(item.qty) || 0,
            refType: 'invoice', refId: invoice.id,
            note: `Invoice #${invoice.number}`, date: new Date().toISOString()
          });
        }
      }
      await tx.put('invoices', invoice);
      return invoice;
    });
  }

  async _rebuildStockMovements(invoice) {
    // Retained for older callers. InvoiceController.save and convertPreInvoice
    // use the full invoice+stock transaction instead.
    const companyId = await DataScope.companyId();
    if (!invoice || invoice.companyId !== companyId) throw new Error('Invoice stock rebuild is restricted to the active company');
    const user = Auth.current();
    const direction = ['purchase', 'sale_return'].includes(invoice.kind) ? 'in' : 'out';
    return StorageService.transaction(['stock_movements', 'products'], async tx => {
      const movements = await tx.getAll('stock_movements');
      for (const movement of movements.filter(m => m.companyId === companyId && m.refType === 'invoice' && m.refId === invoice.id)) {
        await tx.delete('stock_movements', movement.id);
      }
      if (invoice.isPreInvoice) return;
      for (const item of invoice.items || []) {
        if (!item.productId) continue;
        const product = await tx.get('products', item.productId);
        if (!product || product.companyId !== companyId) throw new Error('Invoice item references a product outside the active company');
        if (product.trackInventory === false) continue;
        await tx.put('stock_movements', {
          id: StorageService.uid('mv_'), ownerUserId: user.id, companyId,
          productId: item.productId, type: direction, qty: Number(item.qty) || 0,
          refType: 'invoice', refId: invoice.id,
          note: `Invoice #${invoice.number}`, date: new Date().toISOString()
        });
      }
    });
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
    const companyId = await DataScope.companyId();
    // Invoice and its stock movements must disappear together or not at all.
    // This also serializes deletion against other invoice-store transactions.
    return StorageService.transaction(['invoices', 'stock_movements'], async tx => {
      const record = await tx.get('invoices', id);
      if (!record || record.companyId !== companyId) throw new Error('فاکتور در شرکت جاری یافت نشد');
      if (record.financePosted) throw new Error('حذف فاکتور ثبت مالی‌شده مجاز نیست');
      const movements = await tx.getAll('stock_movements');
      for (const m of movements.filter(x => x.companyId === companyId && x.refType === 'invoice' && x.refId === id)) {
        await tx.delete('stock_movements', m.id);
      }
      await tx.delete('invoices', id);
    });
  }
  // تبدیل پیش‌فاکتور به فاکتور
  async convertPreInvoice(id) {
    LicenseService.assertWritable();
    const inv = await StorageService.get('invoices', id);
    if (!inv || inv.companyId !== await DataScope.companyId() || !inv.isPreInvoice)
      throw new Error('Preinvoice not found in active company');
    if (await RetailPostingService.isEnabled()) {
      const number = await this.getNextNumber(inv.kind);
      const issued = await RetailPostingService.issueInvoice({ ...inv, isPreInvoice: false, number });
      await LicenseService.recordIssuedInvoice();
      const settings = await SettingsController.getInvoiceSettings();
      await SettingsController.saveInvoiceSettings({ ...settings, nextNumber: Math.max(Number(settings.nextNumber) || 1, Number(number) + 1) });
      return issued;
    }
    const number = await this.getNextNumber(inv.kind);
    await this._assertUniqueNumber(number, inv.id);
    const issued = { ...inv, isPreInvoice: false, number };
    await this._commitLegacyInvoiceWithStock(issued, { requireExisting: true, requirePreInvoice: true });
    await LicenseService.recordIssuedInvoice();
    return issued;
  }

  // Payments serialize with invoice mutations.
  async markPaid(id, payment = null) {
    // The invoice read, validation and write must share one IndexedDB transaction.
    // Concurrent payment attempts serialize on the invoices object store.
    const companyId = await DataScope.companyId();
    return StorageService.transaction(['invoices'], async tx => {
      const inv = await tx.get('invoices', id);
      if (!inv || inv.companyId !== companyId) throw new Error('فاکتور در شرکت جاری یافت نشد');
      if (inv.financePosted) throw new Error('پرداخت فاکتور ثبت مالی‌شده از این مسیر مجاز نیست');
      if (inv.isPreInvoice) throw new Error('ثبت پرداخت برای پیش‌فاکتور مجاز نیست');
      const total = amount(inv.grandTotal, 'مبلغ فاکتور');
      const alreadyPaid = amount(inv.paidAmount ?? 0, 'مبلغ پرداخت‌شده');
      if (alreadyPaid > total) throw new Error('مبلغ پرداخت‌شده بیشتر از مبلغ فاکتور است');
      const remaining = total - alreadyPaid;
      const pay = payment === null ? remaining : amount(payment, 'مبلغ پرداخت');
      if (pay <= 0 || pay > remaining) throw new Error('مبلغ پرداخت باید مثبت و حداکثر برابر مانده فاکتور باشد');
      inv.paidAmount = alreadyPaid + pay;
      inv.remaining = total - inv.paidAmount;
      inv.status = inv.remaining === 0 ? 'paid' : 'partial';
      inv.companyId = companyId;
      return tx.put('invoices', inv);
    });
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