// ============================================================
// ChequesView — صفحه‌ی مدیریت چک‌ها
// ============================================================

import { NumberInput } from '../utils/NumberInput.js';
import { ChequeController } from '../controllers/ChequeController.js';
import { ContactController } from '../controllers/ContactController.js';
import { Modal } from '../core/Modal.js';
import { Toast } from '../core/Toast.js';
import { Formatters } from '../utils/Formatters.js';

let filter = { search: '', direction: '', status: '' };
let cache = { cheques: [], contacts: [], stats: {} };

class ChequesViewImpl {
  async render() {
    await this.reload();
    return `
      <div class="page-title">
        <h2>چک‌ها</h2>
        <p>مدیریت چک‌های دریافتی و پرداختی با شماره صیادی</p>
      </div>

      <div class="grid-kpi">
        <div class="card" style="margin:0">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">کل چک‌ها</div>
          <div style="font-size:20px;font-weight:800">${Formatters.number(cache.stats.total || 0)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${Formatters.toPersianDigits(cache.stats.pending || 0)} در جریان</div>
        </div>
        <div class="card" style="margin:0">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">چک‌های دریافتی</div>
          <div style="font-size:18px;font-weight:800;color:var(--success)">${Formatters.money(cache.stats.inboundAmount || 0)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${Formatters.number(cache.stats.inbound || 0)} فقره</div>
        </div>
        <div class="card" style="margin:0">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">چک‌های پرداختی</div>
          <div style="font-size:18px;font-weight:800;color:var(--danger)">${Formatters.money(cache.stats.outboundAmount || 0)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${Formatters.number(cache.stats.outbound || 0)} فقره</div>
        </div>
        <div class="card" style="margin:0">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">مانده در جریان</div>
          <div style="font-size:18px;font-weight:800;color:var(--warning)">${Formatters.money(cache.stats.pendingAmount || 0)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">جمع مبلغ چک‌های باز</div>
        </div>
      </div>

      <div id="cheques-content">${this.renderContent()}</div>
    `;
  }

  onMount() {
    window.ChequesView = this;
  }

  async reload() {
    cache.cheques = await ChequeController.getAll();
    cache.contacts = await ContactController.getAll();
    cache.stats = await ChequeController.getStats();
  }

  renderContent() {
    let list = cache.cheques;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(c =>
        (c.contactName || '').toLowerCase().includes(q) ||
        (c.sayadNumber || '').includes(q) ||
        (c.bankName || '').toLowerCase().includes(q)
      );
    }
    if (filter.direction) list = list.filter(c => c.direction === filter.direction);
    if (filter.status) list = list.filter(c => c.status === filter.status);

    const rows = list.length === 0
      ? `<tr><td colspan="9"><div class="empty-state"><div class="icon">💳</div><h3>هیچ چکی ثبت نشده</h3><p>اولین چک دریافتی یا پرداختی خود را ثبت کنید</p><button class="btn" onclick="window.ChequesView.openChequeModal()">➕ چک جدید</button></div></td></tr>`
      : list.map(c => {
          const today = new Date();
          const due = new Date(c.dueDate ? this._parseJalali(c.dueDate) : new Date());
          const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
          const isOverdue = diffDays < 0 && c.status === 'pending';
          const isSoon = diffDays >= 0 && diffDays <= 7 && c.status === 'pending';

          let dueDisplay = Formatters.toPersianDigits(c.dueDate || '—');
          if (isOverdue) dueDisplay += ` <span class="badge badge-danger" style="font-size:9px">${Formatters.toPersianDigits(Math.abs(diffDays))} روز گذشته</span>`;
          else if (isSoon) dueDisplay += ` <span class="badge badge-warning" style="font-size:9px">${Formatters.toPersianDigits(diffDays)} روز مانده</span>`;

          return `
            <tr>
              <td>
                <span class="badge ${c.direction === 'inbound' ? 'badge-success' : 'badge-danger'}">
                  ${c.direction === 'inbound' ? '📥 دریافتی' : '📤 پرداختی'}
                </span>
              </td>
              <td><strong>${this._esc(c.contactName || '—')}</strong></td>
              <td style="font-family:monospace;font-size:11.5px">${Formatters.toPersianDigits(c.sayadNumber || '—')}</td>
              <td>${this._esc(c.bankName || '—')}</td>
              <td style="font-weight:700">${Formatters.money(c.amount)}</td>
              <td>${dueDisplay}</td>
              <td>${Formatters.toPersianDigits(c.issueDate || '—')}</td>
              <td>
                <span class="badge ${ChequeController.getStatusClass(c.status)}">
                  ${ChequeController.getStatusLabel(c.status)}
                </span>
              </td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn-sm" title="تغییر وضعیت" onclick="window.ChequesView.changeStatus('${c.id}')">🔄</button>
                  <button class="icon-btn-sm" title="ویرایش" onclick="window.ChequesView.editCheque('${c.id}')">✏️</button>
                  <button class="icon-btn-sm danger" title="حذف" onclick="window.ChequesView.deleteCheque('${c.id}')">🗑️</button>
                </div>
              </td>
            </tr>
          `;
        }).join('');

