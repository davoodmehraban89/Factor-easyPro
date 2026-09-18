// ============================================================
// ExpensesView — صفحه‌ی هزینه‌ها و درآمدهای متفرقه
// ============================================================

import { ExpenseController } from '../controllers/ExpenseController.js';
import { Modal } from '../core/Modal.js';
import { Toast } from '../core/Toast.js';
import { Formatters } from '../utils/Formatters.js';
import { NumberInput } from '../utils/NumberInput.js';
import { Jalali } from '../utils/Jalali.js';

let filter = { search: '', kind: '', category: '', dateFrom: '', dateTo: '' };
let cache = { items: [], categories: [], stats: {} };

class ExpensesViewImpl {
  async render() {
    await this.reload();
    return `
      <div class="page-title">
        <h2>هزینه‌ها و درآمدها</h2>
        <p>ثبت و مدیریت هزینه‌ها، درآمدهای متفرقه و تراز مالی</p>
      </div>

      <div class="grid-kpi">
        <div class="card" style="margin:0">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">کل درآمدها</div>
          <div style="font-size:20px;font-weight:800;color:var(--success)">${Formatters.money(cache.stats.totalIncome || 0)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${Formatters.number(cache.items.filter(i => i.kind === 'income').length)} سند</div>
        </div>
        <div class="card" style="margin:0">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">کل هزینه‌ها</div>
          <div style="font-size:20px;font-weight:800;color:var(--danger)">${Formatters.money(cache.stats.totalExpense || 0)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${Formatters.number(cache.items.filter(i => i.kind === 'expense').length)} سند</div>
        </div>
        <div class="card" style="margin:0">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">تراز (درآمد - هزینه)</div>
          <div style="font-size:20px;font-weight:800;color:${(cache.stats.balance || 0) >= 0 ? 'var(--primary)' : 'var(--danger)'}">${Formatters.money(cache.stats.balance || 0)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${(cache.stats.balance || 0) >= 0 ? 'مثبت' : 'منفی'}</div>
        </div>
        <div class="card" style="margin:0">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">تعداد اسناد</div>
          <div style="font-size:20px;font-weight:800;color:var(--info)">${Formatters.number(cache.stats.count || 0)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">در فیلتر فعلی</div>
        </div>
      </div>

      <div id="expenses-content">${this.renderContent()}</div>
    `;
  }

  onMount() {
    window.ExpensesView = this;
  }

  async reload() {
    cache.items = await ExpenseController.getAll(filter);
    cache.categories = await ExpenseController.getCategories();
    cache.stats = await ExpenseController.getStats(filter);
  }

