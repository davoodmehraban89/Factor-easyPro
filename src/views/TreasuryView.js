// ============================================================
// TreasuryView — صفحه‌ی خزانه‌داری
// ============================================================

import { TreasuryController } from '../controllers/TreasuryController.js';
import { ContactController } from '../controllers/ContactController.js';
import { InvoiceController } from '../controllers/InvoiceController.js';
import { Modal } from '../core/Modal.js';
import { Toast } from '../core/Toast.js';
import { Formatters } from '../utils/Formatters.js';
import { NumberInput } from '../utils/NumberInput.js';

let currentTab = 'accounts';
let txFilter = { search: '', type: '', accountId: '' };
let cache = { accounts: [], balances: {}, transactions: [], contacts: [] };

class TreasuryViewImpl {
  async render() {
    await this.reload();
    return `
      <div class="page-title">
        <h2>خزانه‌داری و بانک</h2>
        <p>مدیریت صندوق‌ها، حساب‌های بانکی و تراکنش‌های دریافت و پرداخت</p>
      </div>

      <div class="tabs">
        <button class="tab-btn ${currentTab === 'accounts' ? 'active' : ''}" onclick="window.TreasuryView._switchTab('accounts', this)">
          💳 حساب‌ها و صندوق‌ها
        </button>
        <button class="tab-btn ${currentTab === 'transactions' ? 'active' : ''}" onclick="window.TreasuryView._switchTab('transactions', this)">
          💸 تراکنش‌ها
        </button>
      </div>

      <div id="treasury-content">${this.renderTabContent()}</div>
    `;
  }

  onMount() {
    window.TreasuryView = this;
  }

  async reload() {
    cache.accounts = await TreasuryController.getAccounts();
    cache.balances = await TreasuryController.getBalanceMap();
    cache.transactions = await TreasuryController.getTransactions();
    cache.contacts = await ContactController.getAll();
  }

