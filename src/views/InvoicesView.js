// ============================================================
// InvoicesView — لیست و مدیریت فاکتورها
// ============================================================

import { InvoiceController } from '../controllers/InvoiceController.js';
import { InvoiceFormView } from './InvoiceFormView.js';
import { Modal } from '../core/Modal.js';
import { Toast } from '../core/Toast.js';
import { Formatters } from '../utils/Formatters.js';

let filter = {
  search: '',
  kind: '',
  preInvoice: '',
  paymentStatus: ''
};
let cache = { invoices: [] };

class InvoicesViewImpl {
  async render() {
    await this.reload();
    return `
      <div class="page-title">
        <h2>فاکتورها</h2>
        <p>مدیریت فاکتورهای فروش، خرید، برگشت و پیش‌فاکتورها</p>
      </div>

      <div class="toolbar">
        <div class="search-input-wrap">
          <span class="icon">🔍</span>
          <input type="text" class="form-control" id="invSearch" placeholder="جستجو بر اساس شماره، طرف حساب یا توضیحات..." value="${this._esc(filter.search)}" oninput="window.InvoicesView._onSearch(this.value)" />
        </div>
        <select class="form-control" style="width:auto;min-width:140px" onchange="window.InvoicesView._onFilter('kind', this.value)">
          <option value="">همه انواع</option>
          <option value="sale" ${filter.kind === 'sale' ? 'selected' : ''}>فروش</option>
          <option value="purchase" ${filter.kind === 'purchase' ? 'selected' : ''}>خرید</option>
          <option value="sale_return" ${filter.kind === 'sale_return' ? 'selected' : ''}>برگشت از فروش</option>
          <option value="purchase_return" ${filter.kind === 'purchase_return' ? 'selected' : ''}>برگشت از خرید</option>
          <option value="non_formal" ${filter.kind === 'non_formal' ? 'selected' : ''}>غیررسمی</option>
        </select>
        <select class="form-control" style="width:auto;min-width:130px" onchange="window.InvoicesView._onFilter('paymentStatus', this.value)">
          <option value="">همه وضعیت‌ها</option>
          <option value="paid" ${filter.paymentStatus === 'paid' ? 'selected' : ''}>تسویه‌شده</option>
          <option value="partial" ${filter.paymentStatus === 'partial' ? 'selected' : ''}>پرداخت جزئی</option>
          <option value="unpaid" ${filter.paymentStatus === 'unpaid' ? 'selected' : ''}>پرداخت‌نشده</option>
        </select>
        <button class="btn btn-secondary" onclick="window.InvoicesView._togglePreInvoice()">
          ${filter.preInvoice === true ? '📄 فقط پیش‌فاکتور' : '📄 نمایش پیش‌فاکتورها'}
        </button>
        <button class="btn" onclick="window.InvoicesView.openNewInvoice()">➕ فاکتور جدید</button>
      </div>

      <div id="invoices-content">${this.renderTable()}</div>
    `;
  }

  onMount() {
    window.InvoicesView = this;
  }

  async reload() {
    cache.invoices = await InvoiceController.getAll({
      search: filter.search,
      kind: filter.kind,
      paymentStatus: filter.paymentStatus,
      preInvoice: filter.preInvoice === true ? true : ''
    });
  }

  async reloadAndRender() {
    await this.reload();
    const el = document.getElementById('invoices-content');
    if (el) el.innerHTML = this.renderTable();
  }

