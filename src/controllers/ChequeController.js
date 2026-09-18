// ============================================================
// ChequeController — منطق چک‌های دریافتی و پرداختی
// ============================================================

import { StorageService } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';

class ChequeControllerImpl {
  async getAll(filter = {}) {
    const user = Auth.current();
    if (!user) return [];
    let list = await StorageService.getByOwner('cheques', user.id);

    if (filter.direction) list = list.filter(c => c.direction === filter.direction);
    if (filter.status) list = list.filter(c => c.status === filter.status);
    if (filter.contactId) list = list.filter(c => c.contactId === filter.contactId);
    if (filter.search) {
      const q = String(filter.search).toLowerCase();
      list = list.filter(c =>
        (c.contactName || '').toLowerCase().includes(q) ||
        (c.sayadNumber || '').includes(q) ||
        (c.bankName || '').toLowerCase().includes(q) ||
        (c.chequeNumber || '').includes(q)
      );
    }

    return list.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }

  async get(id) {
    return await StorageService.get('cheques', id);
  }

  async create(data) {
    const user = Auth.current();
    const cheque = {
      id: StorageService.uid('chq_'),
      ownerUserId: user.id,
      direction: data.direction || 'inbound',   // inbound | outbound
      contactId: data.contactId || null,
      contactName: data.contactName || '',
      sayadNumber: (data.sayadNumber || '').trim(),
      chequeNumber: (data.chequeNumber || '').trim(),
      bankName: (data.bankName || '').trim(),
      branchName: (data.branchName || '').trim(),
      accountNumber: (data.accountNumber || '').trim(),
      holderName: (data.holderName || '').trim(),
      amount: Number(data.amount) || 0,
      issueDate: data.issueDate || this._todayJalali(),
      dueDate: data.dueDate || this._todayJalali(),
      status: data.status || 'pending',         // pending | cleared | bounced | returned | spent
      refInvoiceId: data.refInvoiceId || null,
      refInvoiceNumber: data.refInvoiceNumber || null,
      description: (data.description || '').trim()
    };
    return await StorageService.put('cheques', cheque);
  }

  async update(id, data) {
    const existing = await StorageService.get('cheques', id);
    if (!existing) throw new Error('چک یافت نشد');
    const updated = {
      ...existing,
      direction: data.direction || existing.direction,
      contactId: data.contactId || null,
      contactName: data.contactName || '',
      sayadNumber: (data.sayadNumber || '').trim(),
      chequeNumber: (data.chequeNumber || '').trim(),
      bankName: (data.bankName || '').trim(),
      branchName: (data.branchName || '').trim(),
      accountNumber: (data.accountNumber || '').trim(),
      holderName: (data.holderName || '').trim(),
      amount: Number(data.amount) || 0,
      issueDate: data.issueDate || existing.issueDate,
      dueDate: data.dueDate || existing.dueDate,
      refInvoiceId: data.refInvoiceId || existing.refInvoiceId,
      refInvoiceNumber: data.refInvoiceNumber || existing.refInvoiceNumber,
      description: (data.description || '').trim()
    };
    return await StorageService.put('cheques', updated);
  }

  async changeStatus(id, status) {
    const cheque = await StorageService.get('cheques', id);
    if (!cheque) throw new Error('چک یافت نشد');
    cheque.status = status;
    cheque.statusChangedAt = new Date().toISOString();
    return await StorageService.put('cheques', cheque);
  }

  async delete(id) {
    return await StorageService.delete('cheques', id);
  }

  // چک‌های نزدیک سررسید (۷ روز آینده)
  async getUpcoming(days = 7) {
    const all = await this.getAll({ status: 'pending' });
    const today = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    return all.filter(c => {
      const due = this._jalaliToDate(c.dueDate);
      return due >= today && due <= future;
    });
  }

  // چک‌های سررسید گذشته (پرداخت‌نشده)
  async getOverdue() {
    const all = await this.getAll({ status: 'pending' });
    const today = new Date();
    return all.filter(c => {
      const due = this._jalaliToDate(c.dueDate);
      return due < today;
    });
  }

  async getStats() {
    const all = await this.getAll();
    const inbound = all.filter(c => c.direction === 'inbound');
    const outbound = all.filter(c => c.direction === 'outbound');

    return {
      total: all.length,
      inbound: inbound.length,
      outbound: outbound.length,
      pending: all.filter(c => c.status === 'pending').length,
      inboundAmount: inbound.reduce((s, c) => s + (Number(c.amount) || 0), 0),
      outboundAmount: outbound.reduce((s, c) => s + (Number(c.amount) || 0), 0),
      pendingAmount: all.filter(c => c.status === 'pending').reduce((s, c) => s + (Number(c.amount) || 0), 0)
    };
  }

  getStatusLabel(status) {
    return {
      pending: 'در جریان',
      cleared: 'وصول شده',
      bounced: 'برگشتی',
      returned: 'عودت داده شده',
      spent: 'خرج شده'
    }[status] || status;
  }

  getStatusClass(status) {
    return {
      pending: 'badge-warning',
      cleared: 'badge-success',
      bounced: 'badge-danger',
      returned: 'badge-muted',
      spent: 'badge-info'
    }[status] || 'badge-muted';
  }

  getDirectionLabel(direction) {
    return direction === 'inbound' ? 'دریافتی' : 'پرداختی';
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

  _jalaliToDate(jalaliStr) {
    if (!jalaliStr) return new Date();
    const [jy, jm, jd] = jalaliStr.split('/').map(Number);
    let gy = (jy <= 979) ? 621 : 1600;
    let jy2 = jy - (jy <= 979 ? 0 : 979);
    let days = (365 * jy2) + (Math.floor(jy2 / 33) * 8) + Math.floor(((jy2 % 33) + 3) / 4) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    gy += 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) {
      gy += 100 * Math.floor(--days / 36524);
      days %= 36524;
      if (days >= 365) days++;
    }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    let gd = days + 1;
    const sal_a = [0,31,((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
    let gm = 0;
    for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
    return new Date(gy, gm - 1, gd);
  }
}

export const ChequeController = new ChequeControllerImpl();