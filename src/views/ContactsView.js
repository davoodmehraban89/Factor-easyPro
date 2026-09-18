// ============================================================
// ContactsView — صفحه‌ی اشخاص
// ============================================================

import { ContactController } from '../controllers/ContactController.js';
import { Modal } from '../core/Modal.js';
import { Toast } from '../core/Toast.js';
import { Formatters } from '../utils/Formatters.js';
import { ContactLedgerModal } from './ContactLedgerModal.js';

let currentSearch = '';
let currentRoleFilter = 'all';
let currentTypeFilter = 'all';
let currentBalanceFilter = ''; // '' | 'debtor' | 'creditor' | 'settled'
let cache = { contacts: [], balances: {}, tags: [], globalSummary: {} };

class ContactsViewImpl {
  async render() {
    await this.reload();
    return `
      <div class="page-title">
        <h2>اشخاص</h2>
        <p>مدیریت مشتریان، تامین‌کنندگان و طرف‌حساب‌ها</p>
      </div>

      <div class="grid-kpi">
        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--danger)">
          <div class="kpi-card-icon" style="background:#fef2f2;color:var(--danger)">📥</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">کل مطالبات</div>
            <div style="font-size:16px;font-weight:800;color:var(--danger)">${Formatters.money(cache.globalSummary.totalDebt || 0)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${Formatters.number(cache.globalSummary.debtorsCount || 0)} بدهکار</div>
          </div>
        </div>

        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--success)">
          <div class="kpi-card-icon" style="background:#ecfdf5;color:var(--success)">📤</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">کل بدهی ما</div>
            <div style="font-size:16px;font-weight:800;color:var(--success)">${Formatters.money(cache.globalSummary.totalCredit || 0)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${Formatters.number(cache.globalSummary.creditorsCount || 0)} بستانکار</div>
          </div>
        </div>

        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--primary)">
          <div class="kpi-card-icon" style="background:#eff6ff;color:var(--primary)">👥</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">تعداد اشخاص</div>
            <div style="font-size:16px;font-weight:800;color:var(--primary)">${Formatters.number(cache.contacts.length)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">ثبت‌شده در سیستم</div>
          </div>
        </div>
      </div>

      <div class="toolbar">
        <div class="search-input-wrap">
          <span class="icon">🔍</span>
          <input type="text" class="form-control" id="contactSearch" placeholder="جستجو بر اساس نام، تلفن یا کد ملی..." value="${this._esc(currentSearch)}" oninput="window.ContactsView._onSearch(this.value)" />
        </div>
        <select class="form-control" style="width:auto;min-width:130px" id="roleFilter" onchange="window.ContactsView._onFilterRole(this.value)">
          <option value="all" ${currentRoleFilter === 'all' ? 'selected' : ''}>همه نقش‌ها</option>
          <option value="customer" ${currentRoleFilter === 'customer' ? 'selected' : ''}>مشتری</option>
          <option value="supplier" ${currentRoleFilter === 'supplier' ? 'selected' : ''}>تامین‌کننده</option>
          <option value="both" ${currentRoleFilter === 'both' ? 'selected' : ''}>هر دو</option>
        </select>
        <select class="form-control" style="width:auto;min-width:120px" id="typeFilter" onchange="window.ContactsView._onFilterType(this.value)">
          <option value="all" ${currentTypeFilter === 'all' ? 'selected' : ''}>همه انواع</option>
          <option value="natural" ${currentTypeFilter === 'natural' ? 'selected' : ''}>حقیقی</option>
          <option value="legal" ${currentTypeFilter === 'legal' ? 'selected' : ''}>حقوقی</option>
        </select>
        <select class="form-control" style="width:auto;min-width:140px" onchange="window.ContactsView._onFilterBalance(this.value)">
          <option value="" ${currentBalanceFilter === '' ? 'selected' : ''}>همه مانده‌ها</option>
          <option value="debtor" ${currentBalanceFilter === 'debtor' ? 'selected' : ''}>فقط بدهکاران</option>
          <option value="creditor" ${currentBalanceFilter === 'creditor' ? 'selected' : ''}>فقط بستانکاران</option>
          <option value="settled" ${currentBalanceFilter === 'settled' ? 'selected' : ''}>تسویه‌شده</option>
        </select>
        <button class="btn" onclick="window.ContactsView.openContactModal()">➕ شخص جدید</button>
      </div>

      <div id="contacts-content">${this.renderTable()}</div>
    `;
  }

  onMount() {
    window.ContactsView = this;
  }