    return `
      <div class="toolbar">
        <div class="search-input-wrap">
          <span class="icon">🔍</span>
          <input type="text" class="form-control" placeholder="جستجو بر اساس طرف حساب، صیادی یا بانک..." value="${this._esc(filter.search)}" oninput="window.ChequesView._onSearch(this.value)" />
        </div>
        <select class="form-control" style="width:auto;min-width:130px" onchange="window.ChequesView._onFilter('direction', this.value)">
          <option value="">همه انواع</option>
          <option value="inbound" ${filter.direction === 'inbound' ? 'selected' : ''}>دریافتی</option>
          <option value="outbound" ${filter.direction === 'outbound' ? 'selected' : ''}>پرداختی</option>
        </select>
        <select class="form-control" style="width:auto;min-width:130px" onchange="window.ChequesView._onFilter('status', this.value)">
          <option value="">همه وضعیت‌ها</option>
          <option value="pending" ${filter.status === 'pending' ? 'selected' : ''}>در جریان</option>
          <option value="cleared" ${filter.status === 'cleared' ? 'selected' : ''}>وصول شده</option>
          <option value="bounced" ${filter.status === 'bounced' ? 'selected' : ''}>برگشتی</option>
          <option value="returned" ${filter.status === 'returned' ? 'selected' : ''}>عودت داده شده</option>
        </select>
        <button class="btn" onclick="window.ChequesView.openChequeModal()">➕ چک جدید</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:110px">نوع</th>
              <th>طرف حساب</th>
              <th style="width:160px">شماره صیادی</th>
              <th style="width:110px">بانک</th>
              <th style="width:140px">مبلغ</th>
              <th style="width:170px">سررسید</th>
              <th style="width:100px">تاریخ صدور</th>
              <th style="width:110px">وضعیت</th>
              <th style="width:130px">عملیات</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  _onSearch(val) {
    filter.search = val;
    document.getElementById('cheques-content').innerHTML = this.renderContent();
    const input = document.querySelector('#cheques-content input[type="text"]');
    if (input) { input.focus(); input.setSelectionRange(val.length, val.length); }
  }

  _onFilter(key, val) {
    filter[key] = val;
    document.getElementById('cheques-content').innerHTML = this.renderContent();
  }

  // ============================================================
  // فرم چک
  // ============================================================
  async openChequeModal(chequeId = null) {
    const cheque = chequeId ? await ChequeController.get(chequeId) : null;
    const isEdit = !!cheque;
    const d = cheque || {
      direction: 'inbound',
      contactId: null,
      sayadNumber: '',
      bankName: '',
      branchName: '',
      accountNumber: '',
      holderName: '',
      amount: 0,
      issueDate: this._todayJalali(),
      dueDate: this._todayJalali(),
      description: ''
    };

    const contactOptions = cache.contacts.map(c =>
      `<option value="${c.id}" ${d.contactId === c.id ? 'selected' : ''}>${this._esc(c.name)}</option>`
    ).join('');

    const body = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">نوع چک <span class="req">*</span></label>
          <select class="form-control" id="chqDirection">
            <option value="inbound" ${d.direction === 'inbound' ? 'selected' : ''}>دریافتی (از مشتری)</option>
            <option value="outbound" ${d.direction === 'outbound' ? 'selected' : ''}>پرداختی (به تامین‌کننده)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">طرف حساب</label>
          <select class="form-control" id="chqContact">
            <option value="">— انتخاب کنید —</option>
            ${contactOptions}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">شماره صیادی (۱۶ رقم) <span class="req">*</span></label>
          <input type="text" class="form-control" id="chqSayad" value="${this._esc(d.sayadNumber)}" maxlength="16" placeholder="۱۶ رقم" />
        </div>
        <div class="form-group">
          <label class="form-label">مبلغ (ریال) <span class="req">*</span></label>
          <input type="text" inputmode="numeric" class="form-control" id="chqAmount" value="${NumberInput.format(d.amount || 0)}" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">بانک</label>
          <input type="text" class="form-control" id="chqBank" value="${this._esc(d.bankName)}" placeholder="مثلاً ملی" />
        </div>
        <div class="form-group">
          <label class="form-label">شعبه</label>
          <input type="text" class="form-control" id="chqBranch" value="${this._esc(d.branchName)}" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">شماره حساب</label>
          <input type="text" class="form-control" id="chqAccount" value="${this._esc(d.accountNumber)}" />
        </div>
        <div class="form-group">
          <label class="form-label">نام صاحب حساب</label>
          <input type="text" class="form-control" id="chqHolder" value="${this._esc(d.holderName)}" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">تاریخ صدور (شمسی)</label>
          <input type="text" class="form-control" id="chqIssueDate" value="${this._esc(d.issueDate)}" placeholder="1405/06/27" />
        </div>
        <div class="form-group">
          <label class="form-label">تاریخ سررسید (شمسی) <span class="req">*</span></label>
          <input type="text" class="form-control" id="chqDueDate" value="${this._esc(d.dueDate)}" placeholder="1405/06/27" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">توضیحات</label>
        <textarea class="form-control" id="chqDescription" rows="2">${this._esc(d.description)}</textarea>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn" onclick="window.ChequesView.saveCheque(${isEdit ? `'${chequeId}'` : 'null'})">💾 ذخیره</button>
    `;

