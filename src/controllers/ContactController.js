// ============================================================
// ContactController — منطق اشخاص (مشتریان و تامین‌کنندگان)
// ============================================================

import { StorageService } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';
import { DataScope } from '../core/DataScope.js';
import { RetailPostingService } from '../core/RetailPostingService.js';

class ContactControllerImpl {
  async getAll(filter = {}) {
    const user = Auth.current();
    if (!user) return [];
    let list = await DataScope.list('contacts');

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
    return await StorageService.put('contacts', await DataScope.stamp('contacts', contact));
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
    return await StorageService.put('contacts', await DataScope.stamp('contacts', updated));
  }

  async delete(id) {
    const contact = await StorageService.get('contacts',id);
    if (!contact || contact.companyId !== await DataScope.companyId()) throw new Error('شخص در شرکت فعال یافت نشد');
    const invoices=await DataScope.list('invoices');
    const cheques=await DataScope.list('cheques');
    const receipts=await DataScope.list('treasury');
    if (invoices.some(x=>x.contactId===id)||cheques.some(x=>x.contactId===id)||
        receipts.some(x=>x.contactId===id))
      throw new Error('حذف شخص دارای گردش مالی مجاز نیست؛ اطلاعات را غیرفعال کنید');
    return await StorageService.delete('contacts',id);
  }

  async _financialContactRows(contactId=null) {
    const [accounts,entries,lines]=await Promise.all([
      DataScope.list('account_chart'),DataScope.list('journal_entries'),DataScope.list('journal_lines')
    ]);
    const relevant=new Set(accounts.filter(a=>['102','201'].includes(a.code)).map(a=>a.id));
    const posted=new Map(entries.filter(j=>j.status==='posted').map(j=>[j.id,j]));
    return lines.filter(l=>relevant.has(l.accountId)&&posted.has(l.journalId)&&
      (!contactId||l.contactId===contactId)&&!!l.contactId).map(l=>{
      const journal=posted.get(l.journalId);
      return {contactId:l.contactId,date:journal.date,refId:journal.sourceId,
        type:journal.sourceType,typeLabel:journal.description,refNumber:'',
        debit:l.debit,credit:l.credit,note:journal.description||'',dateISO:journal.postedAt||journal.date};
    });
  }
  /**
   * محاسبه‌ی مانده حساب
   */
  async getBalance(contactId) {
    if (await RetailPostingService.isEnabled()) {
      const rows=await this._financialContactRows(contactId);
      return rows.reduce((sum,row)=>sum+row.debit-row.credit,0);
    }
    const user = Auth.current();
    if (!user) return 0;

    const invoices = await DataScope.list('invoices');
    const transactions = await DataScope.list('treasury');

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
    if (await RetailPostingService.isEnabled()) {
      const rows=await this._financialContactRows();
      const result=Object.fromEntries(contactIds.map(id=>[id,0]));
      for(const row of rows) if(Object.hasOwn(result,row.contactId))
        result[row.contactId]+=row.debit-row.credit;
      return result;
    }
    const user = Auth.current();
    const invoices = await DataScope.list('invoices');
    const transactions = await DataScope.list('treasury');
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
    if (await RetailPostingService.isEnabled()) {
      const entries=(await this._financialContactRows(contactId)).sort((a,b)=>a.date.localeCompare(b.date));
      let running=0,totalDebit=0,totalCredit=0;
      const rows=entries.map(e=>{
        running+=e.debit-e.credit;totalDebit+=e.debit;totalCredit+=e.credit;
        return {...e,balance:running};
      });
      return {rows,totalDebit,totalCredit,finalBalance:running};
    }
    const user = Auth.current();
    if (!user) return { rows: [], totalDebit: 0, totalCredit: 0, finalBalance: 0 };

    const [invoices, transactions, cheques] = await Promise.all([
      DataScope.list('invoices'),
      DataScope.list('treasury'),
      DataScope.list('cheques')
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

    const contacts = await DataScope.list('contacts');
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
    const all = await DataScope.list('contacts');
    const set = new Set();
    all.forEach(c => (c.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fa'));
  }
}

export const ContactController = new ContactControllerImpl();
window.ContactController = ContactController;