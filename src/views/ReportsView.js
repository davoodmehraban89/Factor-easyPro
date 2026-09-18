// ============================================================
// ReportsView — گزارش سود و زیان، تحلیل فروش و سودآوری
// ============================================================

import { ReportController } from '../controllers/ReportController.js';
import { Formatters } from '../utils/Formatters.js';
import { Jalali } from '../utils/Jalali.js';
import { Toast } from '../core/Toast.js';
import { Chart } from '../utils/Chart.js';

let currentTab = 'pl';  // pl | sales | products | customers
let currentFilter = {
  preset: '30days',
  from: '',
  to: ''
};

let cache = {
  pl: null,
  sales: null,
  products: [],
  customers: []
};

class ReportsViewImpl {
  async render() {
    await this.reload();
    return `
      <div class="page-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <h2>گزارش‌های مالی</h2>
          <p>تحلیل سود و زیان، فروش و سودآوری کسب‌وکار</p>
        </div>
        <button class="btn btn-secondary btn-inline" onclick="window.ReportsView._printReport()">🖨️ چاپ گزارش</button>
      </div>

      ${this._renderFilterBar()}

      <div class="tabs" style="margin-top:16px">
        <button class="tab-btn ${currentTab === 'pl' ? 'active' : ''}" onclick="window.ReportsView._switchTab('pl', event)">
          💹 سود و زیان
        </button>
        <button class="tab-btn ${currentTab === 'sales' ? 'active' : ''}" onclick="window.ReportsView._switchTab('sales', event)">
          📈 تحلیل فروش
        </button>
        <button class="tab-btn ${currentTab === 'products' ? 'active' : ''}" onclick="window.ReportsView._switchTab('products', event)">
          📦 سودآوری کالاها
        </button>
        <button class="tab-btn ${currentTab === 'customers' ? 'active' : ''}" onclick="window.ReportsView._switchTab('customers', event)">
          👥 گزارش مشتریان
        </button>
      </div>

      <div id="reports-content">${this.renderTabContent()}</div>
    `;
  }

  onMount() {
    window.ReportsView = this;
  }

  async reload() {
    cache.pl = await ReportController.getProfitLoss(currentFilter);
    cache.sales = await ReportController.getSalesAnalysis(currentFilter);
    cache.products = await ReportController.getProductProfitability(currentFilter);
    cache.customers = await ReportController.getCustomerReport(currentFilter);
  }

  renderTabContent() {
    if (currentTab === 'pl') return this.renderPLTab();
    if (currentTab === 'sales') return this.renderSalesTab();
    if (currentTab === 'products') return this.renderProductsTab();
    if (currentTab === 'customers') return this.renderCustomersTab();
    return '';
  }

  _switchTab(tab, event) {
    currentTab = tab;
    document.querySelectorAll('.tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.target) {
      const target = event.target.closest('.tab-btn');
      if (target) target.classList.add('active');
    }
    document.getElementById('reports-content').innerHTML = this.renderTabContent();
  }

