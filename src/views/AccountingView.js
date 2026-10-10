// Factor-easyPro V2 / Phase 1: isolated accounting workbench.
// Existing invoice, inventory and treasury workflows are deliberately untouched.
import { AccountingService as Ledger } from '../core/AccountingService.js';
import { RetailPostingService as Retail } from '../core/RetailPostingService.js';
import { DataScope } from '../core/DataScope.js';
import { Auth } from '../core/Auth.js';
import { Modal } from '../core/Modal.js';
import { Toast } from '../core/Toast.js';
import { Formatters } from '../utils/Formatters.js';
import { Jalali } from '../utils/Jalali.js';
import { ACCOUNT_LEVELS, ACCOUNT_TYPES } from '../core/AccountingCore.mjs';

const levelNames = { group: 'گروه', general: 'کل', subsidiary: 'معین', detail: 'تفصیلی' };
const typeNames = { asset: 'دارایی', liability: 'بدهی', equity: 'حقوق مالکانه', revenue: 'درآمد', expense: 'هزینه' };
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const digits = input => String(input ?? '').replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632));
const rial = input => {
  const raw = digits(input).replace(/[,_،\s]/g, '');
  if (!raw) return 0;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('مبلغ باید عدد صحیح و غیرمنفی به ریال باشد');
  return Number(raw);
};
const safeDate = () => Jalali.today();

