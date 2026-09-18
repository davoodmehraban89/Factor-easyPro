// ============================================================
// TreasuryController — حساب‌ها، صندوق، بانک و تراکنش‌ها
// ============================================================

import { StorageService } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';

class TreasuryControllerImpl {
  // ============================================================
  // حساب‌ها (Accounts)
  // ============================================================
  async getAccounts(filter = {}) {
    const user = Auth.current();
    if (!user) return [];
    let list = await StorageService.getByOwner('treasury', user.id);

    // فقط حساب‌ها (نه تراکنش‌ها) — با تفکیک recordType
    list = list.filter(a => (a.recordType || 'account') === 'account');

    if (filter.type) list = list.filter(a => a.type === filter.type);
    if (filter.search) {
      const q = String(filter.search).toLowerCase();
      list = list.filter(a =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.accountNumber || '').includes(q) ||
        (a.bankName || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return (a.name || '').localeCompare(b.name || '', 'fa');
    });
  }

  async getAccount(id) {
    return await StorageService.get('treasury', id);
  }

  async createAccount(data) {
    const user = Auth.current();
    const account = {
      id: StorageService.uid('acc_'),
      recordType: 'account',
      ownerUserId: user.id,
      type: data.type || 'cashbox',    // cashbox | bank | pos
      name: (data.name || '').trim(),
      accountNumber: (data.accountNumber || '').trim(),
      cardNumber: (data.cardNumber || '').trim(),
      sheba: (data.sheba || '').trim(),
      bankName: (data.bankName || '').trim(),
      branchName: (data.branchName || '').trim(),
      branchCode: (data.branchCode || '').trim(),
      ownerName: (data.ownerName || '').trim(),
      color: data.color || '#0d9488',
      initialBalance: Number(data.initialBalance) || 0,
      isDefault: false,
      isActive: true
    };

    // اگه اولین حسابه، پیش‌فرض بشه
    const existing = await this.getAccounts();
    if (existing.length === 0) account.isDefault = true;

    return await StorageService.put('treasury', account);
  }

  async updateAccount(id, data) {
    const existing = await StorageService.get('treasury', id);
    if (!existing) throw new Error('حساب یافت نشد');
    const updated = {
      ...existing,
      type: data.type || existing.type,
      name: (data.name || '').trim(),
      accountNumber: (data.accountNumber || '').trim(),
      cardNumber: (data.cardNumber || '').trim(),
      sheba: (data.sheba || '').trim(),
      bankName: (data.bankName || '').trim(),
      branchName: (data.branchName || '').trim(),
      branchCode: (data.branchCode || '').trim(),
      ownerName: (data.ownerName || '').trim(),
      color: data.color || existing.color,
      initialBalance: Number(data.initialBalance) || 0
    };
    return await StorageService.put('treasury', updated);
  }

  async deleteAccount(id) {
    // چک کن تراکنشی وابسته نباشه
    const user = Auth.current();
    const all = await StorageService.getByOwner('treasury', user.id);
    const related = all.filter(t => t.recordType === 'transaction' && (t.fromAccountId === id || t.toAccountId === id));
    if (related.length > 0) {
      throw new Error('این حساب تراکنش دارد. اول تراکنش‌ها را حذف کنید.');
    }
    return await StorageService.delete('treasury', id);
  }

  async setDefaultAccount(id) {
    const user = Auth.current();
    const all = await StorageService.getByOwner('treasury', user.id);
    for (const a of all.filter(x => x.recordType === 'account')) {
      a.isDefault = a.id === id;
      await StorageService.put('treasury', a);
    }
  }

  // ============================================================
  // محاسبه‌ی موجودی
  // ============================================================
  async getAccountBalance(accountId) {
    const user = Auth.current();
    const all = await StorageService.getByOwner('treasury', user.id);
    const account = all.find(a => a.id === accountId);
    if (!account) return 0;

    let balance = Number(account.initialBalance) || 0;

    // تراکنش‌ها
    const transactions = all.filter(t => t.recordType === 'transaction');
    transactions.forEach(t => {
      const amount = Number(t.amount) || 0;
      if (t.type === 'receipt') {
        // دریافت: به حساب مقصد اضافه می‌شه
        if (t.toAccountId === accountId) balance += amount;
      } else if (t.type === 'payment') {
        // پرداخت: از حساب مبدأ کم می‌شه
        if (t.fromAccountId === accountId) balance -= amount;
      } else if (t.type === 'transfer') {
        // انتقال: دو تا رکورد داره
        if (t.fromAccountId === accountId) balance -= amount;
        if (t.toAccountId === accountId) balance += amount;
      }
    });

    return balance;
  }

