// ============================================================
// SettingsView — صفحه‌ی تنظیمات، بکاپ و شرکت
// ============================================================

import { SettingsController } from '../controllers/SettingsController.js';
import { StorageService } from '../core/StorageService.js';
import { Theme } from '../core/Theme.js';
import { Modal } from '../core/Modal.js';
import { Toast } from '../core/Toast.js';
import { Formatters } from '../utils/Formatters.js';
import { Auth } from '../core/Auth.js';

let cache = { company: {}, stats: {} };

class SettingsViewImpl {
  async render() {
    await this.reload();
    return `
      <div class="page-title">
        <h2>تنظیمات</h2>
        <p>مدیریت اطلاعات شرکت، پشتیبان‌گیری و تنظیمات سیستم</p>
      </div>

      <div class="settings-grid">
        ${this._renderCompanyCard()}
        ${this._renderBackupCard()}
        ${this._renderStatsCard()}
        ${this._renderThemeCard()}
        ${this._renderAboutCard()}
      </div>
    `;
  }

  onMount() {
    window.SettingsView = this;
  }

  async reload() {
    cache.company = await SettingsController.getCompanyInfo();
    cache.stats = await this._collectStats();
  }

  async _collectStats() {
    const user = Auth.current();
    if (!user) return {};
    const stores = ['products', 'contacts', 'invoices', 'cheques', 'treasury'];
    const stats = {};
    for (const s of stores) {
      try {
        const list = await StorageService.getByOwner(s, user.id);
        if (s === 'treasury') {
          stats.accounts = list.filter(x => x.recordType === 'account').length;
          stats.transactions = list.filter(x => x.recordType === 'transaction').length;
        } else {
          stats[s] = list.length;
        }
      } catch (e) {
        stats[s] = 0;
      }
    }
    return stats;
  }

