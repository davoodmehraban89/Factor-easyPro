// ============================================================
// DashboardView — داشبورد کامل با KPI، نمودارها و آمار
// ============================================================

import { StorageService } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';
import { Chart } from '../utils/Chart.js';
import { Formatters } from '../utils/Formatters.js';
import { Jalali } from '../utils/Jalali.js';

let cache = {
  invoices: [],
  expenses: [],
  cheques: [],
  treasury: [],
  contacts: [],
  products: [],
  salesPeriod: 'monthly'  // daily | monthly | yearly
};

class DashboardViewImpl {
  async render() {
    await this.reload();
    return `
      <div class="page-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <h2>داشبورد مدیریتی</h2>
          <p>${Jalali.formatLong()}</p>
        </div>
        <button class="btn btn-inline" onclick="FINORA.Router.go('invoices')">➕ فاکتور جدید</button>
      </div>

      ${this._renderKPIs()}

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px" class="dash-grid-main">
        ${this._renderSalesChart()}
        ${this._renderAccountsCard()}
      </div>

      ${this._renderIncomeExpenseChart()}

      ${this._renderRecentInvoices()}

      ${this._renderUpcomingCheques()}
    `;
  }

  onMount() {
    window.DashboardView = this;
  }

  async reload() {
    const user = Auth.current();
    if (!user) return;
    const [inv, exp, chq, trs, con, pro] = await Promise.all([
      StorageService.getByOwner('invoices', user.id),
      StorageService.getByOwner('expenses', user.id),
      StorageService.getByOwner('cheques', user.id),
      StorageService.getByOwner('treasury', user.id),
      StorageService.getByOwner('contacts', user.id),
      StorageService.getByOwner('products', user.id)
    ]);
    cache.invoices = inv || [];
    cache.expenses = exp || [];
    cache.cheques = chq || [];
    cache.treasury = trs || [];
    cache.contacts = con || [];
    cache.products = pro || [];
  }

  // ============================================================
  // KPI ها
  // ============================================================
  _renderKPIs() {
    const today = new Date();
    const currentJalali = Jalali.now();

    const salesInvoices = cache.invoices.filter(i => i.kind === 'sale' && !i.isPreInvoice);

    // فروش ماه جاری
    const monthInvoices = salesInvoices.filter(i => {
      const d = this._parseJalali(i.date);
      return d && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
    });
    const monthSales = monthInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0);