  renderContent() {
    const rows = cache.items.length === 0
      ? `<tr><td colspan="7"><div class="empty-state"><div class="icon">💰</div><h3>هیچ سندی ثبت نشده</h3><p>اولین هزینه یا درآمد خود را ثبت کنید</p><button class="btn" onclick="window.ExpensesView.openExpenseModal()">➕ سند جدید</button></div></td></tr>`
      : cache.items.map(e => {
          const isIncome = e.kind === 'income';
          return `
            <tr>
              <td>
                <span class="badge ${isIncome ? 'badge-success' : 'badge-danger'}">
                  ${isIncome ? '📥 درآمد' : '📤 هزینه'}
                </span>
              </td>
              <td>${Formatters.toPersianDigits(e.date || '—')}</td>
              <td><strong>${this._esc(e.category || '—')}</strong></td>
              <td>${this._esc(e.description || '—')}</td>
              <td>${ExpenseController.getMethodLabel(e.method)}</td>
              <td>${e.refNumber ? Formatters.toPersianDigits(e.refNumber) : '—'}</td>
              <td style="font-weight:700;color:${isIncome ? 'var(--success)' : 'var(--danger)'}">
                ${isIncome ? '+' : '-'}${Formatters.money(e.amount)}
              </td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn-sm" title="ویرایش" onclick="window.ExpensesView.editExpense('${e.id}')">✏️</button>
                  <button class="icon-btn-sm danger" title="حذف" onclick="window.ExpensesView.deleteExpense('${e.id}')">🗑️</button>
                </div>
              </td>
            </tr>
          `;
        }).join('');

    const categoryOptions = cache.categories.map(c =>
      `<option value="${c}" ${filter.category === c ? 'selected' : ''}>${this._esc(c)}</option>`
    ).join('');

    return `
      <div class="toolbar">
        <div class="search-input-wrap">
          <span class="icon">🔍</span>
          <input type="text" class="form-control" id="expSearch" placeholder="جستجو در سرفصل، شرح یا شماره پیگیری..." value="${this._esc(filter.search)}" oninput="window.ExpensesView._onSearch(this.value)" />
        </div>
        <select class="form-control" style="width:auto;min-width:130px" onchange="window.ExpensesView._onFilter('kind', this.value)">
          <option value="">همه انواع</option>
          <option value="expense" ${filter.kind === 'expense' ? 'selected' : ''}>هزینه</option>
          <option value="income" ${filter.kind === 'income' ? 'selected' : ''}>درآمد</option>
        </select>
        <select class="form-control" style="width:auto;min-width:150px" onchange="window.ExpensesView._onFilter('category', this.value)">
          <option value="">همه سرفصل‌ها</option>
          ${categoryOptions}
        </select>
        <input type="text" class="form-control" style="width:130px" placeholder="از تاریخ" value="${this._esc(filter.dateFrom)}" onchange="window.ExpensesView._onFilter('dateFrom', this.value)" />
        <input type="text" class="form-control" style="width:130px" placeholder="تا تاریخ" value="${this._esc(filter.dateTo)}" onchange="window.ExpensesView._onFilter('dateTo', this.value)" />
        <button class="btn btn-secondary btn-inline" onclick="window.ExpensesView._clearFilters()">↺ پاک کردن فیلتر</button>
        <button class="btn" onclick="window.ExpensesView.openExpenseModal()">➕ سند جدید</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:110px">نوع</th>
              <th style="width:110px">تاریخ</th>
              <th style="width:150px">سرفصل</th>
              <th>شرح</th>
              <th style="width:110px">روش</th>
              <th style="width:120px">شماره پیگیری</th>
              <th style="width:140px">مبلغ</th>
              <th style="width:100px">عملیات</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  _onSearch(val) {
    filter.search = val;
    this.reload().then(() => {
      document.getElementById('expenses-content').innerHTML = this.renderContent();
      const input = document.getElementById('expSearch');
      if (input) { input.focus(); input.setSelectionRange(val.length, val.length); }
    });
  }

  _onFilter(key, val) {
    filter[key] = val;
    this.reloadAndRender();
  }

  _clearFilters() {
    filter = { search: '', kind: '', category: '', dateFrom: '', dateTo: '' };
    this.reloadAndRender();
    Toast.info('فیلترها پاک شد');
  }

  async reloadAndRender() {
    await this.reload();
    document.getElementById('expenses-content').innerHTML = this.renderContent();
    // KPI ها را هم رفرش کن
    const kpi = document.querySelector('.grid-kpi');
    if (kpi) {
      const stats = cache.stats;
      kpi.children[0].querySelector('div:nth-child(2)').textContent = Formatters.money(stats.totalIncome || 0);
      kpi.children[0].querySelector('div:nth-child(3)').textContent = Formatters.toPersianDigits(cache.items.filter(i => i.kind === 'income').length) + ' سند';
      kpi.children[1].querySelector('div:nth-child(2)').textContent = Formatters.money(stats.totalExpense || 0);
      kpi.children[1].querySelector('div:nth-child(3)').textContent = Formatters.toPersianDigits(cache.items.filter(i => i.kind === 'expense').length) + ' سند';
      const bal = stats.balance || 0;
      const balEl = kpi.children[2].querySelector('div:nth-child(2)');
      balEl.textContent = Formatters.money(bal);
      balEl.style.color = bal >= 0 ? 'var(--primary)' : 'var(--danger)';
      kpi.children[2].querySelector('div:nth-child(3)').textContent = bal >= 0 ? 'مثبت' : 'منفی';
      kpi.children[3].querySelector('div:nth-child(2)').textContent = Formatters.toPersianDigits(stats.count || 0);
    }
  }

  // ============================================================
  // فرم ثبت/ویرایش
  // ============================================================
  async openExpenseModal(expenseId = null) {
    const isEdit = !!expenseId;
    const d = isEdit ? await ExpenseController.get(expenseId) : {
      kind: 'expense',
      category: '',
      amount: 0,
      date: Jalali.today(),
      method: 'cash',
      description: '',
      refNumber: ''
    };

    const categoriesForKind = await ExpenseController.getCategories(d.kind);

    const body = `
      <div class="form-group">
        <label class="form-label">نوع سند <span class="req">*</span></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label class="print-tpl-card ${d.kind === 'expense' ? 'active' : ''}" data-kind="expense" style="padding:12px 8px">
            <input type="radio" name="expKind" value="expense" ${d.kind === 'expense' ? 'checked' : ''} style="display:none" />
            <div style="font-size:22px">📤</div>
            <div style="font-weight:700;font-size:13px;margin-top:4px">هزینه</div>
          </label>
          <label class="print-tpl-card ${d.kind === 'income' ? 'active' : ''}" data-kind="income" style="padding:12px 8px">
            <input type="radio" name="expKind" value="income" ${d.kind === 'income' ? 'checked' : ''} style="display:none" />
            <div style="font-size:22px">📥</div>
            <div style="font-weight:700;font-size:13px;margin-top:4px">درآمد</div>
          </label>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">سرفصل <span class="req">*</span></label>
          <div style="display:flex;gap:6px">
            <select class="form-control" id="expCategory" style="flex:1">
              ${categoriesForKind.map(c => `<option value="${this._esc(c)}" ${d.category === c ? 'selected' : ''}>${this._esc(c)}</option>`).join('')}
            </select>
            <button class="btn btn-secondary btn-inline" style="padding:0 12px" onclick="window.ExpensesView._promptNewCategory()" title="سرفصل جدید">➕</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">تاریخ <span class="req">*</span></label>
          <input type="text" class="form-control" id="expDate" value="${this._esc(d.date)}" placeholder="1405/06/27" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">مبلغ (ریال) <span class="req">*</span></label>
          <input type="text" inputmode="numeric" class="form-control" id="expAmount" value="${NumberInput.format(d.amount || 0)}" />
        </div>
        <div class="form-group">
          <label class="form-label">روش پرداخت / دریافت</label>
          <select class="form-control" id="expMethod">
            <option value="cash" ${d.method === 'cash' ? 'selected' : ''}>نقدی</option>
            <option value="card" ${d.method === 'card' ? 'selected' : ''}>کارت</option>
            <option value="cheque" ${d.method === 'cheque' ? 'selected' : ''}>چک</option>
            <option value="transfer" ${d.method === 'transfer' ? 'selected' : ''}>انتقال بانکی</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">شماره پیگیری / سند (اختیاری)</label>
        <input type="text" class="form-control" id="expRef" value="${this._esc(d.refNumber)}" placeholder="مثلاً 12345" />
      </div>

      <div class="form-group">
        <label class="form-label">شرح</label>
        <textarea class="form-control" id="expDesc" rows="2" placeholder="توضیحات اضافی...">${this._esc(d.description)}</textarea>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn" onclick="window.ExpensesView.saveExpense(${isEdit ? `'${expenseId}'` : 'null'})">💾 ذخیره</button>
    `;

    Modal.open({ title: isEdit ? 'ویرایش سند' : 'سند جدید', body, footer, size: 'md' });

    setTimeout(() => {
      // انتخاب نوع
      document.querySelectorAll('[data-kind]').forEach(card => {
        card.addEventListener('click', async () => {
          document.querySelectorAll('[data-kind]').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          card.querySelector('input').checked = true;

          // آپدیت dropdown سرفصل‌ها
          const kind = card.getAttribute('data-kind');
          const cats = await ExpenseController.getCategories(kind);
          const select = document.getElementById('expCategory');
          if (select) {
            select.innerHTML = cats.map(c => `<option value="${this._esc(c)}">${this._esc(c)}</option>`).join('');
          }
        });
      });
    }, 50);
  }

  async _promptNewCategory() {
    const catName = prompt('نام سرفصل جدید:');
    if (!catName || !catName.trim()) return;
    const select = document.getElementById('expCategory');
    if (select) {
      const trimmed = catName.trim();
      const exists = Array.from(select.options).some(o => o.value === trimmed);
      if (exists) {
        select.value = trimmed;
        Toast.info('این سرفصل از قبل وجود داشت');
        return;
      }
      const opt = document.createElement('option');
      opt.value = trimmed;
      opt.textContent = trimmed;
      select.appendChild(opt);
      select.value = trimmed;
      Toast.success('سرفصل اضافه شد');
    }
  }

  async saveExpense(id) {
    const kind = document.querySelector('input[name="expKind"]:checked')?.value || 'expense';
    const category = document.getElementById('expCategory').value;
    const date = document.getElementById('expDate').value.trim();
    const amount = NumberInput.parse(document.getElementById('expAmount').value);
    const method = document.getElementById('expMethod').value;
    const refNumber = document.getElementById('expRef').value;
    const description = document.getElementById('expDesc').value;

    if (!category) { Toast.warning('سرفصل را انتخاب کنید'); return; }
    if (!date) { Toast.warning('تاریخ الزامی است'); return; }
    if (amount <= 0) { Toast.warning('مبلغ معتبر نیست'); return; }

    const data = { kind, category, date, amount, method, refNumber, description };

    try {
      if (id) {
        await ExpenseController.update(id, data);
        Toast.success('سند ویرایش شد');
      } else {
        await ExpenseController.create(data);
        Toast.success(kind === 'income' ? 'درآمد ثبت شد' : 'هزینه ثبت شد');
      }
      Modal.close();
      await this.reloadAndRender();
    } catch (err) {
      console.error(err);
      Toast.error('خطا: ' + err.message);
    }
  }

  async editExpense(id) {
    await this.openExpenseModal(id);
  }

  async deleteExpense(id) {
    const e = cache.items.find(x => x.id === id);
    Modal.confirm({
      title: 'حذف سند',
      message: `آیا از حذف «${this._esc(e?.category || '')} - ${Formatters.money(e?.amount || 0)}» مطمئن هستید؟`,
      confirmText: 'حذف',
      danger: true,
      onConfirm: async () => {
        try {
          await ExpenseController.delete(id);
          Toast.success('سند حذف شد');
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

export const ExpensesView = new ExpensesViewImpl();
window.ExpensesView = ExpensesView;