  // ============================================================
  // فیلتر بازه
  // ============================================================
  _renderFilterBar() {
    const presets = [
      { key: 'today', label: 'امروز' },
      { key: '7days', label: '۷ روز' },
      { key: '30days', label: '۳۰ روز' },
      { key: '3months', label: '۳ ماه' },
      { key: 'thisYear', label: 'سال جاری' },
      { key: 'lastYear', label: 'سال قبل' },
      { key: 'custom', label: 'دلخواه' }
    ];

    const buttons = presets.map(p =>
      `<button class="chart-tab ${currentFilter.preset === p.key ? 'active' : ''}" onclick="window.ReportsView._setPreset('${p.key}')">${p.label}</button>`
    ).join('');

    const customInputs = currentFilter.preset === 'custom' ? `
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
        <span style="font-size:12.5px;color:var(--text-muted)">از تاریخ:</span>
        <input type="text" class="form-control" style="width:130px" placeholder="1405/01/01" value="${this._esc(currentFilter.from)}" onchange="window.ReportsView._setCustomDate('from', this.value)" />
        <span style="font-size:12.5px;color:var(--text-muted)">تا تاریخ:</span>
        <input type="text" class="form-control" style="width:130px" placeholder="1405/06/27" value="${this._esc(currentFilter.to)}" onchange="window.ReportsView._setCustomDate('to', this.value)" />
        <button class="btn btn-secondary btn-inline" style="font-size:12px;min-height:34px" onclick="window.ReportsView._applyCustom()">اعمال</button>
      </div>
    ` : '';

    const rangeText = this._formatRange(cache.pl?.periodFrom, cache.pl?.periodTo);

    return `
      <div class="card" style="padding:14px 16px;margin-bottom:0">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <span style="font-size:13px;font-weight:700">دوره‌ی گزارش:</span>
            <span style="font-size:12.5px;color:var(--primary);margin-right:6px">${rangeText}</span>
          </div>
          <div class="chart-tabs" style="flex-wrap:wrap">${buttons}</div>
        </div>
        ${customInputs}
      </div>
    `;
  }

  _formatRange(from, to) {
    if (!from && !to) return 'همه‌ی زمان‌ها';
    const f = from ? Jalali.format(from) : '—';
    const t = to ? Jalali.format(to) : '—';
    return `${Formatters.toPersianDigits(f)} تا ${Formatters.toPersianDigits(t)}`;
  }

  _setPreset(preset) {
    currentFilter.preset = preset;
    if (preset !== 'custom') {
      currentFilter.from = '';
      currentFilter.to = '';
    }
    this._refresh();
  }

  _setCustomDate(key, value) {
    currentFilter[key] = value;
  }

  _applyCustom() {
    if (!currentFilter.from || !currentFilter.to) {
      Toast.warning('تاریخ شروع و پایان رو کامل وارد کنید');
      return;
    }
    this._refresh();
  }

  async _refresh() {
    await this.reload();
    // رندر کامل مجدد تا فیلتر و همه‌چیز آپدیت بشه
    const html = await this.render();
    document.getElementById('pageContent').innerHTML = html;
  }

