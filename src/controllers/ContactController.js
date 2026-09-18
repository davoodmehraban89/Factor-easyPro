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
      entityType: data.entityType || 'natural',    // natural | legal
      role: data.role || 'customer',               // customer | supplier | both
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
   * محاسبه‌ی مانده حساب از تراکنش‌ها
   * فرمول: sum(invoices.grandTotal - receivedAmounts) - sum(payments)
   */
  async getBalance(contactId) {
    const user = Auth.current();
    if (!user) return 0;

    const invoices = await StorageService.getByOwner('invoices', user.id);
    const transactions = await StorageService.getByOwner('transactions', user.id);

    const contactInvoices = invoices.filter(i => i.contactId === contactId);
    const invoiceTotal = contactInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0);

    // دریافت وجه از مشتری (receipt) مانده رو کم می‌کنه
    // پرداخت به تامین‌کننده (payment) مانده رو زیاد می‌کنه
    const contactTransactions = transactions.filter(t => t.contactId === contactId);
    let receipts = 0, payments = 0;
    contactTransactions.forEach(t => {
      if (t.type === 'receipt') receipts += Number(t.amount) || 0;
      if (t.type === 'payment') payments += Number(t.amount) || 0;
    });

    // مانده = فاکتورها - دریافت‌ها + پرداخت‌ها
    return invoiceTotal - receipts + payments;
  }

  async getBalanceMap(contactIds) {
    const user = Auth.current();
    const invoices = await StorageService.getByOwner('invoices', user.id);
    const transactions = await StorageService.getByOwner('transactions', user.id);
    const map = {};
    contactIds.forEach(id => map[id] = { invoices: 0, receipts: 0, payments: 0 });

    invoices.forEach(inv => {
      if (map[inv.contactId]) map[inv.contactId].invoices += Number(inv.grandTotal) || 0;
    });
    transactions.forEach(t => {
      if (!map[t.contactId]) return;
      if (t.type === 'receipt') map[t.contactId].receipts += Number(t.amount) || 0;
      if (t.type === 'payment') map[t.contactId].payments += Number(t.amount) || 0;
    });

    const result = {};
    contactIds.forEach(id => {
      const m = map[id];
      result[id] = m.invoices - m.receipts + m.payments;
    });
    return result;
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