// ============================================================
// ContactController — منطق اشخاص (مشتریان و تامین‌کنندگان)
// ============================================================

import { StorageService } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';

class ContactControllerImpl {
  async getAll(filter = {}) {
    const user = Auth.current();
    if (!user) return [];
    let list = await StorageService.getByOwner('contacts', user.id);

    if (filter.search) {
      const q = String(filter.search).toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.mobile || '').includes(q) ||
        (c.phone || '').includes(q) ||
        (c.nationalId || '').includes(q) ||
        (c.economicCode || '').includes(q)
      );
    }
    if (filter.role && filter.role !== 'all') {
      list = list.filter(c => c.role === filter.role || c.role === 'both');
    }
    if (filter.entityType && filter.entityType !== 'all') {
      list = list.filter(c => c.entityType === filter.entityType);
    }

    return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  async get(id) {
    return await StorageService.get('contacts', id);
  }

  async create(data) {
    const user = Auth.current();
    const contact = {
      id: StorageService.uid('contact_'),
      ownerUserId: user.id,
      entityType: data.entityType || 'natural',
      role: data.role || 'customer',
      prefix: (data.prefix || '').trim(),
      name: (data.name || '').trim(),
      mobile: (data.mobile || '').trim(),
      phone: (data.phone || '').trim(),
      nationalId: (data.nationalId || '').trim(),
      economicCode: (data.economicCode || '').trim(),
      regNumber: (data.regNumber || '').trim(),
      postalCode: (data.postalCode || '').trim(),
      address: (data.address || '').trim(),
      tags: Array.isArray(data.tags) ? data.tags : [],
      note: (data.note || '').trim(),
      isActive: true
    };
    return await StorageService.put('contacts', contact);
  }

  async update(id, data) {
    const existing = await StorageService.get('contacts', id);
    if (!existing) throw new Error('شخص یافت نشد');
    const updated = {
      ...existing,
      entityType: data.entityType || existing.entityType,
      role: data.role || existing.role,
      prefix: (data.prefix || '').trim(),
      name: (data.name || '').trim(),
      mobile: (data.mobile || '').trim(),
      phone: (data.phone || '').trim(),
      nationalId: (data.nationalId || '').trim(),
      economicCode: (data.economicCode || '').trim(),
      regNumber: (data.regNumber || '').trim(),
      postalCode: (data.postalCode || '').trim(),
      address: (data.address || '').trim(),
      tags: Array.isArray(data.tags) ? data.tags : existing.tags || [],
      note: (data.note || '').trim()
    };
    return await StorageService.put('contacts', updated);
  }

  async delete(id) {
    return await StorageService.delete('contacts', id);
  }

  /**
   * محاسبه‌ی مانده حساب
   */
  async getBalance(contactId) {
    const user = Auth.current();
    if (!user) return 0;

    const invoices = await StorageService.getByOwner('invoices', user.id);
    const transactions = await StorageService.getByOwner('treasury', user.id);

    const contactInvoices = invoices.filter(i => i.contactId === contactId && !i.isPreInvoice);
    const invoiceTotal = contactInvoices.filter(i => i.kind === 'sale').reduce((s, i) => s + (Number(i.grandTotal) || 0), 0);
    const returnTotal = contactInvoices.filter(i => i.kind === 'sale_return').reduce((s, i) => s + (Number(i.grandTotal) || 0), 0);

    const contactTransactions = transactions.filter(t => t.recordType === 'transaction' && t.contactId === contactId);
    let receipts = 0, payments = 0;
    contactTransactions.forEach(t => {
      if (t.type === 'receipt') receipts += Number(t.amount) || 0;
      if (t.type === 'payment') payments += Number(t.amount) || 0;
    });

    return (invoiceTotal - returnTotal) - receipts + payments;
  }

  async getBalanceMap(contactIds) {
    const user = Auth.current();
    const invoices = await StorageService.getByOwner('invoices', user.id);
    const transactions = await StorageService.getByOwner('treasury', user.id);
    const map = {};
    contactIds.forEach(id => map[id] = { invoices: 0, returns: 0, receipts: 0, payments: 0 });

    invoices.forEach(inv => {
      if (!map[inv.contactId]) return;
      if (inv.isPreInvoice) return;
      if (inv.kind === 'sale') map[inv.contactId].invoices += Number(inv.grandTotal) || 0;
      if (inv.kind === 'sale_return') map[inv.contactId].returns += Number(inv.grandTotal) || 0;
    });
    transactions.forEach(t => {
      if (!map[t.contactId]) return;
      if (t.recordType !== 'transaction') return;
      if (t.type === 'receipt') map[t.contactId].receipts += Number(t.amount) || 0;
      if (t.type === 'payment') map[t.contactId].payments += Number(t.amount) || 0;
    });

    const result = {};
    contactIds.forEach(id => {
      const m = map[id];
      result[id] = (m.invoices - m.returns) - m.receipts + m.payments;
    });
    return result;
  }

  // ============================================================
  // متدهای جدید فاز ۱۰: کارت حساب (Ledger)
  // ============================================================

  /**
   * کارت حساب کامل یک شخص
   * تمام تراکنش‌ها (فاکتورها، برگشت‌ها، دریافت‌ها، پرداخت‌ها، چک‌ها) با مانده تجمعی
   */
  async getLedger(contactId) {
    const user = Auth.current();
    if (!user) return { rows: [], totalDebit: 0, totalCredit: 0, finalBalance: 0 };

    const [invoices, transactions, cheques] = await Promise.all([
      StorageService.getByOwner('invoices', user.id),
      StorageService.getByOwner('treasury', user.id),
      StorageService.getByOwner('cheques', user.id)
    ]);

    const entries = [];

    // ۱. فاکتورها
    invoices.forEach(inv => {
      if (inv.contactId !== contactId) return;
      if (inv.isPreInvoice) return;

      if (inv.kind === 'sale') {
        entries.push({
          date: inv.date,
          dateISO: inv.createdAt || inv.date,
          type: 'invoice_sale',
          typeLabel: 'فاکتور فروش',
          refNumber: inv.number,
          refId: inv.id,
          debit: Number(inv.grandTotal) || 0,
          credit: 0,
          note: `فاکتور #${inv.number}`
        });
      } else if (inv.kind === 'sale_return') {
        entries.push({
          date: inv.date,
          dateISO: inv.createdAt || inv.date,
          type: 'return_sale',
          typeLabel: 'برگشت از فروش',
          refNumber: inv.number,
          refId: inv.id,
          debit: 0,
          credit: Number(inv.grandTotal) || 0,
          note: `برگشت #${inv.number}`
        });
      } else if (inv.kind === 'purchase') {
        entries.push({
          date: inv.date,
          dateISO: inv.createdAt || inv.date,
          type: 'invoice_purchase',
          typeLabel: 'فاکتور خرید',
          refNumber: inv.number,
          refId: inv.id,
          debit: 0,
          credit: Number(inv.grandTotal) || 0,
          note: `خرید #${inv.number}`
        });
      } else if (inv.kind === 'purchase_return') {
        entries.push({
          date: inv.date,
          dateISO: inv.createdAt || inv.date,
          type: 'return_purchase',
          typeLabel: 'برگشت از خرید',
          refNumber: inv.number,
          refId: inv.id,
          debit: Number(inv.grandTotal) || 0,
          credit: 0,
          note: `برگشت خرید #${inv.number}`
        });
      }
    });

    // ۲. تراکنش‌ها (دریافت/پرداخت)
    transactions.forEach(t => {
      if (t.recordType !== 'transaction') return;
      if (t.contactId !== contactId) return;

      if (t.type === 'receipt') {
        entries.push({
          date: t.date,
          dateISO: t.createdAt || t.date,
          type: 'receipt',
          typeLabel: 'دریافت وجه',
          refNumber: '',
          refId: t.id,
          debit: 0,
          credit: Number(t.amount) || 0,
          note: t.description || 'دریافت وجه'
        });
      } else if (t.type === 'payment') {
        entries.push({
          date: t.date,
          dateISO: t.createdAt || t.date,
          type: 'payment',
          typeLabel: 'پرداخت وجه',
          refNumber: '',
          refId: t.id,
          debit: Number(t.amount) || 0,
          credit: 0,
          note: t.description || 'پرداخت وجه'
        });
      }
    });

    // ۳. چک‌ها (به‌عنوان بدهی/طلب)
    cheques.forEach(c => {
      if (c.contactId !== contactId) return;
      if (c.status === 'pending') {
        // چک در جریان — یک یادداشت
        if (c.direction === 'inbound') {
          entries.push({
            date: c.dueDate,
            dateISO: c.createdAt || c.dueDate,
            type: 'cheque_in',
            typeLabel: 'چک دریافتی (در جریان)',
            refNumber: c.sayadNumber || '',
            refId: c.id,
            debit: 0,
            credit: 0,
            note: `چک ${Formatters.toPersianDigits ? '' : ''}${c.amount ? '' : ''}`,
            isCheque: true,
            chequeAmount: Number(c.amount) || 0,
            chequeDirection: 'inbound'
          });
        } else {
          entries.push({
            date: c.dueDate,
            dateISO: c.createdAt || c.dueDate,
            type: 'cheque_out',
            typeLabel: 'چک پرداختی (در جریان)',
            refNumber: c.sayadNumber || '',
            refId: c.id,
            debit: 0,
            credit: 0,
            note: `چک پرداختی`,
            isCheque: true,
            chequeAmount: Number(c.amount) || 0,
            chequeDirection: 'outbound'
          });
        }
      }
    });

    // مرتب‌سازی بر اساس تاریخ
    entries.sort((a, b) => String(a.dateISO || a.date).localeCompare(String(b.dateISO || b.date)));

    // محاسبه مانده تجمعی
    let running = 0;
    let totalDebit = 0, totalCredit = 0;
    const rows = entries.map(e => {
      running += (e.debit || 0) - (e.credit || 0);
      totalDebit += (e.debit || 0);
      totalCredit += (e.credit || 0);
      return { ...e, balance: running };
    });

    return {
      rows,
      totalDebit,
      totalCredit,
      finalBalance: running
    };
  }

  /**
   * خلاصه‌ی دفتر کل: جمع بدهکاران و بستانکاران
   */
  async getGlobalSummary() {
    const user = Auth.current();
    if (!user) return { totalDebt: 0, totalCredit: 0, debtorsCount: 0, creditorsCount: 0 };

    const contacts = await StorageService.getByOwner('contacts', user.id);
    const ids = contacts.map(c => c.id);
    const balanceMap = await this.getBalanceMap(ids);

    let totalDebt = 0, totalCredit = 0, debtorsCount = 0, creditorsCount = 0;
    Object.values(balanceMap).forEach(b => {
      if (b > 0) {
        totalDebt += b;
        debtorsCount++;
      } else if (b < 0) {
        totalCredit += Math.abs(b);
        creditorsCount++;
      }
    });

    return { totalDebt, totalCredit, debtorsCount, creditorsCount };
  }

  async getAllTags() {
    const user = Auth.current();
    const all = await StorageService.getByOwner('contacts', user.id);
    const set = new Set();
    all.forEach(c => (c.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fa'));
  }
}

export const ContactController = new ContactControllerImpl();
window.ContactController = ContactController;