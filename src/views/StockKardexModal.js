// ============================================================
// StockKardexModal — مودال کاردکس کالا و اصلاح موجودی
// ============================================================

import { ProductController } from '../controllers/ProductController.js';
import { Modal } from '../core/Modal.js';
import { Toast } from '../core/Toast.js';
import { Formatters } from '../utils/Formatters.js';
import { NumberInput } from '../utils/NumberInput.js';
import { Jalali } from '../utils/Jalali.js';

class StockKardexModalImpl {
  /**
   * باز کردن مودال کاردکس برای یک کالا
   */
  async open(productId) {
    const product = await ProductController.getProduct(productId);
    if (!product) { Toast.error('کالا یافت نشد'); return; }

    const kardex = await ProductController.getKardex(productId);

    const body = this._buildBody(product, kardex);
    const footer = this._buildFooter(product);

    Modal.open({
      title: `📊 کاردکس کالا: ${product.name}`,
      body,
      footer,
      size: 'lg'
    });

    window.__kardexProductId = productId;
  }

  _buildBody(product, kardex) {
    const isService = product.trackInventory === false;
    const minStock = Number(product.minStock) || 0;
    const currentStock = kardex.finalBalance;
    const isLow = !isService && currentStock <= minStock && currentStock > 0;
    const isOut = !isService && currentStock <= 0;

    let statusBadge = '';
    if (isService) statusBadge = '<span class="badge badge-muted">خدمت</span>';
    else if (isOut) statusBadge = '<span class="badge badge-danger">تمام‌شده</span>';
    else if (isLow) statusBadge = '<span class="badge badge-warning">کم‌موجود</span>';
    else statusBadge = '<span class="badge badge-success">موجود</span>';

    const rowsHtml = kardex.rows.length === 0
      ? `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">
          <div style="font-size:40px;margin-bottom:8px;opacity:.4">📭</div>
          هیچ حرکتی برای این کالا ثبت نشده
        </td></tr>`
      : [...kardex.rows].reverse().map(r => {
          const typeInfo = {
            in: { label: '📥 ورود', cls: 'badge-success', color: 'var(--success)' },
            out: { label: '📤 خروج', cls: 'badge-danger', color: 'var(--danger)' },
            adjust: { label: '⚙️ اصلاح', cls: 'badge-warning', color: 'var(--warning)' }
          }[r.type] || { label: r.type, cls: 'badge-muted', color: 'var(--text-muted)' };

          const isIn = r.type === 'in';
          const isOut = r.type === 'out';
          const isAdjust = r.type === 'adjust';

          const refLabel = this._refLabel(r.refType, r.refId);

          return `
            <tr>
              <td style="width:110px;font-size:11.5px">${this._formatDate(r.date)}</td>
              <td><span class="badge ${typeInfo.cls}">${typeInfo.label}</span></td>
              <td style="width:80px;text-align:center;font-weight:700;color:var(--success)">
                ${isIn ? Formatters.number(r.qty) : '—'}
              </td>
              <td style="width:80px;text-align:center;font-weight:700;color:var(--danger)">
                ${isOut ? Formatters.number(r.qty) : '—'}
              </td>
              <td style="width:100px;text-align:center;font-weight:800;color:${r.balance > 0 ? 'var(--primary)' : 'var(--text-muted)'}">
                ${Formatters.number(r.balance)}
              </td>
              <td style="width:140px;font-size:11.5px;color:var(--text-muted)">
                ${refLabel}
              </td>
              <td style="font-size:11.5px;color:var(--text-muted)">
                ${this._esc(r.note || '—')}
              </td>
            </tr>
          `;
        }).join('');

    return `
      <div class="grid-kpi" style="margin-bottom:14px">
        <div class="card" style="margin:0;padding:12px 14px;border-top:3px solid var(--primary)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">موجودی فعلی</div>
          <div style="font-size:18px;font-weight:800;color:${isOut ? 'var(--danger)' : isLow ? 'var(--warning)' : 'var(--success)'}">
            ${isService ? '—' : Formatters.number(currentStock)}
            <span style="font-size:11px;font-weight:500;color:var(--text-muted)">${product.unit || 'عدد'}</span>
          </div>
          <div style="margin-top:4px">${statusBadge}</div>
        </div>

        <div class="card" style="margin:0;padding:12px 14px;border-top:3px solid var(--success)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">جمع ورودی‌ها</div>
          <div style="font-size:16px;font-weight:800;color:var(--success)">${Formatters.number(kardex.totalIn)}</div>
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px">${product.unit || 'عدد'}</div>
        </div>

        <div class="card" style="margin:0;padding:12px 14px;border-top:3px solid var(--danger)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">جمع خروجی‌ها</div>
          <div style="font-size:16px;font-weight:800;color:var(--danger)">${Formatters.number(kardex.totalOut)}</div>
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px">${product.unit || 'عدد'}</div>
        </div>

        <div class="card" style="margin:0;padding:12px 14px;border-top:3px solid var(--warning)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">نقطه سفارش</div>
          <div style="font-size:16px;font-weight:800;color:var(--warning)">${Formatters.number(minStock)}</div>
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px">${product.unit || 'عدد'}</div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div style="font-size:12.5px;color:var(--text-muted)">
          ریز حرکات انبار (${Formatters.toPersianDigits(kardex.rows.length)} مورد)
        </div>
        <button class="btn btn-secondary btn-inline" style="font-size:12px;min-height:34px;padding:4px 12px" onclick="window.StockKardexModal.openAdjustModal('${product.id}')">
          ⚙️ اصلاح دستی موجودی
        </button>
      </div>

      <div class="table-wrap" style="max-height:400px;overflow-y:auto">
        <table style="min-width:700px">
          <thead style="position:sticky;top:0;z-index:2">
            <tr>
              <th>تاریخ</th>
              <th style="width:90px">نوع</th>
              <th style="width:80px;text-align:center">ورودی</th>
              <th style="width:80px;text-align:center">خروجی</th>
              <th style="width:100px;text-align:center">موجودی</th>
              <th style="width:140px">مرجع</th>
              <th>یادداشت</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  _buildFooter(product) {
    return `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">بستن</button>
      <button class="btn" onclick="window.StockKardexModal._printKardex('${product.id}')">🖨️ چاپ کاردکس</button>
    `;
  }

  // ============================================================
  // فرم اصلاح موجودی
  // ============================================================
  async openAdjustModal(productId) {
    const product = await ProductController.getProduct(productId);
    if (!product) return;
    const currentStock = await ProductController.getStock(productId);

    const body = `
      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:12.5px;color:#78350f;line-height:1.7">
        ⚠️ <strong>توجه:</strong> این کار برای اصلاح موجودی انبار استفاده می‌شه — مثلاً وقتی که انبارگردانی کردی و موجودی واقعی با سیستم فرق داره.
        <br>
        موجودی ثبت‌شده در سیستم: <strong>${Formatters.number(currentStock)} ${this._esc(product.unit || 'عدد')}</strong>
      </div>

      <div class="form-group">
        <label class="form-label">موجودی واقعی جدید <span class="req">*</span></label>
        <input type="text" inputmode="numeric" class="form-control" id="adjQty" value="${NumberInput.format(currentStock)}" />
        <small style="color:var(--text-muted);font-size:11.5px;display:block;margin-top:4px">
          عددی که اینجا وارد می‌کنی، به‌عنوان موجودی نهایی تنظیم می‌شه.
        </small>
      </div>

      <div class="form-group">
        <label class="form-label">دلیل / یادداشت</label>
        <textarea class="form-control" id="adjNote" rows="2" placeholder="مثلاً: انبارگردانی پایان ماه، مغایرت در شمارش"></textarea>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn btn-warning" onclick="window.StockKardexModal.saveAdjust('${productId}')">⚙️ ثبت اصلاح</button>
    `;

    Modal.open({ title: '⚙️ اصلاح دستی موجودی', body, footer, size: 'sm' });
  }

  async saveAdjust(productId) {
    const newQty = NumberInput.parse(document.getElementById('adjQty').value);
    const note = (document.getElementById('adjNote').value || '').trim();

    if (isNaN(newQty) || newQty < 0) {
      Toast.warning('موجودی معتبر نیست');
      return;
    }

    try {
      await ProductController.addStockMovement(
        productId,
        'adjust',
        newQty,
        'manual',
        null,
        note || 'اصلاح دستی موجودی'
      );

      Toast.success('موجودی اصلاح شد');

      // بستن و باز کردن مجدد کاردکس
      Modal.close();
      setTimeout(() => this.open(productId), 300);

      // رفرش جدول کالاها اگه بازه
      if (window.ProductsView && window.ProductsView.reload) {
        window.ProductsView.reload().then(() => {
          const el = document.getElementById('products-tab-content');
          if (el && window.ProductsView.renderTabContent) {
            el.innerHTML = window.ProductsView.renderTabContent();
          }
        });
      }
    } catch (err) {
      console.error(err);
      Toast.error('خطا: ' + err.message);
    }
  }

  // ============================================================
  // چاپ کاردکس
  // ============================================================
  async _printKardex(productId) {
    const product = await ProductController.getProduct(productId);
    if (!product) return;
    const kardex = await ProductController.getKardex(productId);

    const rowsHtml = [...kardex.rows].reverse().map(r => {
      const isIn = r.type === 'in';
      const isOut = r.type === 'out';
      const typeLabel = isIn ? 'ورود' : isOut ? 'خروج' : 'اصلاح';
      return `
        <tr>
          <td>${this._formatDate(r.date)}</td>
          <td>${typeLabel}</td>
          <td>${isIn ? Formatters.number(r.qty) : '—'}</td>
          <td>${isOut ? Formatters.number(r.qty) : '—'}</td>
          <td>${Formatters.number(r.balance)}</td>
          <td>${this._refLabel(r.refType, r.refId)}</td>
          <td>${this._esc(r.note || '')}</td>
        </tr>
      `;
    }).join('');

    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) { Toast.error('پاپ‌آپ را فعال کنید'); return; }

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>کاردکس ${product.name}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/misc/Farsi-Digits/Vazirmatn-FD-font-face.css" />
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { direction: rtl; text-align: right; font-family: 'Vazirmatn FD', Tahoma, sans-serif; background: #fff; color: #000; }
          body { padding: 10px; }
          h1 { font-size: 18px; color: #0d9488; text-align: center; margin-bottom: 6px; }
          .info { text-align: center; font-size: 12px; color: #64748b; margin-bottom: 16px; }
          .summary { display: flex; gap: 10px; margin-bottom: 16px; }
          .summary > div { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; text-align: center; }
          .summary .val { font-size: 18px; font-weight: 800; color: #0d9488; margin-top: 4px; }
          .summary .lbl { font-size: 11px; color: #64748b; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 7px 9px; border: 1px solid #cbd5e1; text-align: right; font-size: 11.5px; }
          th { background: #f1f5f9; font-weight: 700; }
          .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #94a3b8; padding-top: 10px; border-top: 1px dashed #cbd5e1; }
        </style>
      </head>
      <body>
        <h1>کاردکس کالا</h1>
        <div class="info">
          ${this._esc(product.name)}${product.code ? ' - کد: ' + Formatters.toPersianDigits(product.code) : ''} | تاریخ چاپ: ${Jalali.today()}
        </div>
        <div class="summary">
          <div>
            <div class="lbl">موجودی فعلی</div>
            <div class="val">${Formatters.number(kardex.finalBalance)}</div>
          </div>
          <div>
            <div class="lbl">جمع ورودی</div>
            <div class="val" style="color: #059669">${Formatters.number(kardex.totalIn)}</div>
          </div>
          <div>
            <div class="lbl">جمع خروجی</div>
            <div class="val" style="color: #dc2626">${Formatters.number(kardex.totalOut)}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>نوع</th>
              <th>ورودی</th>
              <th>خروجی</th>
              <th>موجودی</th>
              <th>مرجع</th>
              <th>یادداشت</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="footer">فینورا پرو - سامانه مدیریت کسب‌وکار</div>
      </body>
      </html>
    `);
    printWin.document.close();
    setTimeout(() => { printWin.focus(); printWin.print(); }, 500);
  }

  // ============================================================
  // Helpers
  // ============================================================
  _formatDate(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      const jalali = Jalali.fromDate(d);
      const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return Formatters.toPersianDigits(`${jalali.year}/${String(jalali.month).padStart(2, '0')}/${String(jalali.day).padStart(2, '0')} - ${time}`);
    } catch (e) {
      return '—';
    }
  }

  _refLabel(refType, refId) {
    if (!refType || refType === 'manual') return '<span style="color:var(--text-muted)">دستی</span>';
    if (refType === 'invoice') return `فاکتور`;
    if (refType === 'purchase') return `خرید`;
    return refType;
  }

  _esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

export const StockKardexModal = new StockKardexModalImpl();
window.StockKardexModal = StockKardexModal;