    Modal.open({ title: isEdit ? 'ویرایش چک' : 'چک جدید', body, footer, size: 'md' });
  }

  async saveCheque(id) {
    const contactId = document.getElementById('chqContact').value || null;
    const contact = contactId ? cache.contacts.find(c => c.id === contactId) : null;

    const data = {
      direction: document.getElementById('chqDirection').value,
      contactId,
      contactName: contact?.name || '',
      sayadNumber: document.getElementById('chqSayad').value,
      bankName: document.getElementById('chqBank').value,
      branchName: document.getElementById('chqBranch').value,
      accountNumber: document.getElementById('chqAccount').value,
      holderName: document.getElementById('chqHolder').value,
      amount: NumberInput.parse(document.getElementById('chqAmount').value),
      issueDate: document.getElementById('chqIssueDate').value,
      dueDate: document.getElementById('chqDueDate').value,
      description: document.getElementById('chqDescription').value
    };

    if (!data.sayadNumber.trim()) { Toast.warning('شماره صیادی الزامی است'); return; }
    if (data.amount <= 0) { Toast.warning('مبلغ معتبر نیست'); return; }
    if (!data.dueDate.trim()) { Toast.warning('سررسید الزامی است'); return; }

    try {
      if (id) {
        await ChequeController.update(id, data);
        Toast.success('چک ویرایش شد');
      } else {
        await ChequeController.create(data);
        Toast.success('چک ثبت شد');
      }
      Modal.close();
      await this.reload();
      document.getElementById('cheques-content').innerHTML = this.renderContent();
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  async editCheque(id) {
    await this.openChequeModal(id);
  }

  async changeStatus(id) {
    const cheque = cache.cheques.find(c => c.id === id);
    if (!cheque) return;

    const statuses = [
      { value: 'pending', label: 'در جریان' },
      { value: 'cleared', label: 'وصول شده' },
      { value: 'bounced', label: 'برگشتی' },
      { value: 'returned', label: 'عودت داده شده' },
      { value: 'spent', label: 'خرج شده (به شخص دیگر واگذار شد)' }
    ];

    const body = `
      <p style="font-size:13px;margin-bottom:14px;color:var(--text-muted)">وضعیت فعلی: <strong>${ChequeController.getStatusLabel(cheque.status)}</strong></p>
      <div class="form-group">
        <label class="form-label">وضعیت جدید</label>
        <select class="form-control" id="newStatus">
          ${statuses.map(s => `<option value="${s.value}" ${cheque.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn" onclick="window.ChequesView._applyStatusChange('${id}')">اعمال</button>
    `;
    Modal.open({ title: 'تغییر وضعیت چک', body, footer, size: 'sm' });
  }

  async _applyStatusChange(id) {
    const status = document.getElementById('newStatus').value;
    try {
      await ChequeController.changeStatus(id, status);
      Toast.success('وضعیت چک تغییر کرد');
      Modal.close();
      await this.reload();
      document.getElementById('cheques-content').innerHTML = this.renderContent();
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  async deleteCheque(id) {
    const c = cache.cheques.find(x => x.id === id);
    Modal.confirm({
      title: 'حذف چک',
      message: `آیا از حذف چک ${Formatters.toPersianDigits(c?.sayadNumber || '')} مطمئن هستید؟`,
      confirmText: 'حذف',
      danger: true,
      onConfirm: async () => {
        await ChequeController.delete(id);
        Toast.success('چک حذف شد');
        await this.reload();
        document.getElementById('cheques-content').innerHTML = this.renderContent();
      }
    });
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

  _parseJalali(str) {
    if (!str) return new Date();
    const parts = str.split('/').map(Number);
    if (parts.length !== 3) return new Date();
    const [jy, jm, jd] = parts;
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

export const ChequesView = new ChequesViewImpl();
window.ChequesView = ChequesView;