    // فروش کل
    const totalSales = salesInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0);

    // مطالبات معوق
    const unpaidInvoices = salesInvoices.filter(i => (Number(i.remaining) || 0) > 0);
    const totalUnpaid = unpaidInvoices.reduce((s, i) => s + (Number(i.remaining) || 0), 0);

    // درآمد و هزینه ماه
    const monthExpenses = cache.expenses.filter(e => {
      const d = this._parseJalali(e.date);
      return d && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
    });
    const monthIncomeTotal = monthExpenses.filter(e => e.kind === 'income').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const monthExpenseTotal = monthExpenses.filter(e => e.kind === 'expense').reduce((s, e) => s + (Number(e.amount) || 0), 0);

    // چک‌های سررسید ۷ روز آینده
    const upcomingCheques = cache.cheques.filter(c => {
      if (c.status !== 'pending') return false;
      const due = this._parseJalali(c.dueDate);
      if (!due) return false;
      const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 7;
    });
    const upcomingChequesAmount = upcomingCheques.reduce((s, c) => s + (Number(c.amount) || 0), 0);

    // موجودی کل خزانه
    const accounts = cache.treasury.filter(t => t.recordType === 'account');
    const transactions = cache.treasury.filter(t => t.recordType === 'transaction');
    let totalBalance = 0;
    accounts.forEach(a => totalBalance += Number(a.initialBalance) || 0);
    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'receipt' && t.toAccountId) totalBalance += amt;
      else if (t.type === 'payment' && t.fromAccountId) totalBalance -= amt;
      else if (t.type === 'transfer') {
        if (t.fromAccountId) totalBalance -= amt;
        if (t.toAccountId) totalBalance += amt;
      }
    });

    return `
      <div class="grid-kpi">
        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--primary)">
          <div class="kpi-card-icon" style="background:#eff6ff;color:var(--primary)">💰</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">فروش ماه جاری</div>
            <div style="font-size:17px;font-weight:800;color:var(--primary)">${Formatters.money(monthSales)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${Formatters.number(monthInvoices.length)} فاکتور</div>
          </div>
        </div>

        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--success)">
          <div class="kpi-card-icon" style="background:#ecfdf5;color:var(--success)">📊</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">فروش کل</div>
            <div style="font-size:17px;font-weight:800;color:var(--success)">${Formatters.money(totalSales)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${Formatters.number(salesInvoices.length)} فاکتور کل</div>
          </div>
        </div>

        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--danger)">
          <div class="kpi-card-icon" style="background:#fef2f2;color:var(--danger)">⏳</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">مطالبات معوق</div>
            <div style="font-size:17px;font-weight:800;color:var(--danger)">${Formatters.money(totalUnpaid)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${Formatters.number(unpaidInvoices.length)} فاکتور</div>
          </div>
        </div>

        <div class="card kpi-card" style="margin:0;border-top:3px solid #8b5cf6">
          <div class="kpi-card-icon" style="background:#faf5ff;color:#8b5cf6">💵</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">درآمد / هزینه ماه</div>
            <div style="font-size:13px;font-weight:800">
              <span style="color:var(--success)">${Formatters.money(monthIncomeTotal)}</span>
            </div>
            <div style="font-size:13px;font-weight:800;margin-top:2px">
              <span style="color:var(--danger)">${Formatters.money(monthExpenseTotal)}</span>
            </div>
          </div>
        </div>

        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--warning)">
          <div class="kpi-card-icon" style="background:#fffbeb;color:var(--warning)">💳</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">چک‌های سررسید (۷ روز)</div>
            <div style="font-size:17px;font-weight:800;color:var(--warning)">${Formatters.money(upcomingChequesAmount)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${Formatters.number(upcomingCheques.length)} فقره</div>
          </div>
        </div>

        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--info)">
          <div class="kpi-card-icon" style="background:#f0f9ff;color:var(--info)">🏦</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">موجودی کل خزانه</div>
            <div style="font-size:17px;font-weight:800;color:var(--info)">${Formatters.money(totalBalance)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${Formatters.number(accounts.length)} حساب</div>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================
  // نمودار فروش
  // ============================================================
  _renderSalesChart() {
    const data = this._getSalesChartData();
    const periods = [
      { key: 'daily', label: '۱۴ روز' },
      { key: 'monthly', label: '۱۲ ماه' },
      { key: 'yearly', label: '۵ سال' }
    ];
    const tabsHtml = periods.map(p =>
      `<button class="chart-tab ${cache.salesPeriod === p.key ? 'active' : ''}" onclick="window.DashboardView._switchPeriod('${p.key}')">${p.label}</button>`
    ).join('');

    return `
      <div class="card" style="margin:0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <h3 style="font-size:15px;font-weight:700">📈 روند فروش</h3>
          <div class="chart-tabs">${tabsHtml}</div>
        </div>
        ${Chart.line(data, { color: '#0d9488' })}
      </div>
    `;
  }

  _getSalesChartData() {
    const today = new Date();
    const salesInvoices = cache.invoices.filter(i => i.kind === 'sale' && !i.isPreInvoice);

    if (cache.salesPeriod === 'daily') {
      // ۱۴ روز اخیر
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const jDate = Jalali.fromDate(d);
        const label = `${jDate.day}/${jDate.month}`;
        const total = salesInvoices
          .filter(inv => {
            const invDate = this._parseJalali(inv.date);
            if (!invDate) return false;
            return invDate.getFullYear() === d.getFullYear()
              && invDate.getMonth() === d.getMonth()
              && invDate.getDate() === d.getDate();
          })
          .reduce((s, inv) => s + (Number(inv.grandTotal) || 0), 0);
        days.push({ label, value: total });
      }
      return days;
    }

    if (cache.salesPeriod === 'monthly') {
      // ۱۲ ماه اخیر
      const months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today);
        d.setMonth(d.getMonth() - i);
        const y = d.getFullYear();
        const m = d.getMonth();
        const jDate = Jalali.fromDate(d);
        const label = Jalali.monthName(jDate.month);
        const total = salesInvoices
          .filter(inv => {
            const invDate = this._parseJalali(inv.date);
            if (!invDate) return false;
            return invDate.getFullYear() === y && invDate.getMonth() === m;
          })
          .reduce((s, inv) => s + (Number(inv.grandTotal) || 0), 0);
        months.push({ label, value: total });
      }
      return months;
    }

    // yearly — ۵ سال اخیر
    const years = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - i);
      const y = d.getFullYear();
      const jDate = Jalali.fromDate(d);
      const label = Formatters.toPersianDigits(jDate.year);
      const total = salesInvoices
        .filter(inv => {
          const invDate = this._parseJalali(inv.date);
          return invDate && invDate.getFullYear() === y;
        })
        .reduce((s, inv) => s + (Number(inv.grandTotal) || 0), 0);
      years.push({ label, value: total });
    }
    return years;
  }

  _switchPeriod(period) {
    cache.salesPeriod = period;
    const card = document.querySelector('#pageContent .card');
    // رندر مجدد کل صفحه (ساده‌تر از پیدا کردن دقیق المان)
    this.render().then(html => {
      document.getElementById('pageContent').innerHTML = html;
    });
  }

  // ============================================================
  // کارت حساب‌ها
  // ============================================================
  _renderAccountsCard() {
    const accounts = cache.treasury.filter(t => t.recordType === 'account');
    if (accounts.length === 0) {
      return `
        <div class="card" style="margin:0">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:12px">🏦 حساب‌ها</h3>
          <div style="text-align:center;padding:30px 10px;color:var(--text-muted);font-size:12.5px">
            هنوز حسابی تعریف نشده
            <div style="margin-top:12px">
              <button class="btn btn-secondary btn-inline" onclick="FINORA.Router.go('treasury')">➕ تعریف حساب</button>
            </div>
          </div>
        </div>
      `;
    }

    // محاسبه موجودی
    const transactions = cache.treasury.filter(t => t.recordType === 'transaction');
    const balances = {};
    accounts.forEach(a => balances[a.id] = Number(a.initialBalance) || 0);
    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'receipt' && t.toAccountId && balances[t.toAccountId] !== undefined) balances[t.toAccountId] += amt;
      else if (t.type === 'payment' && t.fromAccountId && balances[t.fromAccountId] !== undefined) balances[t.fromAccountId] -= amt;
      else if (t.type === 'transfer') {
        if (t.fromAccountId && balances[t.fromAccountId] !== undefined) balances[t.fromAccountId] -= amt;
        if (t.toAccountId && balances[t.toAccountId] !== undefined) balances[t.toAccountId] += amt;
      }
    });

    const typeIcons = { cashbox: '💰', bank: '🏦', pos: '💳' };

    const cardsHtml = accounts.map(a => {
      const bal = balances[a.id] || 0;
      return `
        <div class="dash-account-card" style="border-right:3px solid ${a.color || '#0d9488'}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:16px">${typeIcons[a.type] || '📁'}</span>
            <span style="font-size:12.5px;font-weight:600">${this._esc(a.name)}</span>
            ${a.isDefault ? '<span class="badge badge-success" style="font-size:9px">پیش‌فرض</span>' : ''}
          </div>
          <div style="font-size:15px;font-weight:800;color:${bal >= 0 ? 'var(--success)' : 'var(--danger)'}">
            ${Formatters.money(bal)}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="card" style="margin:0;display:flex;flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="font-size:15px;font-weight:700">🏦 حساب‌ها</h3>
          <button class="btn btn-secondary btn-inline" style="font-size:11px;min-height:28px;padding:2px 10px" onclick="FINORA.Router.go('treasury')">مدیریت</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;max-height:280px">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  // ============================================================
  // نمودار درآمد و هزینه
  // ============================================================
  _renderIncomeExpenseChart() {
    const today = new Date();
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today);
      d.setMonth(d.getMonth() - i);
      const y = d.getFullYear();
      const m = d.getMonth();
      const jDate = Jalali.fromDate(d);
      const label = Jalali.monthName(jDate.month);

      const monthExp = cache.expenses.filter(e => {
        const ed = this._parseJalali(e.date);
        if (!ed) return false;
        return ed.getFullYear() === y && ed.getMonth() === m;
      });

      const income = monthExp.filter(e => e.kind === 'income').reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const expense = monthExp.filter(e => e.kind === 'expense').reduce((s, e) => s + (Number(e.amount) || 0), 0);

      data.push({ label, income, expense });
    }

    return `
      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">📊 درآمد و هزینه ۶ ماه اخیر</h3>
        ${Chart.bars(data)}
      </div>
    `;
  }

  // ============================================================
  // آخرین فاکتورها
  // ============================================================
  _renderRecentInvoices() {
    const recent = [...cache.invoices]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5);

    if (recent.length === 0) {
      return `
        <div class="card">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:12px">🧾 آخرین فاکتورها</h3>
          <div style="text-align:center;padding:30px 10px;color:var(--text-muted);font-size:12.5px">
            هنوز فاکتوری صادر نشده
            <div style="margin-top:12px">
              <button class="btn btn-secondary btn-inline" onclick="FINORA.Router.go('invoices')">➕ فاکتور جدید</button>
            </div>
          </div>
        </div>
      `;
    }

    const rows = recent.map(inv => {
      const kindLabels = {
        sale: { label: 'فروش', cls: 'badge-success' },
        purchase: { label: 'خرید', cls: 'badge-warning' },
        sale_return: { label: 'برگشت فروش', cls: 'badge-danger' },
        purchase_return: { label: 'برگشت خرید', cls: 'badge-danger' },
        non_formal: { label: 'غیررسمی', cls: 'badge-muted' }
      };
      const k = kindLabels[inv.kind] || { label: inv.kind, cls: 'badge-muted' };

      return `
        <tr>
          <td>
            <strong>#${Formatters.toPersianDigits(inv.number || '—')}</strong>
            ${inv.isPreInvoice ? ' <span class="badge badge-warning" style="font-size:9px">پیش</span>' : ''}
          </td>
          <td><span class="badge ${k.cls}">${k.label}</span></td>
          <td>${this._esc(inv.contactName || '—')}</td>
          <td>${Formatters.toPersianDigits(inv.date || '—')}</td>
          <td style="font-weight:700">${Formatters.money(inv.grandTotal || 0)}</td>
          <td>
            <button class="icon-btn-sm" title="چاپ" onclick="window.DashboardView._printInvoice('${inv.id}')">🖨️</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="font-size:15px;font-weight:700">🧾 آخرین فاکتورها</h3>
          <button class="btn btn-secondary btn-inline" style="font-size:11px;min-height:28px;padding:2px 10px" onclick="FINORA.Router.go('invoices')">همه</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>شماره</th>
                <th style="width:100px">نوع</th>
                <th>خریدار</th>
                <th style="width:100px">تاریخ</th>
                <th style="width:140px">مبلغ کل</th>
                <th style="width:60px">عملیات</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ============================================================
  // چک‌های سررسید
  // ============================================================
  _renderUpcomingCheques() {
    const today = new Date();
    const upcoming = cache.cheques
      .filter(c => {
        if (c.status !== 'pending') return false;
        const due = this._parseJalali(c.dueDate);
        if (!due) return false;
        const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
        return diff >= -30 && diff <= 30;
      })
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .slice(0, 8);

    if (upcoming.length === 0) {
      return '';
    }

    const rows = upcoming.map(c => {
      const due = this._parseJalali(c.dueDate);
      const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      let statusBadge = '';
      if (diff < 0) statusBadge = `<span class="badge badge-danger" style="font-size:9.5px">${Formatters.toPersianDigits(Math.abs(diff))} روز گذشته</span>`;
      else if (diff === 0) statusBadge = `<span class="badge badge-danger" style="font-size:9.5px">امروز</span>`;
      else if (diff <= 7) statusBadge = `<span class="badge badge-warning" style="font-size:9.5px">${Formatters.toPersianDigits(diff)} روز مانده</span>`;
      else statusBadge = `<span class="badge badge-muted" style="font-size:9.5px">${Formatters.toPersianDigits(diff)} روز</span>`;

      return `
        <tr>
          <td><span class="badge ${c.direction === 'inbound' ? 'badge-success' : 'badge-danger'}">${c.direction === 'inbound' ? '📥 دریافتی' : '📤 پرداختی'}</span></td>
          <td>${this._esc(c.contactName || '—')}</td>
          <td>${this._esc(c.bankName || '—')}</td>
          <td>${Formatters.toPersianDigits(c.dueDate || '—')}</td>
          <td style="font-weight:700">${Formatters.money(c.amount || 0)}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="font-size:15px;font-weight:700">💳 چک‌های نزدیک سررسید</h3>
          <button class="btn btn-secondary btn-inline" style="font-size:11px;min-height:28px;padding:2px 10px" onclick="FINORA.Router.go('cheques')">مدیریت</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:110px">نوع</th>
                <th>طرف حساب</th>
                <th style="width:110px">بانک</th>
                <th style="width:110px">سررسید</th>
                <th style="width:140px">مبلغ</th>
                <th style="width:130px">وضعیت</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ============================================================
  // Helpers
  // ============================================================
  async _printInvoice(invoiceId) {
    const { InvoicePrint } = await import('../utils/InvoicePrint.js');
    InvoicePrint.openSettings(invoiceId);
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

  _esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

export const DashboardView = new DashboardViewImpl();
window.DashboardView = DashboardView;