  renderTable() {
    if (cache.invoices.length === 0) {
      return `
        <div class="table-wrap">
          <table><tbody>
            <tr><td>
              <div class="empty-state">
                <div class="icon">🧾</div>
                <h3>هیچ فاکتوری یافت نشد</h3>
                <p>اولین فاکتور خود را صادر کنید</p>
                <button class="btn" onclick="window.InvoicesView.openNewInvoice()">➕ فاکتور جدید</button>
              </div>
            </td></tr>
          </tbody></table>
        </div>`;
    }

    const rows = cache.invoices.map(inv => {
      const statusBadge = inv.status === 'paid'
        ? '<span class="badge badge-success">تسویه‌شده</span>'
        : inv.status === 'partial'
        ? '<span class="badge badge-warning">پرداخت جزئی</span>'
        : '<span class="badge badge-danger">پرداخت‌نشده</span>';

      const kindLabels = {
        sale: { label: 'فروش', cls: 'badge-success' },
        purchase: { label: 'خرید', cls: 'badge-warning' },
        sale_return: { label: 'برگشت فروش', cls: 'badge-danger' },
        purchase_return: { label: 'برگشت خرید', cls: 'badge-danger' },
        non_formal: { label: 'غیررسمی', cls: 'badge-muted' }
      };
      const k = kindLabels[inv.kind] || { label: inv.kind, cls: 'badge-muted' };
      const preBadge = inv.isPreInvoice ? ' <span class="badge badge-warning" style="font-size:10px">پیش‌فاکتور</span>' : '';

      return `
        <tr>
          <td>
            <strong style="font-size:13.5px">#${Formatters.toPersianDigits(inv.number || '—')}</strong>
            ${preBadge}
          </td>
          <td>
            <span class="badge ${k.cls}">${k.label}</span>
          </td>
          <td>${this._esc(inv.contactName || '—')}</td>
          <td>${Formatters.toPersianDigits(inv.date || '—')}</td>
          <td style="font-weight:600">${Formatters.money(inv.grandTotal)}</td>
          <td>${Formatters.money(inv.paidAmount || 0)}</td>
          <td style="color:${inv.remaining > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600">
            ${Formatters.money(inv.remaining || 0)}
          </td>
          <td>${statusBadge}</td>
          <td>
            <div class="row-actions">
              <button class="icon-btn-sm" title="چاپ" onclick="window.InvoicesView.printInvoice('${inv.id}')">🖨️</button>
              <button class="icon-btn-sm" title="ویرایش" onclick="window.InvoicesView.editInvoice('${inv.id}')">✏️</button>
              ${inv.isPreInvoice ? `<button class="icon-btn-sm" title="تبدیل به فاکتور" onclick="window.InvoicesView.convertPreInvoice('${inv.id}')">✅</button>` : ''}
              <button class="icon-btn-sm danger" title="حذف" onclick="window.InvoicesView.deleteInvoice('${inv.id}')">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // خلاصه
    const totalGrand = cache.invoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0);
    const totalRemaining = cache.invoices.reduce((s, i) => s + (Number(i.remaining) || 0), 0);

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:120px">شماره</th>
              <th style="width:110px">نوع</th>
              <th>طرف حساب</th>
              <th style="width:100px">تاریخ</th>
              <th style="width:130px">مبلغ کل</th>
              <th style="width:120px">پرداخت‌شده</th>
              <th style="width:120px">باقیمانده</th>
              <th style="width:120px">وضعیت</th>
              <th style="width:140px">عملیات</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="background:var(--bg);font-weight:700">
              <td colspan="4" style="text-align:left">جمع کل:</td>
              <td>${Formatters.money(totalGrand)}</td>
              <td colspan="2" style="color:var(--danger)">${Formatters.money(totalRemaining)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  _onSearch(val) {
    filter.search = val;
    this.reload().then(() => {
      document.getElementById('invoices-content').innerHTML = this.renderTable();
      const input = document.getElementById('invSearch');
      if (input) { input.focus(); input.setSelectionRange(val.length, val.length); }
    });
  }

  _onFilter(key, val) {
    filter[key] = val;
    this.reloadAndRender();
  }

  _togglePreInvoice() {
    filter.preInvoice = filter.preInvoice === true ? '' : true;
    this.reloadAndRender().then(() => {
      // به‌روزرسانی دکمه
      const btns = document.querySelectorAll('.toolbar .btn');
      btns.forEach(b => {
        if (b.textContent.includes('پیش‌فاکتور')) {
          b.textContent = filter.preInvoice === true ? '📄 فقط پیش‌فاکتور' : '📄 نمایش پیش‌فاکتورها';
        }
      });
    });
  }

  // ============================================================
  // عملیات
  // ============================================================
  openNewInvoice() {
    InvoiceFormView.open(null);
  }

  async editInvoice(id) {
    InvoiceFormView.open(id);
  }

  async printInvoice(id) {
    const { InvoicePrint } = await import('../utils/InvoicePrint.js');
    InvoicePrint.openSettings(id);
  }

  async deleteInvoice(id) {
    const inv = cache.invoices.find(i => i.id === id);
    Modal.confirm({
      title: 'حذف فاکتور',
      message: `آیا از حذف فاکتور #${inv?.number || ''} مطمئن هستید؟ حرکات انبار مرتبط هم حذف می‌شوند.`,
      confirmText: 'حذف',
      danger: true,
      onConfirm: async () => {
        try {
          await InvoiceController.delete(id);
          Toast.success('فاکتور حذف شد');
          await this.reloadAndRender();
        } catch (err) {
          Toast.error('خطا: ' + err.message);
        }
      }
    });
  }

  async convertPreInvoice(id) {
    Modal.confirm({
      title: 'تبدیل پیش‌فاکتور',
      message: 'آیا می‌خواهید این پیش‌فاکتور به فاکتور قطعی تبدیل شود؟ شماره‌ی رسمی صادر شده و حرکات انبار ثبت می‌شوند.',
      confirmText: 'تبدیل کن',
      onConfirm: async () => {
        try {
          const inv = await InvoiceController.convertPreInvoice(id);
          Toast.success(`پیش‌فاکتور به فاکتور #${inv.number} تبدیل شد`);
          await this.reloadAndRender();
        } catch (err) {
          Toast.error('خطا: ' + err.message);
        }
      }
    });
  }

  _esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

export const InvoicesView = new InvoicesViewImpl();