  // ============================================================
  // تب ۱: سود و زیان
  // ============================================================
  renderPLTab() {
    const pl = cache.pl || {};

    const rows = [
      { label: 'فروش ناخالص', value: pl.grossSales, color: 'var(--text)', bold: false, sign: '+' },
      { label: 'تخفیف فروش', value: -pl.salesDiscounts, color: 'var(--danger)', bold: false, sign: '-' },
      { label: 'برگشت از فروش', value: -pl.returnsAmount, color: 'var(--danger)', bold: false, sign: '-' },
      { label: 'فروش خالص', value: pl.netSales, color: 'var(--primary)', bold: true, sign: '=' },
      { label: 'بهای تمام‌شده کالای فروش‌رفته (COGS)', value: -pl.cogs, color: 'var(--warning)', bold: false, sign: '-' },
      { label: 'سود ناخالص', value: pl.grossProfit, color: 'var(--success)', bold: true, sign: '=' },
      { label: 'هزینه‌های عملیاتی', value: -pl.operatingExpenses, color: 'var(--danger)', bold: false, sign: '-' },
      { label: 'سایر درآمدها', value: pl.otherIncome, color: 'var(--success)', bold: false, sign: '+' },
      { label: 'سود (زیان) خالص', value: pl.netProfit, color: pl.netProfit >= 0 ? 'var(--success)' : 'var(--danger)', bold: true, sign: '=' }
    ];

    const rowsHtml = rows.map(r => {
      const isBold = r.bold;
      const val = Math.abs(Number(r.value) || 0);
      const sign = Number(r.value) < 0 ? '-' : (r.sign === '+' ? '+' : '');
      const display = (r.value === 0) ? Formatters.money(0) : `${sign} ${Formatters.money(val)}`;
      return `
        <tr style="${isBold ? 'background:var(--bg);font-weight:700' : ''}">
          <td style="padding:12px 16px;font-size:${isBold ? '14px' : '13px'}">${r.label}</td>
          <td style="padding:12px 16px;text-align:left;font-size:${isBold ? '14px' : '13px'};color:${r.color};font-weight:${isBold ? '800' : '600'}">
            ${display}
          </td>
        </tr>
      `;
    }).join('');

    const marginLabel = pl.netProfit >= 0 ? 'حاشیه سود خالص' : 'حاشیه زیان خالص';

    return `
      <div class="grid-kpi">
        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--primary)">
          <div class="kpi-card-icon" style="background:#eff6ff;color:var(--primary)">📊</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">فروش خالص</div>
            <div style="font-size:16px;font-weight:800;color:var(--primary)">${Formatters.money(pl.netSales)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${Formatters.number(pl.invoiceCount)} فاکتور</div>
          </div>
        </div>
        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--success)">
          <div class="kpi-card-icon" style="background:#ecfdf5;color:var(--success)">💵</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">سود ناخالص</div>
            <div style="font-size:16px;font-weight:800;color:var(--success)">${Formatters.money(pl.grossProfit)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${Formatters.percent(pl.grossMargin || 0)}</div>
          </div>
        </div>
        <div class="card kpi-card" style="margin:0;border-top:3px solid ${pl.netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">
          <div class="kpi-card-icon" style="background:${pl.netProfit >= 0 ? '#ecfdf5' : '#fef2f2'};color:${pl.netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${pl.netProfit >= 0 ? '📈' : '📉'}</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">سود (زیان) خالص</div>
            <div style="font-size:16px;font-weight:800;color:${pl.netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${Formatters.money(pl.netProfit)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${Formatters.percent(pl.netMargin || 0)}</div>
          </div>
        </div>
        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--danger)">
          <div class="kpi-card-icon" style="background:#fef2f2;color:var(--danger)">💸</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">بهای تمام‌شده</div>
            <div style="font-size:16px;font-weight:800;color:var(--danger)">${Formatters.money(pl.cogs)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">COGS</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">💹 صورت سود و زیان</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:60%">شرح</th>
                <th style="text-align:left">مبلغ</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              <tr style="background:${pl.netProfit >= 0 ? 'linear-gradient(135deg,#ecfdf5,#f0fdf4)' : 'linear-gradient(135deg,#fef2f2,#fff1f2)'}">
                <td style="padding:16px;font-weight:800;font-size:15px">${marginLabel}</td>
                <td style="padding:16px;text-align:left;font-weight:800;font-size:15px;color:${pl.netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">
                  ${Formatters.percent(pl.netMargin || 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      ${pl.netSales === 0 ? `
        <div class="card" style="text-align:center;padding:30px">
          <div style="font-size:40px;margin-bottom:10px;opacity:.4">📊</div>
          <p style="font-size:13px;color:var(--text-muted)">در این بازه‌ی زمانی فروشی ثبت نشده است</p>
        </div>
      ` : ''}
    `;
  }