  async getBalanceMap() {
    const user = Auth.current();
    const all = await StorageService.getByOwner('treasury', user.id);
    const accounts = all.filter(a => a.recordType === 'account');
    const transactions = all.filter(t => t.recordType === 'transaction');
    const map = {};

    accounts.forEach(a => map[a.id] = Number(a.initialBalance) || 0);

    transactions.forEach(t => {
      const amount = Number(t.amount) || 0;
      if (t.type === 'receipt' && t.toAccountId && map[t.toAccountId] !== undefined) {
        map[t.toAccountId] += amount;
      } else if (t.type === 'payment' && t.fromAccountId && map[t.fromAccountId] !== undefined) {
        map[t.fromAccountId] -= amount;
      } else if (t.type === 'transfer') {
        if (t.fromAccountId && map[t.fromAccountId] !== undefined) map[t.fromAccountId] -= amount;
        if (t.toAccountId && map[t.toAccountId] !== undefined) map[t.toAccountId] += amount;
      }
    });

    return map;
  }

  async getTotalBalance() {
    const map = await this.getBalanceMap();
    return Object.values(map).reduce((s, v) => s + v, 0);
  }

  // ============================================================
  // تراکنش‌ها
  // ============================================================
  async getTransactions(filter = {}) {
    const user = Auth.current();
    if (!user) return [];
    let list = await StorageService.getByOwner('treasury', user.id);
    list = list.filter(t => t.recordType === 'transaction');

    if (filter.type) list = list.filter(t => t.type === filter.type);
    if (filter.accountId) {
      list = list.filter(t => t.fromAccountId === filter.accountId || t.toAccountId === filter.accountId);
    }
    if (filter.contactId) list = list.filter(t => t.contactId === filter.contactId);
    if (filter.dateFrom) list = list.filter(t => (t.date || '') >= filter.dateFrom);
    if (filter.dateTo) list = list.filter(t => (t.date || '') <= filter.dateTo);
    if (filter.search) {
      const q = String(filter.search).toLowerCase();
      list = list.filter(t =>
        (t.contactName || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        String(t.refInvoiceNumber || '').includes(q)
      );
    }

    return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  async getTransaction(id) {
    return await StorageService.get('treasury', id);
  }

  async createTransaction(data) {
    const user = Auth.current();
    const tx = {
      id: StorageService.uid('tx_'),
      recordType: 'transaction',
      ownerUserId: user.id,
      type: data.type,                       // receipt | payment | transfer
      date: data.date || this._todayJalali(),
      amount: Number(data.amount) || 0,
      fromAccountId: data.fromAccountId || null,
      toAccountId: data.toAccountId || null,
      contactId: data.contactId || null,
      contactName: data.contactName || '',
      refInvoiceId: data.refInvoiceId || null,
      refInvoiceNumber: data.refInvoiceNumber || null,
      method: data.method || 'cash',         // cash | card | cheque | transfer
      description: (data.description || '').trim(),
      chequeNumber: data.chequeNumber || ''
    };
    return await StorageService.put('treasury', tx);
  }

  async deleteTransaction(id) {
    return await StorageService.delete('treasury', id);
  }

  // ============================================================
  // Helpers
  // ============================================================
  getTypeLabel(type) {
    return { receipt: 'دریافت', payment: 'پرداخت', transfer: 'انتقال' }[type] || type;
  }

  getMethodLabel(method) {
    return {
      cash: 'نقدی',
      card: 'کارت',
      cheque: 'چک',
      transfer: 'انتقال بانکی'
    }[method] || method;
  }

  getAccountTypeLabel(type) {
    return { cashbox: 'صندوق', bank: 'بانک', pos: 'پوز' }[type] || type;
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
}

export const TreasuryController = new TreasuryControllerImpl();