class AccountingViewImpl {
  constructor() {
    this.tab = 'journals';
    this.accounts = [];
    this.periods = [];
    this.journals = [];
    this.busy = false;
  }
  async reload() {
    [this.accounts, this.periods, this.journals] = await Promise.all([
      Ledger.listAccounts(), Ledger.listPeriods(), Ledger.listJournals()
    ]);
  }
  async render() {
    await this.reload();
    const tabs = [
      ['journals', 'اسناد حسابداری'],
      ['accounts', 'کدینگ حساب‌ها'],
      ['periods', 'دوره‌های مالی'],
      ['trial', 'تراز آزمایشی'],
      ['reports', 'گزارش‌های مالی'],
      ['integration', 'عملیات یکپارچه و انبار']
    ];
    return `<div class="page-title"><h2>حسابداری دوبل</h2>
      <p>گردش‌های مالی و موجودی برای شرکت‌های فعال‌شده به‌صورت اتمیک ثبت می‌شوند؛ داده‌های قدیمی بدون مهاجرت تأییدشده تغییر نمی‌کنند.</p></div>
      <div class="toolbar" style="gap:8px;flex-wrap:wrap">
        ${tabs.map(([id, label]) => `<button class="btn ${this.tab === id ? '' : 'btn-secondary'}" onclick="window.AccountingView.switchTab('${id}')">${label}</button>`).join('')}
      </div>
      <div id="accountingWorkbench">${await this.body()}</div>`;
  }
  onMount() { window.AccountingView = this; }
  async switchTab(tab) {
    this.tab = tab;
    await this.refresh();
  }
  async refresh() {
    try {
      await this.reload();
      const host = document.getElementById('accountingWorkbench');
      if (host) host.innerHTML = await this.body();
    } catch (error) {
      Toast.error('خطای حسابداری: ' + error.message);
    }
  }
  async body() {
    switch (this.tab) {
      case 'accounts': return this.renderAccounts();
      case 'periods': return this.renderPeriods();
      case 'trial': return this.renderTrial();
      case 'reports': return this.renderReports();
      case 'integration': return this.renderIntegration();
      default: return this.renderJournals();
    }
  }
  openPeriods() {
    this.tab = 'periods';
    return this.refresh();
  }
  renderPeriods() {
    const rows = this.periods.map(p => `<tr>
      <td><strong>${html(p.name)}</strong></td>
      <td>${html(p.startDate)}</td><td>${html(p.endDate)}</td>
      <td><span class="badge ${p.closed ? 'badge-muted' : 'badge-success'}">${p.closed ? 'بسته' : 'باز'}</span></td>
      <td>${p.closed ? '—' : `<button class="btn btn-secondary" onclick="window.AccountingView.closePeriod('${html(p.id)}')">بستن دوره</button>`}</td></tr>`).join('');
    return `<div class="card">
      <div class="toolbar"><strong>دوره‌های مالی</strong>
      <button class="btn" onclick="window.AccountingView.openPeriodModal()">افزودن دوره مالی</button></div>
      <div class="table-wrap"><table><thead><tr><th>نام دوره</th><th>شروع</th><th>پایان</th><th>وضعیت</th><th>عملیات</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">هنوز دوره مالی تعریف نشده است.</td></tr>'}</tbody></table></div></div>`;
  }
  renderAccounts() {
    const rows = this.accounts.slice().sort((a, b) => String(a.code).localeCompare(String(b.code), 'fa')).map(a => `<tr>
      <td>${html(a.code)}</td><td>${html(a.name)}</td><td>${levelNames[a.level] || html(a.level)}</td>
      <td>${typeNames[a.type] || html(a.type)}</td><td>${html(a.parentCode || '—')}</td>
      <td>${a.active === false ? 'غیرفعال' : 'فعال'}</td></tr>`).join('');
    return `<div class="card">
      <div class="toolbar"><strong>سرفصل‌های حسابداری</strong>
      <button class="btn btn-secondary" onclick="window.AccountingView.seedChart()">ایجاد کدینگ پیشنهادی</button>
      <button class="btn" onclick="window.AccountingView.openAccountModal()">افزودن حساب</button></div>
      <p style="font-size:12px;color:var(--text-muted);margin:10px 0">کدینگ پیشنهادی مختص این پروژه است و رونوشتی از کدینگ اختصاصی هلو نیست. حساب دارای زیرمجموعه قابل انتخاب در سند نیست.</p>
      <div class="table-wrap"><table><thead><tr><th>کد</th><th>نام</th><th>سطح</th><th>ماهیت</th><th>والد</th><th>وضعیت</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">حسابی تعریف نشده است.</td></tr>'}</tbody></table></div></div>`;
  }
  renderJournals() {
    const rows = this.journals.slice().reverse().map(j => `<tr>
      <td>${html(j.date)}</td><td>${html(j.description || '—')}</td>
      <td>${this.periods.find(p => p.id === j.periodId)?.name ? html(this.periods.find(p => p.id === j.periodId).name) : '—'}</td>
      <td>${Formatters.number(j.debit || 0)}</td><td>${Formatters.number(j.credit || 0)}</td>
      <td><span class="badge ${j.status === 'posted' ? 'badge-success' : 'badge-warning'}">${j.status === 'posted' ? 'قطعی' : 'پیش‌نویس'}</span>${j.reversedById ? ' / برگشت‌خورده' : ''}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary" onclick="window.AccountingView.showJournal('${html(j.id)}')">مشاهده</button>
        ${j.status === 'draft' ? `<button class="btn btn-secondary" onclick="window.AccountingView.openJournalModal('${html(j.id)}')">ویرایش</button>
        <button class="btn" onclick="window.AccountingView.postDraft('${html(j.id)}')">قطعی</button>
        <button class="btn btn-secondary" onclick="window.AccountingView.deleteDraft('${html(j.id)}')">حذف پیش‌نویس</button>` : ''}
        ${j.status === 'posted' && !j.reversedById && !j.reversalOfId
          ? `<button class="btn btn-secondary" onclick="window.AccountingView.openReversal('${html(j.id)}')">برگشت</button>` : ''}
      </td></tr>`).join('');
    return `<div class="card">
      <div class="toolbar"><strong>اسناد حسابداری مستقل</strong>
      <button class="btn" onclick="window.AccountingView.openJournalModal()">ایجاد سند دستی</button></div>
      <p style="font-size:12px;color:var(--text-muted);margin:10px 0">اسناد این قسمت فعلاً مستقل از فاکتورها هستند. برای ثبت سند حداقل یک دوره باز و حساب قابل ثبت لازم است.</p>
      <div class="table-wrap"><table><thead><tr>
        <th>تاریخ</th><th>شرح</th><th>دوره</th><th>بدهکار (ریال)</th><th>بستانکار (ریال)</th><th>وضعیت</th><th>عملیات</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="7">سندی ثبت نشده است.</td></tr>'}</tbody></table></div></div>`;
  }
  async renderTrial() {
    if (!this.periods.length) return '<div class="card">ابتدا دوره مالی تعریف کنید.</div>';
    const periodId = this.selectedTrialPeriod && this.periods.some(p => p.id === this.selectedTrialPeriod)
      ? this.selectedTrialPeriod : this.periods[0].id;
    this.selectedTrialPeriod = periodId;
    const result = await Ledger.trialBalance({ periodId });
    const opts = this.periods.map(p => `<option value="${html(p.id)}" ${p.id === periodId ? 'selected' : ''}>${html(p.name)}</option>`).join('');
    const rows = result.rows.map(r => `<tr><td>${html(r.code)}</td><td>${html(r.name)}</td>
      <td>${Formatters.number(r.debit)}</td><td>${Formatters.number(r.credit)}</td><td>${Formatters.number(r.balance)}</td></tr>`).join('');
    return `<div class="card"><div class="toolbar"><strong>تراز آزمایشی اسناد قطعی</strong>
      <select class="form-control" style="max-width:210px" onchange="window.AccountingView.setTrialPeriod(this.value)">${opts}</select></div>
      <div class="table-wrap"><table><thead><tr><th>کد</th><th>حساب</th><th>گردش بدهکار</th><th>گردش بستانکار</th><th>مانده بدهکار - بستانکار</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">گردشی وجود ندارد.</td></tr>'}</tbody>
      <tfoot><tr><th colspan="2">جمع</th><th>${Formatters.number(result.totals.debit)}</th><th>${Formatters.number(result.totals.credit)}</th><th>۰</th></tr></tfoot>
      </table></div></div>`;
  }
  async renderReports() {
    const r = await Ledger.financialReports();
    const rows = r.trial.map(x => `<tr><td>${html(x.code)}</td><td>${html(x.name)}</td><td>${Formatters.number(x.debit)}</td><td>${Formatters.number(x.credit)}</td><td>${Formatters.number(x.balance)}</td></tr>`).join('');
    const detail = r.detail.map(x => `<tr><td>${html(x.date)}</td><td>${html(x.description)}</td><td>${html(x.code+' — '+x.name)}</td><td>${Formatters.number(x.debit)}</td><td>${Formatters.number(x.credit)}</td></tr>`).join('');
    return `<div class="card"><div class="toolbar"><strong>گزارش‌های مبتنی بر اسناد قطعی دفتر کل</strong><button class="btn btn-secondary" onclick="window.AccountingView.exportReports()">خروجی CSV</button></div>
      <p>درآمد: ${Formatters.number(r.profitLoss.revenue)} ریال | هزینه و بهای تمام‌شده: ${Formatters.number(r.profitLoss.expenses)} ریال | سود خالص: ${Formatters.number(r.profitLoss.netProfit)} ریال</p>
      <p>دارایی: ${Formatters.number(r.balanceSheet.assets)} | بدهی: ${Formatters.number(r.balanceSheet.liabilities)} | حقوق مالکانه با سود جاری: ${Formatters.number(r.balanceSheet.equityWithProfit)} | اختلاف ترازنامه: ${Formatters.number(r.balanceSheet.difference)}</p>
      <h3>تراز حساب‌ها</h3><div class="table-wrap"><table><thead><tr><th>کد</th><th>حساب</th><th>بدهکار</th><th>بستانکار</th><th>مانده</th></tr></thead><tbody>${rows||'<tr><td colspan="5">بدون گردش</td></tr>'}</tbody></table></div>
      <h3>روزنامه و ریز دفتر کل</h3><div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>شرح</th><th>حساب</th><th>بدهکار</th><th>بستانکار</th></tr></thead><tbody>${detail||'<tr><td colspan="5">بدون گردش</td></tr>'}</tbody></table></div></div>`;
  }
  async exportReports() {
    try {
      const r = await Ledger.financialReports();
      const esc = v => '"'+String(v??'').replace(/"/g,'""')+'"';
      const csv = [['date','description','account_code','account_name','debit_irr','credit_irr'],...r.detail.map(x=>[x.date,x.description,x.code,x.name,x.debit,x.credit])].map(a=>a.map(esc).join(',')).join('\r\n');
      const blob = new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='factor-easypro-ledger.csv';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
    } catch(error) { Toast.error(error.message); }
  }
  setTrialPeriod(id) { this.selectedTrialPeriod = id; return this.refresh(); }
  openPeriodModal() {
    const body = `<div class="form-group"><label class="form-label">نام دوره</label>
      <input id="acPeriodName" class="form-control" value="سال مالی جدید"></div>
      <div class="form-row"><div class="form-group"><label class="form-label">از تاریخ شمسی</label>
        <input id="acPeriodStart" class="form-control" placeholder="1405/01/01"></div>
        <div class="form-group"><label class="form-label">تا تاریخ شمسی</label>
        <input id="acPeriodEnd" class="form-control" placeholder="1405/12/29"></div></div>`;
    const footer = '<button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button><button class="btn" onclick="window.AccountingView.savePeriod()">ذخیره دوره</button>';
    Modal.open({ title: 'دوره مالی جدید', body, footer, size: 'sm', closeOnBackdrop: false });
  }
  async savePeriod() {
    if (this.busy) return;
    this.busy = true;
    try {
      await Ledger.createPeriod({
        name: document.getElementById('acPeriodName').value,
        startDate: digits(document.getElementById('acPeriodStart').value).trim(),
        endDate: digits(document.getElementById('acPeriodEnd').value).trim()
      });
      Modal.close();
      Toast.success('دوره مالی ایجاد شد');
      await this.refresh();
    } catch (error) { Toast.error(error.message); }
    finally { this.busy = false; }
  }
  closePeriod(id) {
    Modal.confirm({ title: 'بستن دوره مالی', danger: true,
      message: 'بعد از بستن، ثبت یا برگشت سند در این دوره مجاز نیست. ابتدا پشتیبان تهیه کرده و پیش‌نویس‌ها را تعیین تکلیف کنید.',
      confirmText: 'بستن قطعی دوره', onConfirm: async () => {
        try {
          await Ledger.closePeriod(id);
          Toast.success('دوره مالی بسته شد');
          await this.refresh();
        } catch (error) { Toast.error(error.message); }
      }
    });
  }
  seedChart() {
    Modal.confirm({ title: 'ایجاد کدینگ پیشنهادی', message:
      'سرفصل‌های پایه نمونه به شرکت فعال اضافه می‌شوند؛ حساب‌های قبلی حذف یا تغییر نمی‌کنند. ادامه می‌دهید؟',
      onConfirm: async () => {
        try {
          const r = await Ledger.seedDefaultChart();
          Toast.success(`${r.added} سرفصل جدید ایجاد شد`);
          await this.refresh();
        } catch (error) { Toast.error(error.message); }
      }
    });
  }
  openAccountModal() {
    const parents = this.accounts.map(a => `<option value="${html(a.code)}">${html(a.code + ' — ' + a.name)}</option>`).join('');
    const levelOptions = ACCOUNT_LEVELS.map(l => `<option value="${l}">${levelNames[l]}</option>`).join('');
    const typeOptions = ACCOUNT_TYPES.map(t => `<option value="${t}">${typeNames[t]}</option>`).join('');
    const body = `<div class="form-row"><div class="form-group"><label class="form-label">کد حساب</label>
      <input class="form-control" id="acCode" inputmode="text"></div>
      <div class="form-group"><label class="form-label">عنوان</label>
      <input class="form-control" id="acName"></div></div>
      <div class="form-row"><div class="form-group"><label class="form-label">سطح</label>
      <select class="form-control" id="acLevel" onchange="window.AccountingView.toggleParent()">${levelOptions}</select></div>
      <div class="form-group"><label class="form-label">ماهیت</label>
      <select class="form-control" id="acType">${typeOptions}</select></div></div>
      <div class="form-group" id="acParentGroup" style="display:none"><label class="form-label">کد حساب والد</label>
      <select class="form-control" id="acParent"><option value="">انتخاب والد</option>${parents}</select></div>`;
    const footer = '<button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button><button class="btn" onclick="window.AccountingView.saveAccount()">ثبت حساب</button>';
    Modal.open({ title: 'حساب جدید', body, footer, size: 'sm', closeOnBackdrop: false });
  }
  toggleParent() {
    document.getElementById('acParentGroup').style.display = document.getElementById('acLevel').value === 'group' ? 'none' : '';
  }
  async saveAccount() {
    if (this.busy) return;
    this.busy = true;
    try {
      await Ledger.addAccount({
        code: digits(document.getElementById('acCode').value).trim(),
        name: document.getElementById('acName').value.trim(),
        level: document.getElementById('acLevel').value,
        type: document.getElementById('acType').value,
        parentCode: document.getElementById('acLevel').value === 'group' ? null : document.getElementById('acParent').value
      });
      Modal.close();
      Toast.success('حساب اضافه شد');
      await this.refresh();
    } catch (error) { Toast.error(error.message); }
    finally { this.busy = false; }
  }
  accountOptions(selected = '') {
    const postable = this.accounts.filter(a => a.level !== 'group' && a.active !== false && a.postable !== false &&
      !this.accounts.some(child => child.parentCode === a.code));
    return '<option value="">انتخاب حساب</option>' + postable.map(a => `<option value="${html(a.id)}" ${a.id === selected ? 'selected' : ''}>${html(a.code + ' — ' + a.name)}</option>`).join('');
  }
  journalRow(line = {}) {
    return `<tr class="ac-journal-line">
      <td><select class="form-control ac-line-account">${this.accountOptions(line.accountId)}</select></td>
      <td><input class="form-control ac-line-debit" inputmode="text" placeholder="۰" value="${html(line.debit ?? '0')}"></td>
      <td><input class="form-control ac-line-credit" inputmode="text" placeholder="۰" value="${html(line.credit ?? '0')}"></td>
      <td><input class="form-control ac-line-note" value="${html(line.description || '')}"></td>
      <td><button class="btn btn-secondary" onclick="this.closest('tr').remove()">حذف</button></td>
    </tr>`;
  }
  async openJournalModal(id = null) {
    if (!this.periods.some(p => !p.closed)) {
      Toast.warning('ابتدا یک دوره مالی باز تعریف کنید');
      return;
    }
    if (!this.accounts.some(a => a.level !== 'group')) {
      Toast.warning('ابتدا کدینگ حسابداری را تعریف کنید');
      return;
    }
    try {
      const draft = id ? await Ledger.getJournal(id) : null;
      if (draft && draft.status !== 'draft') throw new Error('تنها اسناد پیش‌نویس قابل ویرایش‌اند');
      const periods = this.periods.filter(p => !p.closed);
      const selected = draft?.periodId || periods.find(p => safeDate() >= p.startDate && safeDate() <= p.endDate)?.id || periods[0].id;
      const options = periods.map(p => `<option value="${html(p.id)}" ${p.id === selected ? 'selected' : ''}>${html(p.name)}</option>`).join('');
      const body = `<input id="acDraftId" type="hidden" value="${html(id || '')}">
        <div class="form-row"><div class="form-group"><label class="form-label">دوره مالی</label>
          <select id="acJournalPeriod" class="form-control">${options}</select></div>
          <div class="form-group"><label class="form-label">تاریخ شمسی</label>
          <input id="acJournalDate" class="form-control" value="${html(draft?.date || safeDate())}"></div></div>
        <div class="form-group"><label class="form-label">شرح سند</label>
          <input id="acJournalDescription" class="form-control" value="${html(draft?.description || '')}"></div>
        <div class="table-wrap"><table><thead><tr><th>حساب</th><th>بدهکار (ریال)</th>
          <th>بستانکار (ریال)</th><th>شرح ردیف</th><th>عملیات</th></tr></thead>
          <tbody id="acJournalLines">${(draft?.lines?.length ? draft.lines : [{}, {}]).map(l => this.journalRow(l)).join('')}</tbody>
        </table></div><button class="btn btn-secondary" style="margin-top:10px" onclick="window.AccountingView.addJournalRow()">افزودن ردیف</button>
        <p style="font-size:12px;color:var(--text-muted);margin-top:10px">مبالغ باید عدد صحیح به ریال باشند. پیش‌نویس می‌تواند نامتوازن باشد؛ سند قطعی باید تراز شود.</p>`;
      const footer = `<button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
        <button class="btn btn-secondary" onclick="window.AccountingView.saveJournal('draft')">ذخیره پیش‌نویس</button>
        <button class="btn" onclick="window.AccountingView.saveJournal('posted')">ثبت قطعی</button>`;
      Modal.open({ title: id ? 'ویرایش پیش‌نویس' : 'سند حسابداری دستی', body, footer, size: 'lg', closeOnBackdrop: false });
    } catch (error) { Toast.error(error.message); }
  }
  addJournalRow() {
    document.getElementById('acJournalLines')?.insertAdjacentHTML('beforeend', this.journalRow());
  }
  readJournalForm() {
    const lines = [...document.querySelectorAll('#acJournalLines .ac-journal-line')].map(row => ({
      accountId: row.querySelector('.ac-line-account').value,
      debit: rial(row.querySelector('.ac-line-debit').value),
      credit: rial(row.querySelector('.ac-line-credit').value),
      description: row.querySelector('.ac-line-note').value.trim()
    }));
    return {
      periodId: document.getElementById('acJournalPeriod').value,
      date: digits(document.getElementById('acJournalDate').value).trim(),
      description: document.getElementById('acJournalDescription').value.trim(),
      lines
    };
  }
  async saveJournal(mode) {
    if (this.busy) return;
    this.busy = true;
    try {
      const draftId = document.getElementById('acDraftId').value;
      const data = this.readJournalForm();
      if (draftId) {
        await Ledger.updateDraftJournal(draftId, data, { post: mode === 'posted' });
      } else if (mode === 'posted') {
        await Ledger.postJournal(data);
      } else {
        await Ledger.saveDraftJournal(data);
      }
      Modal.close();
      Toast.success(mode === 'posted' ? 'سند حسابداری قطعی شد' : 'پیش‌نویس ذخیره شد');
      await this.refresh();
    } catch (error) { Toast.error('خطای ثبت سند: ' + error.message); }
    finally { this.busy = false; }
  }
  deleteDraft(id) {
    Modal.confirm({ title: 'حذف پیش‌نویس', danger: true,
      message: 'فقط سند پیش‌نویس و ردیف‌های آن حذف می‌شوند. سند قطعی هرگز از این مسیر حذف نخواهد شد.',
      confirmText: 'حذف پیش‌نویس', onConfirm: async () => {
        try {
          await Ledger.discardDraftJournal(id);
          Toast.success('پیش‌نویس حذف شد');
          await this.refresh();
        } catch (error) { Toast.error(error.message); }
      }
    });
  }
  async postDraft(id) {
    Modal.confirm({ title: 'قطعی‌سازی سند', message: 'پس از قطعی شدن امکان ویرایش مستقیم وجود ندارد. ادامه می‌دهید؟',
      confirmText: 'ثبت قطعی', onConfirm: async () => {
        try {
          await Ledger.postDraftJournal(id);
          Toast.success('سند قطعی شد');
          await this.refresh();
        } catch (error) { Toast.error(error.message); }
      }
    });
  }
  async showJournal(id) {
    try {
      const j = await Ledger.getJournal(id);
      const lines = j.lines.map(l => {
        const a = this.accounts.find(x => x.id === l.accountId);
        return `<tr><td>${html(a ? a.code + ' — ' + a.name : l.accountId)}</td>
          <td>${Formatters.number(l.debit)}</td><td>${Formatters.number(l.credit)}</td><td>${html(l.description)}</td></tr>`;
      }).join('');
      Modal.open({ title: 'جزئیات سند حسابداری', size: 'lg',
        body: `<p style="margin-bottom:10px">تاریخ: ${html(j.date)} | وضعیت: ${html(j.status)} | شرح: ${html(j.description)}</p>
          <div class="table-wrap"><table><thead><tr><th>حساب</th><th>بدهکار</th><th>بستانکار</th><th>شرح</th></tr></thead>
          <tbody>${lines}</tbody><tfoot><tr><th>جمع</th><th>${Formatters.number(j.debit)}</th><th>${Formatters.number(j.credit)}</th><th></th></tr></tfoot></table></div>`,
        footer: '<button class="btn btn-secondary" onclick="FINORA.Modal.close()">بستن</button>'
      });
    } catch (error) { Toast.error(error.message); }
  }
  async renderIntegration() {
    const active = await Retail.isEnabled();
    if (!active) return `<div class="card">
      <h3>اتصال یکپارچه خرید، فروش و حسابداری</h3>
      <p style="line-height:2;margin:12px 0">فعال‌سازی فقط برای شرکت بدون گردش مالی قبلی مجاز است. اگر شرکت سابقه فاکتور، انبار یا خزانه دارد، ابتدا مانده افتتاحیه و مهاجرت آن باید تأیید شود. داده‌های قبلی پاک یا تبدیل خودکار نمی‌شوند.</p>
      <p style="line-height:2;margin-bottom:14px">پیش از فعال‌سازی، دوره مالی باز بسازید و دکمه «ایجاد کدینگ پیشنهادی» را از تب کدینگ اجرا کنید.</p>
      <button class="btn" onclick="window.AccountingView.activateRetail()">فعال‌سازی حسابداری یکپارچه برای شرکت خالی</button></div>`;
    const [warehouses, balances, stocktakes, products] = await Promise.all([
      Retail.warehouses(),Retail.stockBalances(),Retail.getStocktakes(),DataScope.list('products')
    ]);
    const names = Object.fromEntries(products.map(p=>[p.id,p.name]));
    const warehouseNames = Object.fromEntries(warehouses.map(w=>[w.id,w.name]));
    const stockRows = balances.map(b=>`<tr><td>${html(names[b.productId]||b.productId)}</td>
      <td>${html(warehouseNames[b.warehouseId]||b.warehouseId)}</td>
      <td>${Formatters.number(b.quantityUnits/1000)}</td><td>${Formatters.number(b.value)} ریال</td></tr>`).join('');
    const takeRows=stocktakes.map(s=>`<tr><td>${html(warehouseNames[s.warehouseId]||s.warehouseId)}</td>
      <td>${html(s.date)}</td><td>${s.status==='draft'?'در انتظار شمارش':'قطعی'}</td>
      <td><button class="btn btn-secondary" onclick="window.AccountingView.openStocktake('${html(s.id)}')">مشاهده و شمارش</button></td></tr>`).join('');
    return `<div class="card"><div class="toolbar"><strong>حسابداری یکپارچه فعال است</strong>
      <button class="btn" onclick="window.AccountingView.openWarehouse()">انبار جدید</button>
      <button class="btn btn-secondary" onclick="window.AccountingView.openTransfer()">انتقال کالا</button>
      <button class="btn" onclick="window.AccountingView.openStocktakeCreate()">انبارگردانی جدید</button></div>
      <p style="margin:10px 0">فاکتور جدید، دریافت و پرداخت، هزینه و چک به دفتر حسابداری متصل‌اند. تغییر اسناد قطعی فقط با فرآیند اصلاح و برگشت مجاز است.</p>
      <h4>موجودی و ارزش انبار</h4><div class="table-wrap"><table><thead><tr><th>کالا</th><th>انبار</th><th>مقدار</th><th>ارزش (ریال)</th></tr></thead>
      <tbody>${stockRows||'<tr><td colspan="4">موجودی ثبت نشده است.</td></tr>'}</tbody></table></div>
      <h4 style="margin-top:16px">جلسات انبارگردانی</h4><div class="table-wrap"><table><thead><tr><th>انبار</th><th>تاریخ</th><th>وضعیت</th><th>عملیات</th></tr></thead>
      <tbody>${takeRows||'<tr><td colspan="4">جلسه‌ای وجود ندارد.</td></tr>'}</tbody></table></div></div>`;
  }
  activateRetail() {
    Modal.confirm({title:'فعال‌سازی ثبت مالی یکپارچه',danger:true,
      message:'این کار گردش جدید فروش، خرید، خزانه و انبار را به حسابداری دوبل متصل می‌کند. شرکت دارای گردش قبلی بدون مهاجرت تأییدشده فعال نمی‌شود. ابتدا نسخه پشتیبان بگیرید.',
      confirmText:'فعال‌سازی برای شرکت خالی',
      onConfirm:async()=>{
        try{await Retail.activate();Toast.success('ثبت یکپارچه فعال شد');await this.refresh()}
        catch(e){Toast.error(e.message)}
      }});
  }
  openWarehouse() {
    Modal.open({title:'ایجاد انبار',size:'sm',closeOnBackdrop:false,
      body:'<label class="form-label">نام انبار</label><input id="acWhName" class="form-control">',
      footer:'<button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button><button class="btn" onclick="window.AccountingView.saveWarehouse()">ثبت انبار</button>'});
  }
  async saveWarehouse() {
    if(this.busy)return;this.busy=true;
    try{await Retail.addWarehouse(document.getElementById('acWhName').value);
      Modal.close();Toast.success('انبار ایجاد شد');await this.refresh()}
    catch(e){Toast.error(e.message)}finally{this.busy=false}
  }
  async openTransfer() {
    try {
      const [warehouses,products]=await Promise.all([Retail.warehouses(),DataScope.list('products')]);
      if(warehouses.length<2){Toast.warning('برای انتقال کالا حداقل دو انبار لازم است');return}
      const opts=warehouses.map(w=>`<option value="${html(w.id)}">${html(w.name)}</option>`).join('');
      const prod=products.filter(p=>p.trackInventory!==false)
        .map(p=>`<option value="${html(p.id)}">${html(p.name)}</option>`).join('');
      Modal.open({title:'انتقال کالا بین انبارها',size:'sm',closeOnBackdrop:false,
        body:`<div class="form-group"><label class="form-label">کالا</label><select class="form-control" id="acTrProduct">${prod}</select></div>
          <div class="form-group"><label class="form-label">انبار مبدا</label><select class="form-control" id="acTrFrom">${opts}</select></div>
          <div class="form-group"><label class="form-label">انبار مقصد</label><select class="form-control" id="acTrTo">${opts}</select></div>
          <div class="form-group"><label class="form-label">مقدار</label><input id="acTrQty" class="form-control" value="1"></div>
          <div class="form-group"><label class="form-label">تاریخ</label><input id="acTrDate" class="form-control" value="${safeDate()}"></div>`,
        footer:'<button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button><button class="btn" onclick="window.AccountingView.saveTransfer()">ثبت انتقال</button>'});
    }catch(e){Toast.error(e.message)}
  }
  async saveTransfer() {
    if(this.busy)return;this.busy=true;
    try {
      await Retail.transferStock({
        productId:document.getElementById('acTrProduct').value,
        fromWarehouseId:document.getElementById('acTrFrom').value,
        toWarehouseId:document.getElementById('acTrTo').value,
        quantity:Number(digits(document.getElementById('acTrQty').value)),
        date:digits(document.getElementById('acTrDate').value)});
      Modal.close();Toast.success('انتقال انبار ثبت شد');await this.refresh();
    }catch(e){Toast.error(e.message)}finally{this.busy=false}
  }
  async openStocktakeCreate() {
    try {
      const warehouses=await Retail.warehouses();
      const options=warehouses.map(w=>`<option value="${html(w.id)}">${html(w.name)}</option>`).join('');
      Modal.open({title:'شروع شمارش انبار',size:'sm',closeOnBackdrop:false,
        body:`<label class="form-label">انبار</label><select class="form-control" id="acStWarehouse">${options}</select>
          <label class="form-label">تاریخ شمسی</label><input class="form-control" id="acStDate" value="${safeDate()}">
          <p style="margin-top:12px">موجودی مبنا ثابت ثبت می‌شود؛ برای تأیید، شمارش همه اقلام ضروری است.</p>`,
        footer:'<button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button><button class="btn" onclick="window.AccountingView.createStocktake()">ایجاد جلسه</button>'});
    }catch(e){Toast.error(e.message)}
  }
  async createStocktake() {
    if(this.busy)return;this.busy=true;
    try {
      const take=await Retail.newStocktake({warehouseId:document.getElementById('acStWarehouse').value,
        date:digits(document.getElementById('acStDate').value)});
      Modal.close();Toast.success('جلسه شمارش ایجاد شد');await this.refresh();await this.openStocktake(take.id);
    }catch(e){Toast.error(e.message)}finally{this.busy=false}
  }
  async openStocktake(id) {
    try {
      const sessions=await Retail.getStocktakes(),take=sessions.find(s=>s.id===id);
      if(!take)throw Error('جلسه شمارش یافت نشد');
      const lines=await Retail.getStocktakeLines(id),products=await DataScope.list('products');
      const names=Object.fromEntries(products.map(p=>[p.id,p.name]));
      const extras=products.filter(p=>p.trackInventory!==false&&!lines.some(l=>l.productId===p.id));
      const extraOptions=extras.map(p=>`<option value="${html(p.id)}">${html(p.name)}</option>`).join('');
      const existing=lines.map(l=>`<tr data-product="${html(l.productId)}">
        <td>${html(names[l.productId]||l.productId)}</td><td>${l.expectedUnits/1000}</td>
        <td><input class="form-control ac-count" value="${l.countedUnits===null?'':l.countedUnits/1000}" ${take.status!=='draft'?'disabled':''}></td>
        <td><input class="form-control ac-cost" placeholder="ریال" value="${l.unitCost??''}" ${take.status!=='draft'?'disabled':''}></td></tr>`).join('');
      Modal.open({title:'برگه انبارگردانی',size:'lg',closeOnBackdrop:false,
        body:`<input type="hidden" id="acStocktakeId" value="${html(id)}">
          <p style="margin-bottom:10px">مقدار شمارش واقعی و در صورت مازاد کالای بدون مانده، قیمت تمام‌شده واحد را وارد کنید.</p>
          <div class="table-wrap"><table><thead><tr><th>کالا</th><th>مبنای سیستم</th><th>شمارش واقعی</th><th>بهای واحد مازاد</th></tr></thead>
          <tbody id="acTakeRows">${existing}</tbody></table></div>
          ${take.status==='draft'&&extras.length?`<div style="display:flex;gap:8px;margin-top:12px;align-items:center">
            <select class="form-control" id="acTakeNewProduct">${extraOptions}</select>
            <button class="btn btn-secondary" onclick="window.AccountingView.addStocktakeProduct()">افزودن کالای جدید به شمارش</button>
          </div>`:''}`,
        footer:take.status==='draft'?'<button class="btn btn-secondary" onclick="FINORA.Modal.close()">بستن</button><button class="btn" onclick="window.AccountingView.saveStocktake()">ذخیره شمارش</button><button class="btn btn-secondary" onclick="window.AccountingView.finishStocktake()">تأیید نهایی</button>':
        '<button class="btn btn-secondary" onclick="FINORA.Modal.close()">بستن</button>'});
    }catch(e){Toast.error(e.message)}
  }
  addStocktakeProduct() {
    const selector=document.getElementById('acTakeNewProduct');
    if(!selector?.value)return;
    const id=selector.value;
    const label=selector.selectedOptions[0]?.textContent||id;
    const body=document.getElementById('acTakeRows');
    if(!body||body.querySelector('[data-product="'+id+'"]'))return;
    body.insertAdjacentHTML('beforeend',`<tr data-product="${html(id)}">
      <td>${html(label)}</td><td>۰</td>
      <td><input class="form-control ac-count" value="0"></td>
      <td><input class="form-control ac-cost" placeholder="ریال"></td></tr>`);
    selector.selectedOptions[0]?.remove();
  }
  async persistStocktakeCounts(id) {
    for(const row of document.querySelectorAll('#acTakeRows tr[data-product]')){
      const count=digits(row.querySelector('.ac-count').value).trim();
      const cost=digits(row.querySelector('.ac-cost').value).trim();
      if(!count)throw Error('برای همه اقلام مقدار شمارش را وارد کنید');
      await Retail.countStocktake(id,row.dataset.product,Number(count),cost?Number(cost):null);
    }
  }
  async saveStocktake() {
    if(this.busy)return;this.busy=true;
    try {
      const id=document.getElementById('acStocktakeId').value;
      await this.persistStocktakeCounts(id);
      Modal.close();Toast.success('شمارش ثبت شد');await this.refresh();
    }catch(e){Toast.error(e.message)}finally{this.busy=false}
  }
  async finishStocktake() {
    if(this.busy)return;this.busy=true;
    try {
      const id=document.getElementById('acStocktakeId').value;
      await this.persistStocktakeCounts(id);
      await Retail.finalizeStocktake(id);
      Modal.close();Toast.success('انبارگردانی تأیید و سند تعدیل ثبت شد');await this.refresh();
    }catch(e){Toast.error(e.message)}finally{this.busy=false}
  }
  openReversal(id) {
    const periods = this.periods.filter(p => !p.closed);
    if (!periods.length) { Toast.error('دوره باز برای ثبت سند برگشت وجود ندارد'); return; }
    const opts = periods.map(p => `<option value="${html(p.id)}">${html(p.name)}</option>`).join('');
    Modal.open({ title: 'ثبت سند معکوس', size: 'sm', closeOnBackdrop: false,
      body: `<input type="hidden" id="acReversalId" value="${html(id)}">
        <p style="font-size:12px;margin-bottom:10px">این عملیات سندی جداگانه با بدهکار/بستانکار معکوس می‌سازد و سند اصلی حذف نمی‌شود.</p>
        <div class="form-group"><label class="form-label">دوره باز</label>
          <select class="form-control" id="acReversalPeriod">${opts}</select></div>
        <div class="form-group"><label class="form-label">تاریخ برگشت</label>
          <input class="form-control" id="acReversalDate" value="${html(safeDate())}"></div>`,
      footer: '<button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button><button class="btn" onclick="window.AccountingView.saveReversal()">ثبت سند برگشت</button>'
    });
  }
  async saveReversal() {
    if (this.busy) return;
    this.busy = true;
    try {
      await Ledger.reverseJournal(document.getElementById('acReversalId').value, {
        periodId: document.getElementById('acReversalPeriod').value,
        date: digits(document.getElementById('acReversalDate').value).trim()
      });
      Modal.close();
      Toast.success('سند برگشت مستقل ثبت شد');
      await this.refresh();
    } catch (error) { Toast.error(error.message); }
    finally { this.busy = false; }
  }
}

export const AccountingView = new AccountingViewImpl();