  // ============================================================
  // تب ۲: تحلیل فروش
  // ============================================================
  renderSalesTab() {
    const s = cache.sales || {};
    const topBySales = s.topProductsBySales || [];
    const topByQty = s.topProductsByQty || [];
    const topCustomers = s.topCustomers || [];

    const productsChartData = topBySales.slice(0, 8).map(p => ({
      label: this._truncate(p.productName, 12),
      value: p.totalSales
    }));

    return `
      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">📊 پرفروش‌ترین کالاها (به ترتیب مبلغ)</h3>
        ${Chart.bars(topBySales.slice(0, 8).map(p => ({
          label: this._truncate(p.productName, 10),
          income: p.totalSales,
          expense: p.cogs
        })), { incomeColor: '#0d9488', expenseColor: '#d97706' })}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="dash-grid-main">
        <div class="card" style="margin:0">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">🏆 ۱۰ کالای پرفروش (مبلغ)</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style="width:30px">#</th>
                  <th>نام کالا</th>
                  <th style="width:70px">تعداد</th>
                  <th style="width:130px">مبلغ فروش</th>
                </tr>
              </thead>
              <tbody>
                ${topBySales.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">داده‌ای نیست</td></tr>' : topBySales.map((p, i) => `
                  <tr>
                    <td><strong>${Formatters.toPersianDigits(i + 1)}</strong></td>
                    <td>${this._esc(p.productName)}</td>
                    <td>${Formatters.number(p.qty)}</td>
                    <td style="font-weight:600">${Formatters.money(p.totalSales)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="margin:0">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">🏆 ۱۰ کالای پرفروش (تعداد)</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style="width:30px">#</th>
                  <th>نام کالا</th>
                  <th style="width:70px">تعداد</th>
                  <th style="width:130px">مبلغ فروش</th>
                </tr>
              </thead>
              <tbody>
                ${topByQty.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">داده‌ای نیست</td></tr>' : topByQty.map((p, i) => `
                  <tr>
                    <td><strong>${Formatters.toPersianDigits(i + 1)}</strong></td>
                    <td>${this._esc(p.productName)}</td>
                    <td style="font-weight:700;color:var(--primary)">${Formatters.number(p.qty)}</td>
                    <td>${Formatters.money(p.totalSales)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">👥 ۱۰ مشتری برتر (به ترتیب مبلغ خرید)</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:30px">#</th>
                <th>مشتری</th>
                <th style="width:100px">تعداد فاکتور</th>
                <th style="width:150px">مجموع خرید</th>
                <th style="width:150px">مجموع پرداخت</th>
                <th style="width:150px">مانده</th>
              </tr>
            </thead>
            <tbody>
              ${topCustomers.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted)">داده‌ای نیست</td></tr>' : topCustomers.map((c, i) => `
                <tr>
                  <td><strong>${Formatters.toPersianDigits(i + 1)}</strong></td>
                  <td>${this._esc(c.contactName)}</td>
                  <td>${Formatters.number(c.invoiceCount)}</td>
                  <td style="font-weight:600;color:var(--primary)">${Formatters.money(c.totalSales)}</td>
                  <td style="color:var(--success)">${Formatters.money(c.totalPaid)}</td>
                  <td style="font-weight:600;color:${c.totalRemaining > 0 ? 'var(--danger)' : 'var(--success)'}">${Formatters.money(c.totalRemaining)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ============================================================
  // تب ۳: سودآوری کالاها
  // ============================================================
  renderProductsTab() {
    const list = cache.products || [];
    const totalSales = list.reduce((s, p) => s + p.totalSales, 0);
    const totalProfit = list.reduce((s, p) => s + p.profit, 0);

    return `
      <div class="grid-kpi">
        <div class="card kpi-card" style="margin:0">
          <div class="kpi-card-icon" style="background:#eff6ff;color:var(--primary)">📦</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">تعداد کالاهای فروش‌رفته</div>
            <div style="font-size:16px;font-weight:800;color:var(--primary)">${Formatters.number(list.length)}</div>
          </div>
        </div>
        <div class="card kpi-card" style="margin:0">
          <div class="kpi-card-icon" style="background:#ecfdf5;color:var(--success)">💰</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">مجموع فروش</div>
            <div style="font-size:16px;font-weight:800;color:var(--success)">${Formatters.money(totalSales)}</div>
          </div>
        </div>
        <div class="card kpi-card" style="margin:0">
          <div class="kpi-card-icon" style="background:#fef2f2;color:var(--danger)">📈</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">مجموع سود</div>
            <div style="font-size:16px;font-weight:800;color:var(--danger)">${Formatters.money(totalProfit)}</div>
          </div>
        </div>
        <div class="card kpi-card" style="margin:0">
          <div class="kpi-card-icon" style="background:#fef3c7;color:var(--warning)">%</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">میانگین حاشیه سود</div>
            <div style="font-size:16px;font-weight:800;color:var(--warning)">${Formatters.percent(totalSales > 0 ? (totalProfit / totalSales) * 100 : 0)}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">📦 جدول سودآوری کالاها</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:30px">#</th>
                <th>نام کالا</th>
                <th style="width:80px">واحد</th>
                <th style="width:80px">تعداد فروش</th>
                <th style="width:140px">فروش کل</th>
                <th style="width:140px">بهای تمام‌شده</th>
                <th style="width:140px">سود خالص</th>
                <th style="width:100px">حاشیه سود</th>
              </tr>
            </thead>
            <tbody>
              ${list.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">هیچ کالایی در این بازه فروش نرفته</td></tr>' : list.map((p, i) => `
                <tr>
                  <td><strong>${Formatters.toPersianDigits(i + 1)}</strong></td>
                  <td>${this._esc(p.productName)}</td>
                  <td>${this._esc(p.unit)}</td>
                  <td style="font-weight:700">${Formatters.number(p.qty)}</td>
                  <td>${Formatters.money(p.totalSales)}</td>
                  <td style="color:var(--warning)">${Formatters.money(p.cogs)}</td>
                  <td style="font-weight:700;color:${p.profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${Formatters.money(p.profit)}</td>
                  <td>
                    <span class="badge ${p.margin >= 30 ? 'badge-success' : p.margin >= 10 ? 'badge-warning' : 'badge-danger'}">
                      ${Formatters.percent(p.margin)}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ============================================================
  // تب ۴: گزارش مشتریان
  // ============================================================
  renderCustomersTab() {
    const list = cache.customers || [];
    const totalSales = list.reduce((s, c) => s + c.totalSales, 0);
    const totalRemaining = list.reduce((s, c) => s + c.totalRemaining, 0);

    return `
      <div class="grid-kpi">
        <div class="card kpi-card" style="margin:0">
          <div class="kpi-card-icon" style="background:#eff6ff;color:var(--primary)">👥</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">تعداد مشتریان فعال</div>
            <div style="font-size:16px;font-weight:800;color:var(--primary)">${Formatters.number(list.length)}</div>
          </div>
        </div>
        <div class="card kpi-card" style="margin:0">
          <div class="kpi-card-icon" style="background:#ecfdf5;color:var(--success)">💰</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">مجموع فروش</div>
            <div style="font-size:16px;font-weight:800;color:var(--success)">${Formatters.money(totalSales)}</div>
          </div>
        </div>
        <div class="card kpi-card" style="margin:0">
          <div class="kpi-card-icon" style="background:#fef2f2;color:var(--danger)">⏳</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">مجموع مطالبات</div>
            <div style="font-size:16px;font-weight:800;color:var(--danger)">${Formatters.money(totalRemaining)}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">👥 گزارش تفصیلی مشتریان</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:30px">#</th>
                <th>نام مشتری</th>
                <th style="width:100px">نوع</th>
                <th style="width:110px">تعداد فاکتور</th>
                <th style="width:140px">مجموع خرید</th>
                <th style="width:140px">پرداخت‌شده</th>
                <th style="width:140px">مانده</th>
                <th style="width:120px">آخرین فاکتور</th>
              </tr>
            </thead>
            <tbody>
              ${list.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">داده‌ای نیست</td></tr>' : list.map((c, i) => `
                <tr>
                  <td><strong>${Formatters.toPersianDigits(i + 1)}</strong></td>
                  <td>${this._esc(c.contactName)}</td>
                  <td><span class="badge ${c.entityType === 'legal' ? 'badge-warning' : 'badge-success'}">${c.entityType === 'legal' ? 'حقوقی' : 'حقیقی'}</span></td>
                  <td>${Formatters.number(c.totalInvoices)}</td>
                  <td style="font-weight:600;color:var(--primary)">${Formatters.money(c.totalSales)}</td>
                  <td style="color:var(--success)">${Formatters.money(c.totalPaid)}</td>
                  <td style="font-weight:700;color:${c.totalRemaining > 0 ? 'var(--danger)' : 'var(--success)'}">${Formatters.money(c.totalRemaining)}</td>
                  <td>${c.lastInvoiceDate ? Formatters.toPersianDigits(c.lastInvoiceDate) : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ============================================================
  // چاپ گزارش
  // ============================================================
  _printReport() {
    const pl = cache.pl || {};
    const tabNames = { pl: 'سود و زیان', sales: 'تحلیل فروش', products: 'سودآوری کالاها', customers: 'گزارش مشتریان' };
    const rangeText = this._formatRange(pl.periodFrom, pl.periodTo);

    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) { Toast.error('پاپ‌آپ را فعال کنید'); return; }

    const content = this._buildPrintContent();

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>گزارش ${tabNames[currentTab]}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/misc/Farsi-Digits/Vazirmatn-FD-font-face.css" />
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { direction: rtl; text-align: right; font-family: 'Vazirmatn FD', Tahoma, sans-serif; background: #fff; color: #000; }
          body { padding: 10px; }
          table { width: 100%; border-collapse: collapse; direction: rtl; }
          th, td { padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right; font-size: 11.5px; }
          th { background: #f1f5f9; font-weight: 700; }
          h1 { font-size: 18px; margin-bottom: 6px; color: #0d9488; text-align: center; }
          h2 { font-size: 14px; margin: 16px 0 10px; color: #0d9488; border-bottom: 2px solid #0d9488; padding-bottom: 4px; }
          .header-info { text-align: center; font-size: 12px; color: #64748b; margin-bottom: 20px; }
          .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8; padding-top: 10px; border-top: 1px dashed #cbd5e1; }
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }
        </style>
      </head>
      <body>
        <h1>گزارش ${tabNames[currentTab]}</h1>
        <div class="header-info">بازه: ${rangeText} | تاریخ چاپ: ${Jalali.today()}</div>
        ${content}
        <div class="footer">فینورا پرو - سامانه مدیریت کسب‌وکار</div>
      </body>
      </html>
    `);
    printWin.document.close();
    setTimeout(() => { printWin.focus(); printWin.print(); }, 500);
  }

  _buildPrintContent() {
    const pl = cache.pl || {};
    if (currentTab === 'pl') {
      return `
        <h2>صورت سود و زیان</h2>
        <table>
          <tr><td style="width:60%">فروش ناخالص</td><td>${Formatters.money(pl.grossSales)}</td></tr>
          <tr><td>تخفیف فروش</td><td style="color:#dc2626">- ${Formatters.money(pl.salesDiscounts)}</td></tr>
          <tr><td>برگشت از فروش</td><td style="color:#dc2626">- ${Formatters.money(pl.returnsAmount)}</td></tr>
          <tr style="background:#f1f5f9;font-weight:700"><td>فروش خالص</td><td>${Formatters.money(pl.netSales)}</td></tr>
          <tr><td>بهای تمام‌شده کالای فروش‌رفته</td><td style="color:#d97706">- ${Formatters.money(pl.cogs)}</td></tr>
          <tr style="background:#f1f5f9;font-weight:700"><td>سود ناخالص</td><td style="color:#059669">${Formatters.money(pl.grossProfit)}</td></tr>
          <tr><td>هزینه‌های عملیاتی</td><td style="color:#dc2626">- ${Formatters.money(pl.operatingExpenses)}</td></tr>
          <tr><td>سایر درآمدها</td><td style="color:#059669">+ ${Formatters.money(pl.otherIncome)}</td></tr>
          <tr style="background:#ecfdf5;font-weight:800;font-size:13px"><td>سود (زیان) خالص</td><td style="color:${pl.netProfit >= 0 ? '#059669' : '#dc2626'}">${Formatters.money(pl.netProfit)}</td></tr>
        </table>
        <h2>شاخص‌ها</h2>
        <table>
          <tr><td>حاشیه سود ناخالص</td><td>${Formatters.percent(pl.grossMargin)}</td></tr>
          <tr><td>حاشیه سود خالص</td><td>${Formatters.percent(pl.netMargin)}</td></tr>
          <tr><td>تعداد فاکتور فروش</td><td>${Formatters.number(pl.invoiceCount)}</td></tr>
        </table>
      `;
    }

    if (currentTab === 'products') {
      const list = cache.products || [];
      return `
        <h2>سودآوری کالاها (${Formatters.number(list.length)} کالا)</h2>
        <table>
          <thead><tr><th>#</th><th>نام کالا</th><th>تعداد</th><th>فروش کل</th><th>بهای تمام‌شده</th><th>سود خالص</th><th>حاشیه سود</th></tr></thead>
          <tbody>
            ${list.map((p, i) => `
              <tr>
                <td>${Formatters.toPersianDigits(i + 1)}</td>
                <td>${this._esc(p.productName)}</td>
                <td>${Formatters.number(p.qty)}</td>
                <td>${Formatters.money(p.totalSales)}</td>
                <td>${Formatters.money(p.cogs)}</td>
                <td>${Formatters.money(p.profit)}</td>
                <td>${Formatters.percent(p.margin)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    if (currentTab === 'customers') {
      const list = cache.customers || [];
      return `
        <h2>گزارش مشتریان (${Formatters.number(list.length)} مشتری)</h2>
        <table>
          <thead><tr><th>#</th><th>نام مشتری</th><th>تعداد فاکتور</th><th>مجموع خرید</th><th>پرداخت‌شده</th><th>مانده</th></tr></thead>
          <tbody>
            ${list.map((c, i) => `
              <tr>
                <td>${Formatters.toPersianDigits(i + 1)}</td>
                <td>${this._esc(c.contactName)}</td>
                <td>${Formatters.number(c.totalInvoices)}</td>
                <td>${Formatters.money(c.totalSales)}</td>
                <td>${Formatters.money(c.totalPaid)}</td>
                <td>${Formatters.money(c.totalRemaining)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    if (currentTab === 'sales') {
      const topP = cache.sales?.topProductsBySales || [];
      const topC = cache.sales?.topCustomers || [];
      return `
        <h2>۱۰ کالای پرفروش</h2>
        <table>
          <thead><tr><th>#</th><th>نام کالا</th><th>تعداد</th><th>مبلغ فروش</th></tr></thead>
          <tbody>
            ${topP.map((p, i) => `
              <tr><td>${Formatters.toPersianDigits(i + 1)}</td><td>${this._esc(p.productName)}</td><td>${Formatters.number(p.qty)}</td><td>${Formatters.money(p.totalSales)}</td></tr>
            `).join('')}
          </tbody>
        </table>
        <h2>۱۰ مشتری برتر</h2>
        <table>
          <thead><tr><th>#</th><th>نام مشتری</th><th>تعداد فاکتور</th><th>مجموع خرید</th></tr></thead>
          <tbody>
            ${topC.map((c, i) => `
              <tr><td>${Formatters.toPersianDigits(i + 1)}</td><td>${this._esc(c.contactName)}</td><td>${Formatters.number(c.invoiceCount)}</td><td>${Formatters.money(c.totalSales)}</td></tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    return '';
  }

  _truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
  }

  _esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

export const ReportsView = new ReportsViewImpl();
window.ReportsView = ReportsView;