  async reload() {
    cache.contacts = await ContactController.getAll();
    cache.tags = await ContactController.getAllTags();
    const ids = cache.contacts.map(c => c.id);
    cache.balances = await ContactController.getBalanceMap(ids);
    cache.globalSummary = await ContactController.getGlobalSummary();
  }

  renderTable() {
    let list = cache.contacts;

    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.mobile || '').includes(q) ||
        (c.phone || '').includes(q) ||
        (c.nationalId || '').includes(q)
      );
    }
    if (currentRoleFilter !== 'all') {
      list = list.filter(c => c.role === currentRoleFilter || c.role === 'both');
    }
    if (currentTypeFilter !== 'all') {
      list = list.filter(c => c.entityType === currentTypeFilter);
    }
    if (currentBalanceFilter) {
      list = list.filter(c => {
        const b = cache.balances[c.id] || 0;
        if (currentBalanceFilter === 'debtor') return b > 0;
        if (currentBalanceFilter === 'creditor') return b < 0;
        if (currentBalanceFilter === 'settled') return b === 0;
        return true;
      });
    }

    if (list.length === 0) {
      return `
        <div class="table-wrap">
          <table><tbody>
            <tr><td>
              <div class="empty-state">
                <div class="icon">👥</div>
                <h3>هیچ شخصی یافت نشد</h3>
                <p>${currentSearch || currentRoleFilter !== 'all' || currentTypeFilter !== 'all' || currentBalanceFilter ? 'فیلترها را تغییر بده یا شخص جدید اضافه کن' : 'اولین مشتری یا تامین‌کننده‌ی خود را اضافه کنید'}</p>
                <button class="btn" onclick="window.ContactsView.openContactModal()">➕ شخص جدید</button>
              </div>
            </td></tr>
          </tbody></table>
        </div>`;
    }

    const rows = list.map(c => {
      const balance = cache.balances[c.id] || 0;
      const isDebtor = balance > 0;
      const isCreditor = balance < 0;
      const balanceColor = isDebtor ? 'var(--danger)' : isCreditor ? 'var(--success)' : 'var(--text-muted)';
      const balanceText = balance === 0 ? 'تسویه' :
                         isDebtor ? Formatters.money(Math.abs(balance)) + ' بدهکار' :
                         Formatters.money(Math.abs(balance)) + ' بستانکار';

      const roleLabel = c.role === 'customer' ? 'مشتری' :
                       c.role === 'supplier' ? 'تامین‌کننده' : 'هر دو';
      const roleClass = c.role === 'customer' ? 'badge-success' :
                       c.role === 'supplier' ? 'badge-warning' : 'badge-muted';

      const tags = (c.tags || []).map(t => `<span class="badge badge-muted" style="font-size:10px;margin-left:4px">${this._esc(t)}</span>`).join('');

      return `
        <tr>
          <td>
            <div style="font-weight:600;margin-bottom:2px">${this._esc(c.name)}</div>
            ${tags}
          </td>
          <td>
            <span class="badge ${c.entityType === 'legal' ? 'badge-warning' : 'badge-success'}">
              ${c.entityType === 'legal' ? 'حقوقی' : 'حقیقی'}
            </span>
          </td>
          <td><span class="badge ${roleClass}">${roleLabel}</span></td>
          <td>
            ${c.mobile ? `<div>${Formatters.phone(c.mobile)}</div>` : ''}
            ${c.phone ? `<small style="color:var(--text-muted)">${Formatters.phone(c.phone)}</small>` : ''}
            ${!c.mobile && !c.phone ? '—' : ''}
          </td>
          <td>${c.nationalId ? Formatters.toPersianDigits(c.nationalId) : '—'}</td>
          <td style="font-weight:600;color:${balanceColor}">${balanceText}</td>
          <td>
            <div class="row-actions">
              <button class="icon-btn-sm" title="کارت حساب" onclick="window.ContactsView.openLedger('${c.id}')">📒</button>
              <button class="icon-btn-sm" title="ویرایش" onclick="window.ContactsView.editContact('${c.id}')">✏️</button>
              <button class="icon-btn-sm danger" title="حذف" onclick="window.ContactsView.deleteContact('${c.id}')">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>نام</th>
              <th style="width:80px">نوع</th>
              <th style="width:110px">نقش</th>
              <th style="width:150px">تماس</th>
              <th style="width:130px">شناسه / کد ملی</th>
              <th style="width:180px">مانده حساب</th>
              <th style="width:130px">عملیات</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  _onSearch(val) {
    currentSearch = val;
    document.getElementById('contacts-content').innerHTML = this.renderTable();
    const input = document.getElementById('contactSearch');
    if (input) { input.focus(); input.setSelectionRange(val.length, val.length); }
  }

  _onFilterRole(val) {
    currentRoleFilter = val;
    document.getElementById('contacts-content').innerHTML = this.renderTable();
  }

  _onFilterType(val) {
    currentTypeFilter = val;
    document.getElementById('contacts-content').innerHTML = this.renderTable();
  }

  _onFilterBalance(val) {
    currentBalanceFilter = val;
    document.getElementById('contacts-content').innerHTML = this.renderTable();
  }

  // ============================================================
  // کارت حساب
  // ============================================================
  openLedger(contactId) {
    ContactLedgerModal.open(contactId);
  }

  // ============================================================
  // فرم شخص
  // ============================================================
  async openContactModal(contactId = null) {
    const contact = contactId ? await ContactController.get(contactId) : null;
    const isEdit = !!contact;
    const data = contact || {
      entityType: 'natural', role: 'customer', prefix: '',
      name: '', mobile: '', phone: '', nationalId: '',
      economicCode: '', regNumber: '', postalCode: '',
      address: '', tags: [], note: ''
    };

    const tagsChips = cache.tags.map(t => {
      const checked = (data.tags || []).includes(t);
      return `<label style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--bg);border:1px solid var(--border);border-radius:20px;font-size:12px;cursor:pointer;margin:3px">
        <input type="checkbox" class="tagCheckbox" value="${this._esc(t)}" ${checked ? 'checked' : ''} />
        ${this._esc(t)}
      </label>`;
    }).join('');

    const body = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">نوع شخص <span class="req">*</span></label>
          <select class="form-control" id="cEntityType" onchange="window.ContactsView._toggleEntityFields(this.value)">
            <option value="natural" ${data.entityType === 'natural' ? 'selected' : ''}>شخص حقیقی</option>
            <option value="legal" ${data.entityType === 'legal' ? 'selected' : ''}>شخص حقوقی</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">نقش <span class="req">*</span></label>
          <select class="form-control" id="cRole">
            <option value="customer" ${data.role === 'customer' ? 'selected' : ''}>مشتری</option>
            <option value="supplier" ${data.role === 'supplier' ? 'selected' : ''}>تامین‌کننده</option>
            <option value="both" ${data.role === 'both' ? 'selected' : ''}>هر دو</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group" id="prefixField" style="display:${data.entityType === 'natural' ? 'block' : 'none'}">
          <label class="form-label">پیشوند</label>
          <select class="form-control" id="cPrefix">
            <option value="" ${!data.prefix ? 'selected' : ''}>— بدون پیشوند —</option>
            <option value="آقای" ${data.prefix === 'آقای' ? 'selected' : ''}>آقای</option>
            <option value="خانم" ${data.prefix === 'خانم' ? 'selected' : ''}>خانم</option>
            <option value="فروشگاه" ${data.prefix === 'فروشگاه' ? 'selected' : ''}>فروشگاه</option>
            <option value="شرکت" ${data.prefix === 'شرکت' ? 'selected' : ''}>شرکت</option>
            <option value="موسسه" ${data.prefix === 'موسسه' ? 'selected' : ''}>موسسه</option>
            <option value="سازمان" ${data.prefix === 'سازمان' ? 'selected' : ''}>سازمان</option>
          </select>
        </div>
        <div class="form-group" id="nameField" style="grid-column:${data.entityType === 'natural' ? 'span 1' : 'span 2'}">
          <label class="form-label">نام <span class="req">*</span></label>
          <input type="text" class="form-control" id="cName" value="${this._esc(data.name)}" placeholder="نام کامل یا نام شرکت" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">موبایل</label>
          <input type="tel" class="form-control" id="cMobile" value="${this._esc(data.mobile)}" placeholder="۰۹۱۲۳۴۵۶۷۸۹" />
        </div>
        <div class="form-group">
          <label class="form-label">تلفن ثابت</label>
          <input type="tel" class="form-control" id="cPhone" value="${this._esc(data.phone)}" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" id="nationalIdLabel">${data.entityType === 'legal' ? 'شناسه ملی' : 'کد ملی'}</label>
          <input type="text" class="form-control" id="cNationalId" value="${this._esc(data.nationalId)}" />
        </div>
        <div class="form-group" id="economicField" style="display:${data.entityType === 'legal' ? 'block' : 'none'}">
          <label class="form-label">کد اقتصادی</label>
          <input type="text" class="form-control" id="cEconomicCode" value="${this._esc(data.economicCode)}" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group" id="regField" style="display:${data.entityType === 'legal' ? 'block' : 'none'}">
          <label class="form-label">شماره ثبت</label>
          <input type="text" class="form-control" id="cRegNumber" value="${this._esc(data.regNumber)}" />
        </div>
        <div class="form-group">
          <label class="form-label">کد پستی</label>
          <input type="text" class="form-control" id="cPostalCode" value="${this._esc(data.postalCode)}" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">نشانی</label>
        <textarea class="form-control" id="cAddress" rows="2">${this._esc(data.address)}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">برچسب‌ها</label>
        <div id="tagsContainer">${tagsChips || '<small style="color:var(--text-muted)">هنوز برچسبی تعریف نشده</small>'}</div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <input type="text" class="form-control" id="newTagInput" placeholder="برچسب جدید..." style="flex:1" />
          <button class="btn btn-secondary" onclick="window.ContactsView.addNewTag()">➕</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">یادداشت</label>
        <textarea class="form-control" id="cNote" rows="2">${this._esc(data.note)}</textarea>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn" onclick="window.ContactsView.saveContact(${isEdit ? `'${contactId}'` : 'null'})">💾 ذخیره</button>
    `;

    Modal.open({
      title: isEdit ? 'ویرایش شخص' : 'شخص جدید',
      body,
      footer,
      size: 'md'
    });
  }

  _toggleEntityFields(type) {
    const show = type === 'legal' ? 'block' : 'none';
    const prefix = document.getElementById('prefixField');
    const nameField = document.getElementById('nameField');
    const nationalLabel = document.getElementById('nationalIdLabel');
    const economic = document.getElementById('economicField');
    const reg = document.getElementById('regField');

    if (prefix) prefix.style.display = type === 'natural' ? 'block' : 'none';
    if (nameField) nameField.style.gridColumn = type === 'natural' ? 'span 1' : 'span 2';
    if (nationalLabel) nationalLabel.textContent = type === 'legal' ? 'شناسه ملی' : 'کد ملی';
    if (economic) economic.style.display = show;
    if (reg) reg.style.display = show;
  }

  addNewTag() {
    const input = document.getElementById('newTagInput');
    const tag = input.value.trim();
    if (!tag) return;

    const container = document.getElementById('tagsContainer');
    if (container.querySelector('small')) container.innerHTML = '';

    const existing = Array.from(container.querySelectorAll('.tagCheckbox')).map(cb => cb.value);
    if (existing.includes(tag)) {
      Toast.warning('این برچسب قبلاً اضافه شده');
      return;
    }

    const label = document.createElement('label');
    label.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--bg);border:1px solid var(--border);border-radius:20px;font-size:12px;cursor:pointer;margin:3px';
    label.innerHTML = `<input type="checkbox" class="tagCheckbox" value="${this._esc(tag)}" checked /> ${this._esc(tag)}`;
    container.appendChild(label);
    input.value = '';
  }

  async saveContact(id) {
    const tags = Array.from(document.querySelectorAll('.tagCheckbox'))
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    const data = {
      entityType: document.getElementById('cEntityType').value,
      role: document.getElementById('cRole').value,
      prefix: document.getElementById('cPrefix')?.value || '',
      name: document.getElementById('cName').value,
      mobile: document.getElementById('cMobile').value,
      phone: document.getElementById('cPhone').value,
      nationalId: document.getElementById('cNationalId').value,
      economicCode: document.getElementById('cEconomicCode')?.value || '',
      regNumber: document.getElementById('cRegNumber')?.value || '',
      postalCode: document.getElementById('cPostalCode').value,
      address: document.getElementById('cAddress').value,
      tags,
      note: document.getElementById('cNote').value
    };

    if (!data.name.trim()) {
      Toast.warning('نام الزامی است');
      return;
    }

    try {
      if (id) {
        await ContactController.update(id, data);
        Toast.success('شخص با موفقیت ویرایش شد');
      } else {
        await ContactController.create(data);
        Toast.success('شخص با موفقیت ثبت شد');
      }
      Modal.close();
      await this.reload();
      document.getElementById('contacts-content').innerHTML = this.renderTable();
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  async editContact(id) {
    await this.openContactModal(id);
  }

  async deleteContact(id) {
    const c = cache.contacts.find(x => x.id === id);
    Modal.confirm({
      title: 'حذف شخص',
      message: `آیا از حذف «${this._esc(c?.name || '')}» مطمئن هستید؟`,
      confirmText: 'حذف',
      danger: true,
      onConfirm: async () => {
        try {
          await ContactController.delete(id);
          Toast.success('شخص حذف شد');
          await this.reload();
          document.getElementById('contacts-content').innerHTML = this.renderTable();
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

export const ContactsView = new ContactsViewImpl();
window.ContactsView = ContactsView;