// ============================================================
// ExpenseController — منطق هزینه‌ها و درآمدهای متفرقه
// ============================================================

import { StorageService } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';
import { Jalali } from '../utils/Jalali.js';

const DEFAULT_EXPENSE_CATEGORIES = [
  'قبوض', 'اجاره', 'حقوق و دستمزد', 'ملزومات',
  'تعمیرات و نگهداری', 'حمل و نقل', 'مالیات و عوارض', 'بیمه', 'سایر'
];

const DEFAULT_INCOME_CATEGORIES = [
  'فروش متفرقه', 'خدمات', 'اجاره دریافتی',
  'سود بانکی', 'سود سرمایه‌گذاری', 'سایر'
];

class ExpenseControllerImpl {
  async getAll(filter = {}) {
    const user = Auth.current();
    if (!user) return [];
    let list = await StorageService.getByOwner('expenses', user.id);

    if (filter.kind) list = list.filter(e => e.kind === filter.kind);
    if (filter.category) list = list.filter(e => e.category === filter.category);
    if (filter.dateFrom) list = list.filter(e => (e.date || '') >= filter.dateFrom);
    if (filter.dateTo) list = list.filter(e => (e.date || '') <= filter.dateTo);
    if (filter.search) {
      const q = String(filter.search).toLowerCase();
      list = list.filter(e =>
        (e.category || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.refNumber || '').toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  async get(id) {
    return await StorageService.get('expenses', id);
  }

  async create(data) {
    const user = Auth.current();
    if (!user) throw new Error('کاربر یافت نشد');
    const expense = {
      id: StorageService.uid('exp_'),
      ownerUserId: user.id,
      kind: data.kind === 'income' ? 'income' : 'expense',
      category: (data.category || '').trim(),
      amount: Math.max(0, Number(data.amount) || 0),
      date: data.date || Jalali.today(),
      method: data.method || 'cash',
      description: (data.description || '').trim(),
      refNumber: (data.refNumber || '').trim()
    };
    return await StorageService.put('expenses', expense);
  }

  async update(id, data) {
    const existing = await StorageService.get('expenses', id);
    if (!existing) throw new Error('سند یافت نشد');
    const updated = {
      ...existing,
      kind: data.kind === 'income' ? 'income' : 'expense',
      category: (data.category || '').trim(),
      amount: Math.max(0, Number(data.amount) || 0),
      date: data.date || existing.date,
      method: data.method || existing.method,
      description: (data.description || '').trim(),
      refNumber: (data.refNumber || '').trim()
    };
    return await StorageService.put('expenses', updated);
  }

  async delete(id) {
    return await StorageService.delete('expenses', id);
  }

  async getCategories(kind = null) {
    const user = Auth.current();
    if (!user) return [];
    const all = await StorageService.getByOwner('expenses', user.id);
    const custom = new Set();
    all.forEach(e => {
      if (kind && e.kind !== kind) return;
      if (e.category) custom.add(e.category);
    });

    const defaults = kind === 'income' ? DEFAULT_INCOME_CATEGORIES
                    : kind === 'expense' ? DEFAULT_EXPENSE_CATEGORIES
                    : [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];

    const merged = new Set([...defaults, ...custom]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b, 'fa'));
  }

  async getStats(filter = {}) {
    const list = await this.getAll(filter);
    let totalIncome = 0, totalExpense = 0;
    list.forEach(e => {
      const amt = Number(e.amount) || 0;
      if (e.kind === 'income') totalIncome += amt;
      else totalExpense += amt;
    });
    return {
      count: list.length,
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense
    };
  }

  async getCategoryStats(kind = null, filter = {}) {
    const list = await this.getAll({ ...filter, kind });
    const map = {};
    list.forEach(e => {
      const cat = e.category || 'بدون سرفصل';
      if (!map[cat]) map[cat] = { category: cat, total: 0, count: 0 };
      map[cat].total += Number(e.amount) || 0;
      map[cat].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }

  getMethodLabel(method) {
    return {
      cash: 'نقدی',
      card: 'کارت',
      cheque: 'چک',
      transfer: 'انتقال بانکی'
    }[method] || method;
  }

  getKindLabel(kind) {
    return kind === 'income' ? 'درآمد' : 'هزینه';
  }
}

export const ExpenseController = new ExpenseControllerImpl();
window.ExpenseController = ExpenseController;