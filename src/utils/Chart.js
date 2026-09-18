// ============================================================
// Chart — نمودار SVG سبک بدون کتابخانه خارجی
// ============================================================

import { Formatters } from './Formatters.js';

class ChartImpl {
  /**
   * نمودار خطی
   * @param {Array<{label, value}>} data
   * @param {Object} options
   */
  line(data, options = {}) {
    if (!data || data.length === 0) {
      return this._emptyState('داده‌ای برای نمایش وجود ندارد');
    }

    const width = options.width || 800;
    const height = options.height || 280;
    const padding = { top: 30, right: 30, bottom: 50, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const color = options.color || '#0d9488';
    const fillColor = options.fillColor || 'rgba(13, 148, 136, 0.12)';

    const maxVal = Math.max(...data.map(d => Number(d.value) || 0), 1);
    const stepX = data.length > 1 ? chartWidth / (data.length - 1) : 0;

    // محاسبه نقاط
    const points = data.map((d, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + chartHeight - ((Number(d.value) || 0) / maxVal) * chartHeight;
      return { x, y, label: d.label, value: Number(d.value) || 0 };
    });

    // مسیر خط
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    // مسیر پرشده (زیر خط)
    const fillPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padding.top + chartHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padding.top + chartHeight).toFixed(1)} Z`;

    // خطوط گرید افقی
    const gridLines = [];
    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const y = padding.top + (chartHeight / ySteps) * i;
      const val = maxVal * (1 - i / ySteps);
      gridLines.push(`
        <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3,3" stroke-width="1"/>
        <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${Formatters.toPersianDigits(this._shortNum(val))}</text>
      `);
    }

    // نقاط و لیبل‌های محور X
    const xLabels = points.map((p, i) => {
      // فقط هر چند تا یک لیبل (برای جلوگیری از شلوغی)
      const showEvery = Math.ceil(data.length / 10);
      if (i % showEvery !== 0 && i !== data.length - 1) return '';
      return `<text x="${p.x}" y="${height - padding.bottom + 18}" text-anchor="middle" font-size="9.5" fill="#64748b">${this._esc(p.label)}</text>`;
    }).join('');

    // نقاط دایره‌ای
    const dots = points.map(p => `
      <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#fff" stroke="${color}" stroke-width="2">
        <title>${this._esc(p.label)}: ${Formatters.number(p.value)}</title>
      </circle>
    `).join('');

    return `
      <div style="width:100%;overflow-x:auto">
        <svg viewBox="0 0 ${width} ${height}" style="width:100%;min-width:600px;height:auto;display:block" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </linearGradient>
          </defs>
          ${gridLines.join('')}
          <path d="${fillPath}" fill="url(#lineGradient)"/>
          <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
          ${dots}
          ${xLabels}
        </svg>
      </div>
    `;
  }

  /**
   * نمودار ستونی (Bar)
   * @param {Array<{label, income, expense}>} data
   */
  bars(data, options = {}) {
    if (!data || data.length === 0) {
      return this._emptyState('داده‌ای برای نمایش وجود ندارد');
    }

    const width = options.width || 800;
    const height = options.height || 280;
    const padding = { top: 30, right: 30, bottom: 50, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const incomeColor = options.incomeColor || '#059669';
    const expenseColor = options.expenseColor || '#dc2626';

    const allVals = [];
    data.forEach(d => {
      allVals.push(Number(d.income) || 0);
      allVals.push(Number(d.expense) || 0);
    });
    const maxVal = Math.max(...allVals, 1);

    const groupWidth = chartWidth / data.length;
    const barGap = 3;
    const barWidth = Math.max(4, (groupWidth - barGap * 3) / 2);

    // Grid خطوط
    const gridLines = [];
    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const y = padding.top + (chartHeight / ySteps) * i;
      const val = maxVal * (1 - i / ySteps);
      gridLines.push(`
        <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3,3" stroke-width="1"/>
        <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${Formatters.toPersianDigits(this._shortNum(val))}</text>
      `);
    }

    // ستون‌ها
    let barsHtml = '';
    let labelsHtml = '';
    data.forEach((d, i) => {
      const groupX = padding.left + i * groupWidth;
      const incomeH = ((Number(d.income) || 0) / maxVal) * chartHeight;
      const expenseH = ((Number(d.expense) || 0) / maxVal) * chartHeight;

      const incomeX = groupX + groupWidth / 2 - barWidth - barGap / 2;
      const expenseX = groupX + groupWidth / 2 + barGap / 2;

      const incomeY = padding.top + chartHeight - incomeH;
      const expenseY = padding.top + chartHeight - expenseH;

      barsHtml += `
        <rect x="${incomeX}" y="${incomeY}" width="${barWidth}" height="${incomeH}" fill="${incomeColor}" rx="2">
          <title>درآمد ${this._esc(d.label)}: ${Formatters.number(d.income || 0)}</title>
        </rect>
        <rect x="${expenseX}" y="${expenseY}" width="${barWidth}" height="${expenseH}" fill="${expenseColor}" rx="2">
          <title>هزینه ${this._esc(d.label)}: ${Formatters.number(d.expense || 0)}</title>
        </rect>
      `;

      labelsHtml += `<text x="${groupX + groupWidth / 2}" y="${height - padding.bottom + 18}" text-anchor="middle" font-size="10" fill="#64748b">${this._esc(d.label)}</text>`;
    });

    return `
      <div style="width:100%;overflow-x:auto">
        <svg viewBox="0 0 ${width} ${height}" style="width:100%;min-width:600px;height:auto;display:block" preserveAspectRatio="xMidYMid meet">
          ${gridLines.join('')}
          ${barsHtml}
          ${labelsHtml}
        </svg>
        <div style="display:flex;justify-content:center;gap:20px;margin-top:8px;font-size:12px;color:var(--text-muted)">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:12px;height:12px;background:${incomeColor};border-radius:3px"></span>
            <span>درآمد</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:12px;height:12px;background:${expenseColor};border-radius:3px"></span>
            <span>هزینه</span>
          </div>
        </div>
      </div>
    `;
  }

  _shortNum(n) {
    n = Math.abs(Math.round(n));
    if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'M';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'K';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  _emptyState(msg) {
    return `
      <div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px">
        <div style="font-size:40px;margin-bottom:8px;opacity:.4">📊</div>
        ${msg}
      </div>
    `;
  }

  _esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

export const Chart = new ChartImpl();
window.Chart = Chart;