  _switchTab(tab, btn) {
    currentTab = tab;
    document.querySelectorAll('.tabs .tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    document.getElementById('treasury-content').innerHTML = this.renderTabContent();
  }

  renderTabContent() {
    if (currentTab === 'accounts') return this.renderAccountsTab();
    if (currentTab === 'transactions') return this.renderTransactionsTab();
    return '';
  }

  // ============================================================
  // تب حساب‌ها
  // ============================================================
  renderAccountsTab() {
    const totalBalance = Object.values(cache.balances).reduce((s, v) => s + v, 0);

    let cardsHtml = '';
    if (cache.accounts.length === 0) {
      cardsHtml = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="icon">💳</div>
          <h3>هنوز حساب یا صندوقی تعریف نشده</h3>
          <p>اولین حساب یا صندوق خود را اضافه کنید</p>
          <button class="btn" onclick="window.TreasuryView.openAccountModal()">➕ حساب جدید</button>
        </div>`;
    } else {
      cardsHtml = cache.accounts.map(acc => {
        const bal = cache.balances[acc.id] || 0;
        const typeLabels = {
          cashbox: { label: 'صندوق', icon: '💰' },
          bank: { label: 'بانک', icon: '🏦' },
          pos: { label: 'پوز', icon: '💳' }
        };
        const t = typeLabels[acc.type] || { label: acc.type, icon: '📁' };
        return `
          <div class="account-card" style="border-top:3px solid ${acc.color || '#0d9488'}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
              <div>
                <div style="font-size:24px;margin-bottom:4px">${t.icon}</div>
                <div style="font-weight:700;font-size:14px">${this._esc(acc.name)}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${t.label}${acc.isDefault ? ' • پیش‌فرض' : ''}</div>
              </div>
              <div class="row-actions">
                <button class="icon-btn-sm" title="ویرایش" onclick="window.TreasuryView.editAccount('${acc.id}')">✏️</button>
                <button class="icon-btn-sm danger" title="حذف" onclick="window.TreasuryView.deleteAccount('${acc.id}')">🗑️</button>
              </div>
            </div>
            ${acc.bankName ? `<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:4px">🏛️ ${this._esc(acc.bankName)}</div>` : ''}
            ${acc.accountNumber ? `<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:4px">شماره: ${Formatters.toPersianDigits(acc.accountNumber)}</div>` : ''}
            <div style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--border)">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">موجودی فعلی</div>
              <div style="font-size:18px;font-weight:800;color:${bal >= 0 ? 'var(--success)' : 'var(--danger)'}">${Formatters.money(bal)}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    return `
      <div class="card" style="background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff;border:none">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-size:12px;opacity:.85;margin-bottom:4px">موجودی کل خزانه</div>
            <div style="font-size:26px;font-weight:800">${Formatters.money(totalBalance)}</div>
            <div style="font-size:11.5px;opacity:.85;margin-top:4px">${Formatters.toPersianDigits(cache.accounts.length)} حساب فعال</div>
          </div>
          <button class="btn" style="background:#fff;color:var(--primary)" onclick="window.TreasuryView.openAccountModal()">➕ حساب جدید</button>
        </div>
      </div>

      <div class="account-grid">${cardsHtml}</div>
    `;
  }

  // ============================================================
  // تب تراکنش‌ها
  // ============================================================
  renderTransactionsTab() {
    let list = cache.transactions;

    if (txFilter.search) {
      const q = txFilter.search.toLowerCase();
      list = list.filter(t =>
        (t.contactName || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        String(t.refInvoiceNumber || '').includes(q)
      );
    }
    if (txFilter.type) list = list.filter(t => t.type === txFilter.type);
    if (txFilter.accountId) {
      list = list.filter(t => t.fromAccountId === txFilter.accountId || t.toAccountId === txFilter.accountId);
    }

    const rows = list.length === 0
      ? `<tr><td colspan="8"><div class="empty-state"><div class="icon">💸</div><h3>هیچ تراکنشی ثبت نشده</h3><p>اولین دریافت یا پرداخت را ثبت کنید</p></div></td></tr>`
      : list.map(t => {
          const fromAcc = cache.accounts.find(a => a.id === t.fromAccountId);
          const toAcc = cache.accounts.find(a => a.id === t.toAccountId);
          const typeInfo = {
            receipt: { label: 'دریافت', cls: 'badge-success', icon: '📥' },
            payment: { label: 'پرداخت', cls: 'badge-danger', icon: '📤' },
            transfer: { label: 'انتقال', cls: 'badge-warning', icon: '🔄' }
          }[t.type] || { label: t.type, cls: 'badge-muted', icon: '💸' };

          let accountText = '—';
          if (t.type === 'transfer') {
            accountText = `${this._esc(fromAcc?.name || '—')} → ${this._esc(toAcc?.name || '—')}`;
          } else if (t.type === 'receipt') {
            accountText = this._esc(toAcc?.name || '—');
          } else if (t.type === 'payment') {
            accountText = this._esc(fromAcc?.name || '—');
          }

          return `
            <tr>
              <td><span class="badge ${typeInfo.cls}">${typeInfo.icon} ${typeInfo.label}</span></td>
              <td>${Formatters.toPersianDigits(t.date)}</td>
              <td>${this._esc(t.contactName || '—')}</td>
              <td>${accountText}</td>
              <td>${TreasuryController.getMethodLabel(t.method)}</td>
              <td style="font-weight:700;color:${t.type === 'receipt' ? 'var(--success)' : t.type === 'payment' ? 'var(--danger)' : 'var(--warning)'}">
                ${t.type === 'receipt' ? '+' : t.type === 'payment' ? '-' : ''}${Formatters.money(t.amount)}
              </td>
              <td>${t.refInvoiceNumber ? '#' + Formatters.toPersianDigits(t.refInvoiceNumber) : '—'}</td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn-sm danger" title="حذف" onclick="window.TreasuryView.deleteTransaction('${t.id}')">🗑️</button>
                </div>
              </td>
            </tr>
          `;
        }).join('');

    const accountOptions = cache.accounts.map(a =>
      `<option value="${a.id}" ${txFilter.accountId === a.id ? 'selected' : ''}>${this._esc(a.name)}</option>`
    ).join('');

    return `
      <div class="toolbar">
        <div class="search-input-wrap">
          <span class="icon">🔍</span>
          <input type="text" class="form-control" placeholder="جستجو..." value="${this._esc(txFilter.search)}" oninput="window.TreasuryView._onTxSearch(this.value)" />
        </div>
        <select class="form-control" style="width:auto;min-width:120px" onchange="window.TreasuryView._onTxFilter('type', this.value)">
          <option value="">همه انواع</option>
          <option value="receipt" ${txFilter.type === 'receipt' ? 'selected' : ''}>دریافت</option>
          <option value="payment" ${txFilter.type === 'payment' ? 'selected' : ''}>پرداخت</option>
          <option value="transfer" ${txFilter.type === 'transfer' ? 'selected' : ''}>انتقال</option>
        </select>
        <select class="form-control" style="width:auto;min-width:150px" onchange="window.TreasuryView._onTxFilter('accountId', this.value)">
          <option value="">همه حساب‌ها</option>
          ${accountOptions}
        </select>
        <button class="btn btn-secondary" onclick="window.TreasuryView.openTransferModal()">🔄 انتقال</button>
        <button class="btn btn-danger" onclick="window.TreasuryView.openPaymentModal()">📤 پرداخت</button>
        <button class="btn btn-success" onclick="window.TreasuryView.openReceiptModal()">📥 دریافت</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:100px">نوع</th>
              <th style="width:100px">تاریخ</th>
              <th>طرف حساب</th>
              <th>حساب</th>
              <th style="width:100px">روش</th>
              <th style="width:140px">مبلغ</th>
              <th style="width:100px">فاکتور</th>
              <th style="width:80px">عملیات</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  _onTxSearch(val) {
    txFilter.search = val;
    document.getElementById('treasury-content').innerHTML = this.renderTabContent();
    const input = document.querySelector('#treasury-content input[type="text"]');
    if (input) { input.focus(); input.setSelectionRange(val.length, val.length); }
  }

  _onTxFilter(key, val) {
    txFilter[key] = val;
    document.getElementById('treasury-content').innerHTML = this.renderTabContent();
  }

  // ============================================================
  // فرم حساب
  // ============================================================
  async openAccountModal(accountId = null) {
    const acc = accountId ? await TreasuryController.getAccount(accountId) : null;
    const isEdit = !!acc;
    const d = acc || {
      type: 'cashbox', name: '', accountNumber: '', cardNumber: '', sheba: '',
      bankName: '', branchName: '', branchCode: '', ownerName: '',
      color: '#0d9488', initialBalance: 0
    };

    const body = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">نوع حساب <span class="req">*</span></label>
          <select class="form-control" id="accType" onchange="window.TreasuryView._onAccTypeChange()">
            <option value="cashbox" ${d.type === 'cashbox' ? 'selected' : ''}>صندوق نقدی</option>
            <option value="bank" ${d.type === 'bank' ? 'selected' : ''}>حساب بانکی</option>
            <option value="pos" ${d.type === 'pos' ? 'selected' : ''}>پوز</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">نام حساب <span class="req">*</span></label>
          <input type="text" class="form-control" id="accName" value="${this._esc(d.name)}" placeholder="مثلاً صندوق اصلی / بانک ملی" />
        </div>
      </div>

      <div id="bankFields" style="display:${d.type === 'bank' ? 'block' : 'none'}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">نام بانک</label>
            <input type="text" class="form-control" id="accBankName" value="${this._esc(d.bankName)}" placeholder="مثلاً بانک ملی" />
          </div>
          <div class="form-group">
            <label class="form-label">شماره حساب</label>
            <input type="text" class="form-control" id="accAccountNumber" value="${this._esc(d.accountNumber)}" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">شماره کارت (۱۶ رقم)</label>
            <input type="text" class="form-control" id="accCardNumber" value="${this._esc(d.cardNumber)}" maxlength="16" />
          </div>
          <div class="form-group">
            <label class="form-label">شماره شبا</label>
            <input type="text" class="form-control" id="accSheba" value="${this._esc(d.sheba)}" placeholder="IR..." />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">نام شعبه</label>
            <input type="text" class="form-control" id="accBranchName" value="${this._esc(d.branchName)}" />
          </div>
          <div class="form-group">
            <label class="form-label">کد شعبه</label>
            <input type="text" class="form-control" id="accBranchCode" value="${this._esc(d.branchCode)}" />
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">نام دارنده حساب</label>
          <input type="text" class="form-control" id="accOwnerName" value="${this._esc(d.ownerName)}" />
        </div>
        <div class="form-group">
          <label class="form-label">موجودی اولیه (ریال)</label>
          <input type="text" inputmode="numeric" class="form-control" id="accInitialBalance" value="${NumberInput.format(d.initialBalance || 0)}" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">رنگ نمایشی</label>
        <input type="color" class="form-control" id="accColor" value="${d.color || '#0d9488'}" style="height:44px;padding:4px" />
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn" onclick="window.TreasuryView.saveAccount(${isEdit ? `'${accountId}'` : 'null'})">💾 ذخیره</button>
    `;

    Modal.open({ title: isEdit ? 'ویرایش حساب' : 'حساب جدید', body, footer, size: 'md' });
  }

  _onAccTypeChange() {
    const type = document.getElementById('accType').value;
    document.getElementById('bankFields').style.display = type === 'bank' ? 'block' : 'none';
  }

  async saveAccount(id) {
    const data = {
      type: document.getElementById('accType').value,
      name: document.getElementById('accName').value,
      bankName: document.getElementById('accBankName')?.value || '',
      accountNumber: document.getElementById('accAccountNumber')?.value || '',
      cardNumber: document.getElementById('accCardNumber')?.value || '',
      sheba: document.getElementById('accSheba')?.value || '',
      branchName: document.getElementById('accBranchName')?.value || '',
      branchCode: document.getElementById('accBranchCode')?.value || '',
      ownerName: document.getElementById('accOwnerName').value,
      color: document.getElementById('accColor').value,
      initialBalance: NumberInput.parse(document.getElementById('accInitialBalance').value)
    };

    if (!data.name.trim()) { Toast.warning('نام حساب الزامی است'); return; }

    try {
      if (id) {
        await TreasuryController.updateAccount(id, data);
        Toast.success('حساب ویرایش شد');
      } else {
        await TreasuryController.createAccount(data);
        Toast.success('حساب اضافه شد');
      }
      Modal.close();
      await this.reload();
      document.getElementById('treasury-content').innerHTML = this.renderTabContent();
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  async editAccount(id) {
    await this.openAccountModal(id);
  }

  async deleteAccount(id) {
    const acc = cache.accounts.find(a => a.id === id);
    Modal.confirm({
      title: 'حذف حساب',
      message: `آیا از حذف «${this._esc(acc?.name || '')}» مطمئن هستید؟`,
      confirmText: 'حذف',
      danger: true,
      onConfirm: async () => {
        try {
          await TreasuryController.deleteAccount(id);
          Toast.success('حساب حذف شد');
          await this.reload();
          document.getElementById('treasury-content').innerHTML = this.renderTabContent();
        } catch (err) {
          Toast.error(err.message);
        }
      }
    });
  }

  // ============================================================
  // فرم‌های تراکنش
  // ============================================================
  _buildAccountOptions(selectedId = null, filterType = null) {
    let list = cache.accounts;
    if (filterType) list = list.filter(a => a.type === filterType);
    return list.map(a =>
      `<option value="${a.id}" ${selectedId === a.id ? 'selected' : ''}>${this._esc(a.name)}</option>`
    ).join('');
  }

  _buildContactOptions() {
    return cache.contacts.map(c =>
      `<option value="${c.id}">${this._esc(c.name)}</option>`
    ).join('');
  }

  openReceiptModal() {
    if (cache.accounts.length === 0) {
      Toast.warning('ابتدا یک حساب یا صندوق تعریف کنید');
      return;
    }
    const body = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">تاریخ</label>
          <input type="text" class="form-control" id="txDate" value="${this._todayJalali()}" />
        </div>
        <div class="form-group">
          <label class="form-label">مبلغ (ریال) <span class="req">*</span></label>
          <input type="text" inputmode="numeric" class="form-control" id="txAmount" value="0" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">از طرف (شخص)</label>
        <select class="form-control" id="txContact">
          <option value="">— بدون طرف حساب —</option>
          ${this._buildContactOptions()}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">به حساب <span class="req">*</span></label>
        <select class="form-control" id="txToAccount">${this._buildAccountOptions()}</select>
      </div>

      <div class="form-group">
        <label class="form-label">روش دریافت</label>
        <select class="form-control" id="txMethod">
          <option value="cash">نقدی</option>
          <option value="card">کارت</option>
          <option value="transfer">انتقال بانکی</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">توضیحات</label>
        <textarea class="form-control" id="txDescription" rows="2"></textarea>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn btn-success" onclick="window.TreasuryView._saveTransaction('receipt')">📥 ثبت دریافت</button>
    `;
    Modal.open({ title: 'ثبت دریافت وجه', body, footer, size: 'md' });
  }

  openPaymentModal() {
    if (cache.accounts.length === 0) {
      Toast.warning('ابتدا یک حساب یا صندوق تعریف کنید');
      return;
    }
    const body = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">تاریخ</label>
          <input type="text" class="form-control" id="txDate" value="${this._todayJalali()}" />
        </div>
        <div class="form-group">
          <label class="form-label">مبلغ (ریال) <span class="req">*</span></label>
          <input type="text" inputmode="numeric" class="form-control" id="txAmount" value="0" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">به شخص</label>
        <select class="form-control" id="txContact">
          <option value="">— بدون طرف حساب —</option>
          ${this._buildContactOptions()}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">از حساب <span class="req">*</span></label>
        <select class="form-control" id="txFromAccount">${this._buildAccountOptions()}</select>
      </div>

      <div class="form-group">
        <label class="form-label">روش پرداخت</label>
        <select class="form-control" id="txMethod">
          <option value="cash">نقدی</option>
          <option value="card">کارت</option>
          <option value="transfer">انتقال بانکی</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">توضیحات</label>
        <textarea class="form-control" id="txDescription" rows="2"></textarea>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn btn-danger" onclick="window.TreasuryView._saveTransaction('payment')">📤 ثبت پرداخت</button>
    `;
    Modal.open({ title: 'ثبت پرداخت وجه', body, footer, size: 'md' });
  }

  openTransferModal() {
    if (cache.accounts.length < 2) {
      Toast.warning('برای انتقال، حداقل دو حساب لازم است');
      return;
    }
    const body = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">تاریخ</label>
          <input type="text" class="form-control" id="txDate" value="${this._todayJalali()}" />
        </div>
        <div class="form-group">
          <label class="form-label">مبلغ (ریال) <span class="req">*</span></label>
          <input type="text" inputmode="numeric" class="form-control" id="txAmount" value="0" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">از حساب <span class="req">*</span></label>
        <select class="form-control" id="txFromAccount">${this._buildAccountOptions()}</select>
      </div>

      <div class="form-group">
        <label class="form-label">به حساب <span class="req">*</span></label>
        <select class="form-control" id="txToAccount">${this._buildAccountOptions()}</select>
      </div>

      <div class="form-group">
        <label class="form-label">توضیحات</label>
        <textarea class="form-control" id="txDescription" rows="2"></textarea>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn btn-warning" onclick="window.TreasuryView._saveTransaction('transfer')">🔄 انتقال</button>
    `;
    Modal.open({ title: 'انتقال بین حساب‌ها', body, footer, size: 'md' });
  }

  async _saveTransaction(type) {
    const amount = NumberInput.parse(document.getElementById('txAmount').value);
    if (amount <= 0) { Toast.warning('مبلغ معتبر نیست'); return; }

    const contactSelect = document.getElementById('txContact');
    const contactId = contactSelect?.value || null;
    const contact = contactId ? cache.contacts.find(c => c.id === contactId) : null;

    const data = {
      type,
      date: document.getElementById('txDate').value,
      amount,
      method: document.getElementById('txMethod')?.value || 'cash',
      contactId,
      contactName: contact?.name || '',
      fromAccountId: document.getElementById('txFromAccount')?.value || null,
      toAccountId: document.getElementById('txToAccount')?.value || null,
      description: document.getElementById('txDescription')?.value || ''
    };

    if (type === 'transfer') {
      if (!data.fromAccountId || !data.toAccountId) {
        Toast.warning('حساب مبدأ و مقصد رو انتخاب کنید');
        return;
      }
      if (data.fromAccountId === data.toAccountId) {
        Toast.warning('حساب مبدأ و مقصد نباید یکی باشند');
        return;
      }
    }

    try {
      await TreasuryController.createTransaction(data);
      Toast.success(TreasuryController.getTypeLabel(type) + ' ثبت شد');
      Modal.close();
      await this.reload();
      document.getElementById('treasury-content').innerHTML = this.renderTabContent();
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  async deleteTransaction(id) {
    Modal.confirm({
      title: 'حذف تراکنش',
      message: 'آیا از حذف این تراکنش مطمئن هستید؟ موجودی حساب به‌روزرسانی می‌شود.',
      confirmText: 'حذف',
      danger: true,
      onConfirm: async () => {
        await TreasuryController.deleteTransaction(id);
        Toast.success('تراکنش حذف شد');
        await this.reload();
        document.getElementById('treasury-content').innerHTML = this.renderTabContent();
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

  _esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

export const TreasuryView = new TreasuryViewImpl();
window.TreasuryView = TreasuryView;