  // ============================================================
  // کارت اطلاعات شرکت
  // ============================================================
  _renderCompanyCard() {
    const c = cache.company;
    return `
      <div class="card settings-card">
        <div class="settings-card-header">
          <div class="settings-card-icon">🏢</div>
          <div>
            <h3 class="settings-card-title">اطلاعات شرکت / فروشگاه</h3>
            <p class="settings-card-desc">این اطلاعات در سربرگ فاکتورهای چاپی نمایش داده می‌شود</p>
          </div>
        </div>
        ${c.name ? `
          <div class="company-preview">
            <div style="font-weight:700;font-size:14px">${this._esc(c.name)}</div>
            ${c.nationalId ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:3px">شناسه ملی: ${Formatters.toPersianDigits(c.nationalId)}</div>` : ''}
            ${c.address ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${this._esc(c.address)}</div>` : ''}
            ${c.phone ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">تلفن: ${Formatters.phone(c.phone)}</div>` : ''}
          </div>
        ` : `
          <div class="empty-mini">هنوز اطلاعاتی وارد نشده</div>
        `}
        <button class="btn" onclick="window.SettingsView.openCompanyModal()">
          ${c.name ? '✏️ ویرایش اطلاعات' : '➕ وارد کردن اطلاعات'}
        </button>
      </div>
    `;
  }

  // ============================================================
  // کارت بکاپ
  // ============================================================
  _renderBackupCard() {
    return `
      <div class="card settings-card" style="border-color:#bfdbfe;background:linear-gradient(135deg,#eff6ff,#f8fafc)">
        <div class="settings-card-header">
          <div class="settings-card-icon" style="background:linear-gradient(135deg,#3b82f6,#1e40af)">💾</div>
          <div>
            <h3 class="settings-card-title">پشتیبان‌گیری و بازیابی</h3>
            <p class="settings-card-desc">از داده‌های خود نسخه‌ی پشتیبان بگیرید تا در صورت نیاز بازیابی کنید</p>
          </div>
        </div>

        <div class="backup-warning">
          ⚠️ <strong>مهم:</strong> قبل از هر تغییر بزرگ در برنامه، حتماً بکاپ بگیرید.
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
          <button class="btn" onclick="window.SettingsView.downloadBackup()">
            📥 دانلود فایل بکاپ
          </button>
          <button class="btn btn-secondary" onclick="window.SettingsView.openRestoreModal()">
            📤 بازیابی از بکاپ
          </button>
        </div>

        <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--border)">
          <button class="btn btn-danger btn-inline" style="font-size:12px;min-height:34px" onclick="window.SettingsView.openWipeModal()">
            🗑️ پاک کردن کامل داده‌ها
          </button>
          <small style="color:var(--text-muted);font-size:11px;display:block;margin-top:6px">این عمل قابل بازگشت نیست، حتماً قبلش بکاپ بگیرید</small>
        </div>
      </div>
    `;
  }

  // ============================================================
  // کارت آمار
  // ============================================================
  _renderStatsCard() {
    const s = cache.stats;
    const items = [
      { label: 'کالا و خدمات', value: s.products || 0, icon: '📦' },
      { label: 'اشخاص', value: s.contacts || 0, icon: '👥' },
      { label: 'فاکتورها', value: s.invoices || 0, icon: '🧾' },
      { label: 'چک‌ها', value: s.cheques || 0, icon: '💳' },
      { label: 'حساب‌ها', value: s.accounts || 0, icon: '🏦' },
      { label: 'تراکنش‌ها', value: s.transactions || 0, icon: '💸' }
    ];
    return `
      <div class="card settings-card">
        <div class="settings-card-header">
          <div class="settings-card-icon" style="background:linear-gradient(135deg,#0ea5e9,#0369a1)">📊</div>
          <div>
            <h3 class="settings-card-title">آمار داده‌ها</h3>
            <p class="settings-card-desc">خلاصه‌ی داده‌های ذخیره‌شده در سیستم</p>
          </div>
        </div>
        <div class="stats-grid">
          ${items.map(i => `
            <div class="stat-mini">
              <div style="font-size:18px;margin-bottom:4px">${i.icon}</div>
              <div style="font-size:18px;font-weight:800;color:var(--primary)">${Formatters.number(i.value)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${i.label}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ============================================================
  // کارت تم
  // ============================================================
  _renderThemeCard() {
    const current = Theme.current();
    return `
      <div class="card settings-card">
        <div class="settings-card-header">
          <div class="settings-card-icon" style="background:linear-gradient(135deg,#8b5cf6,#6d28d9)">🎨</div>
          <div>
            <h3 class="settings-card-title">ظاهر و تم</h3>
            <p class="settings-card-desc">حالت نمایش برنامه</p>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="btn ${current === 'light' ? '' : 'btn-secondary'}" onclick="window.SettingsView.setTheme('light')">☀️ روشن</button>
          <button class="btn ${current === 'dark' ? '' : 'btn-secondary'}" onclick="window.SettingsView.setTheme('dark')">🌙 تاریک</button>
        </div>
      </div>
    `;
  }

  // ============================================================
  // کارت درباره
  // ============================================================
  _renderAboutCard() {
    return `
      <div class="card settings-card">
        <div class="settings-card-header">
          <div class="settings-card-icon">ℹ️</div>
          <div>
            <h3 class="settings-card-title">درباره فینورا پرو</h3>
            <p class="settings-card-desc">نسخه ۰.۱.۰</p>
          </div>
        </div>
        <div style="font-size:13px;line-height:1.9;color:var(--text-muted)">
          <div><strong>طراح و توسعه‌دهنده:</strong> داوود مهربان</div>
          <div><strong>تماس:</strong> <span dir="ltr">0912-437-6991</span></div>
          <div style="margin-top:8px;padding-top:10px;border-top:1px dashed var(--border)">
            <a href="https://wa.me/989124376991" target="_blank" class="btn btn-inline" style="background:linear-gradient(135deg,#25D366,#128C7E);font-size:12.5px;min-height:36px">💬 واتس‌اپ پشتیبانی</a>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================
  // فرم اطلاعات شرکت
  // ============================================================
  openCompanyModal() {
    const c = cache.company;
    const body = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">نوع شخص</label>
          <select class="form-control" id="coEntityType">
            <option value="legal" ${c.entityType === 'legal' ? 'selected' : ''}>حقوقی</option>
            <option value="natural" ${c.entityType === 'natural' ? 'selected' : ''}>حقیقی</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">نام شرکت / فروشگاه <span class="req">*</span></label>
          <input type="text" class="form-control" id="coName" value="${this._esc(c.name)}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">شناسه ملی / کد ملی</label>
          <input type="text" class="form-control" id="coNationalId" value="${this._esc(c.nationalId)}" />
        </div>
        <div class="form-group">
          <label class="form-label">کد اقتصادی</label>
          <input type="text" class="form-control" id="coEconomicCode" value="${this._esc(c.economicCode)}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">شماره ثبت</label>
          <input type="text" class="form-control" id="coRegNumber" value="${this._esc(c.regNumber)}" />
        </div>
        <div class="form-group">
          <label class="form-label">کد پستی</label>
          <input type="text" class="form-control" id="coPostalCode" value="${this._esc(c.postalCode)}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">تلفن</label>
          <input type="tel" class="form-control" id="coPhone" value="${this._esc(c.phone)}" />
        </div>
        <div class="form-group">
          <label class="form-label">موبایل</label>
          <input type="tel" class="form-control" id="coMobile" value="${this._esc(c.mobile)}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">نشانی</label>
        <textarea class="form-control" id="coAddress" rows="2">${this._esc(c.address)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">پاورقی فاکتور</label>
        <textarea class="form-control" id="coFooter" rows="2" placeholder="مثلاً: از خرید شما سپاسگزاریم">${this._esc(c.footer)}</textarea>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn" onclick="window.SettingsView.saveCompany()">💾 ذخیره</button>
    `;
    Modal.open({ title: 'اطلاعات شرکت', body, footer, size: 'md' });
  }

  async saveCompany() {
    const data = {
      name: document.getElementById('coName').value,
      entityType: document.getElementById('coEntityType').value,
      nationalId: document.getElementById('coNationalId').value,
      economicCode: document.getElementById('coEconomicCode').value,
      regNumber: document.getElementById('coRegNumber').value,
      postalCode: document.getElementById('coPostalCode').value,
      phone: document.getElementById('coPhone').value,
      mobile: document.getElementById('coMobile').value,
      address: document.getElementById('coAddress').value,
      footer: document.getElementById('coFooter').value
    };
    if (!data.name.trim()) { Toast.warning('نام الزامی است'); return; }
    try {
      await SettingsController.saveCompanyInfo(data);
      Toast.success('اطلاعات ذخیره شد');
      Modal.close();
      await this.reload();
      document.querySelector('.settings-grid').outerHTML = `<div class="settings-grid">${this._renderCompanyCard()}${this._renderBackupCard()}${this._renderStatsCard()}${this._renderThemeCard()}${this._renderAboutCard()}</div>`;
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  // ============================================================
  // بکاپ
  // ============================================================
  async downloadBackup() {
    try {
      Toast.info('در حال آماده‌سازی بکاپ...');
      const result = await SettingsController.downloadBackup();
      Toast.success(`بکاپ دانلود شد (${result.filename})`, 'موفق');
    } catch (err) {
      Toast.error('خطا در بکاپ: ' + err.message);
    }
  }

  openRestoreModal() {
    const body = `
      <div class="backup-warning" style="margin-bottom:14px">
        ⚠️ <strong>هشدار:</strong> در حالت Merge، داده‌های تکراری skip می‌شن. در حالت Replace، همه‌چیز با بکاپ جایگزین می‌شه.
      </div>

      <div class="form-group">
        <label class="form-label">فایل بکاپ (JSON)</label>
        <input type="file" class="form-control" id="restoreFile" accept=".json,application/json" />
      </div>

      <div class="form-group">
        <label class="form-label">حالت بازیابی</label>
        <select class="form-control" id="restoreMode">
          <option value="merge">🔀 ادغام (Merge) — داده‌های جدید اضافه می‌شن</option>
          <option value="replace">🔄 جایگزینی (Replace) — همه‌چیز با بکاپ عوض می‌شه</option>
        </select>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn" onclick="window.SettingsView.restoreBackup()">📤 بازیابی</button>
    `;
    Modal.open({ title: 'بازیابی از بکاپ', body, footer, size: 'md' });
  }

  async restoreBackup() {
    const fileInput = document.getElementById('restoreFile');
    const file = fileInput.files[0];
    if (!file) { Toast.warning('فایل بکاپ رو انتخاب کنید'); return; }

    const mode = document.getElementById('restoreMode').value;

    try {
      Toast.info('در حال بازیابی...');
      const content = await SettingsController.readFileAsText(file);
      const counts = await SettingsController.importBackup(content, { mode });
      Modal.close();
      Toast.success(`بازیابی انجام شد: ${counts.added} مورد اضافه، ${counts.skipped} مورد skip`);
      setTimeout(() => location.reload(), 1500);
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  // ============================================================
  // پاک کردن کامل
  // ============================================================
  openWipeModal() {
    const body = `
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:48px;margin-bottom:12px">⚠️</div>
        <h3 style="color:var(--danger);margin-bottom:8px">پاک کردن کامل داده‌ها</h3>
        <p style="color:var(--text-muted);font-size:13px;line-height:1.8;margin-bottom:16px">
          این عمل همه‌ی کالاها، اشخاص، فاکتورها، چک‌ها، تراکنش‌ها و تنظیمات رو برای همیشه پاک می‌کند.
          <br><strong>قابل بازگشت نیست!</strong>
        </p>
        <p style="font-size:12px;color:var(--danger);margin-bottom:16px">
          لطفاً برای تأیید، کلمه‌ی <code style="background:var(--danger);color:#fff;padding:2px 8px;border-radius:4px">حذف</code> رو تایپ کنید
        </p>
        <input type="text" class="form-control" id="wipeConfirm" placeholder="حذف" style="text-align:center;max-width:200px;margin:0 auto" />
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn btn-danger" onclick="window.SettingsView.confirmWipe()">🗑️ پاک کن</button>
    `;
    Modal.open({ title: 'تأیید پاک کردن', body, footer, size: 'sm' });
  }

  async confirmWipe() {
    const confirmText = document.getElementById('wipeConfirm').value.trim();
    if (confirmText !== 'حذف') {
      Toast.warning('متن تأیید اشتباه است');
      return;
    }
    try {
      await SettingsController.wipeAll();
      Toast.success('همه‌ی داده‌ها پاک شد');
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  // ============================================================
  // Theme
  // ============================================================
  setTheme(theme) {
    Theme.apply(theme);
    const grid = document.querySelector('.settings-grid');
    if (grid) {
      grid.innerHTML = this._renderCompanyCard() + this._renderBackupCard() + this._renderStatsCard() + this._renderThemeCard() + this._renderAboutCard();
    }
  }

  _esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

export const SettingsView = new SettingsViewImpl();