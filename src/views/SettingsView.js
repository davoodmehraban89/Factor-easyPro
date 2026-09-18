// ============================================================
// SettingsView — صفحه‌ی تنظیمات، بکاپ، شرکت و Excel
// ============================================================

import { SettingsController } from '../controllers/SettingsController.js';
import { StorageService } from '../core/StorageService.js';
import { Theme } from '../core/Theme.js';
import { KeyboardShortcuts } from '../core/KeyboardShortcuts.js';
import { Modal } from '../core/Modal.js';
import { Toast } from '../core/Toast.js';
import { Formatters } from '../utils/Formatters.js';
import { Auth } from '../core/Auth.js';
import { ExcelController } from '../controllers/ExcelController.js';

let cache = { company: {}, stats: {} };

class SettingsViewImpl {
  async render() {
    await this.reload();
    return `
      <div class="page-title">
        <h2>تنظیمات</h2>
        <p>مدیریت اطلاعات شرکت، پشتیبان‌گیری، Excel و تنظیمات سیستم</p>
      </div>

      <div class="settings-grid">
        ${this._renderCompanyCard()}
        ${this._renderExcelCard()}
        ${this._renderShortcutsCard()}
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
  // کارت Excel (جدید)
  // ============================================================
  _renderExcelCard() {
    const s = cache.stats;
    return `
      <div class="card settings-card" style="border-color:#bbf7d0;background:linear-gradient(135deg,#f0fdf4,#f8fafc)">
        <div class="settings-card-header">
          <div class="settings-card-icon" style="background:linear-gradient(135deg,#16a34a,#15803d)">📊</div>
          <div>
            <h3 class="settings-card-title">Excel — خروجی و ورودی</h3>
            <p class="settings-card-desc">داده‌ها را به Excel ببر یا از Excel بیار</p>
          </div>
        </div>

        <div style="font-size:12.5px;color:var(--text-muted);line-height:1.8;margin-bottom:12px;padding:10px 12px;background:rgba(255,255,255,.6);border-radius:8px">
          <strong>💡 نکته:</strong> از این بخش می‌تونی کل داده‌ها رو در یه فایل Excel بگیری، یا از یه فایل Excel (که قبلاً آماده کردی) کالا و اشخاص اضافه کنی.
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
          <button class="btn" style="background:linear-gradient(135deg,#16a34a,#15803d)" onclick="window.SettingsView.exportAllExcel()">
            📥 خروجی کامل (Excel)
          </button>
          <button class="btn btn-secondary" onclick="window.SettingsView.openExportSectionModal()">
            🎯 خروجی انتخابی
          </button>
        </div>

        <div style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--border)">
          <div style="font-size:12.5px;font-weight:700;margin-bottom:10px;color:#166534">📤 ورود از Excel</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-secondary" onclick="window.SettingsView.importProductsExcel()">
              📦 ورود کالاها
            </button>
            <button class="btn btn-secondary" onclick="window.SettingsView.importContactsExcel()">
              👥 ورود اشخاص
            </button>
          </div>
        </div>

        <div style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--border)">
          <div style="font-size:12.5px;font-weight:700;margin-bottom:10px;color:#166534">📄 قالب‌های نمونه</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-inline" style="font-size:12px;min-height:34px" onclick="window.SettingsView.downloadProductsTemplate()">
              📋 قالب کالاها
            </button>
            <button class="btn btn-secondary btn-inline" style="font-size:12px;min-height:34px" onclick="window.SettingsView.downloadContactsTemplate()">
              📋 قالب اشخاص
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async exportAllExcel() {
    try {
      Toast.info('در حال آماده‌سازی فایل Excel...');
      const result = await ExcelController.exportAll();
      Toast.success(`فایل Excel با ${Formatters.toPersianDigits(result.sheets)} شیت دانلود شد`);
    } catch (err) {
      console.error(err);
      Toast.error('خطا در خروجی: ' + err.message);
    }
  }

  openExportSectionModal() {
    const body = `
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px">کدوم بخش رو می‌خوای به Excel ببری؟</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <button class="btn btn-secondary" style="min-height:80px;flex-direction:column;gap:6px" onclick="window.SettingsView._exportSection('products')">
          <div style="font-size:22px">📦</div>
          <div style="font-size:12.5px">کالاها</div>
        </button>
        <button class="btn btn-secondary" style="min-height:80px;flex-direction:column;gap:6px" onclick="window.SettingsView._exportSection('contacts')">
          <div style="font-size:22px">👥</div>
          <div style="font-size:12.5px">اشخاص</div>
        </button>
        <button class="btn btn-secondary" style="min-height:80px;flex-direction:column;gap:6px" onclick="window.SettingsView._exportSection('invoices')">
          <div style="font-size:22px">🧾</div>
          <div style="font-size:12.5px">فاکتورها</div>
        </button>
        <button class="btn btn-secondary" style="min-height:80px;flex-direction:column;gap:6px" onclick="window.SettingsView._exportSection('cheques')">
          <div style="font-size:22px">💳</div>
          <div style="font-size:12.5px">چک‌ها</div>
        </button>
        <button class="btn btn-secondary" style="min-height:80px;flex-direction:column;gap:6px" onclick="window.SettingsView._exportSection('expenses')">
          <div style="font-size:22px">💰</div>
          <div style="font-size:12.5px">هزینه و درآمد</div>
        </button>
      </div>
    `;
    const footer = `<button class="btn btn-secondary" onclick="FINORA.Modal.close()">بستن</button>`;
    Modal.open({ title: '🎯 خروجی انتخابی به Excel', body, footer, size: 'md' });
  }

  async _exportSection(section) {
    try {
      const result = await ExcelController.exportSection(section);
      Toast.success(`فایل دانلود شد (${Formatters.number(result.count)} مورد)`);
      Modal.close();
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  // ============================================================
  // ورودی از Excel
  // ============================================================
  importProductsExcel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await this._handleImportFile(file, 'products');
    };
    input.click();
  }

  importContactsExcel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await this._handleImportFile(file, 'contacts');
    };
    input.click();
  }

  async _handleImportFile(file, kind) {
    try {
      Toast.info('در حال خواندن فایل...');
      const preview = await ExcelController.previewFile(file);

      const kindLabel = kind === 'products' ? 'کالاها' : 'اشخاص';
      const sheetsHtml = preview.sheets.map(s => `
        <div style="padding:8px 12px;background:var(--bg);border-radius:8px;margin-bottom:6px;font-size:12.5px">
          <strong>${this._esc(s.name)}</strong>
          <span style="color:var(--text-muted);margin-right:6px">(${Formatters.number(s.count)} سطر)</span>
        </div>
      `).join('');

      const body = `
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">
          فایل <strong>${this._esc(file.name)}</strong> خونده شد. شیت‌های موجود:
        </p>
        ${sheetsHtml}
        <div class="form-group" style="margin-top:14px">
          <label class="form-label">حالت ورود</label>
          <select class="form-control" id="importMode">
            <option value="merge">🔀 ادغام (Merge) — فقط موارد جدید اضافه می‌شن</option>
            <option value="replace">🔄 جایگزینی (Replace) — همه‌ی ${kindLabel} فعلی پاک و از فایل جایگزین می‌شن</option>
          </select>
        </div>
      `;
      const footer = `
        <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
        <button class="btn btn-success" onclick="window.SettingsView._confirmImport(${JSON.stringify(kind).replace(/"/g, "'")}, '${this._esc(file.name)}')">✅ شروع ایمپورت</button>
      `;
      Modal.open({ title: `📤 ورود ${kindLabel} از Excel`, body, footer, size: 'md' });

      // ذخیره‌ی موقت داده
      window.__importRawData = preview.raw;
      window.__importKind = kind;
    } catch (err) {
      console.error(err);
      Toast.error('خطا: ' + err.message);
    }
  }

  async _confirmImport(kind, fileName) {
    const mode = document.getElementById('importMode').value;
    const rawData = window.__importRawData;

    if (!rawData) {
      Toast.error('داده‌ای برای ایمپورت نیست');
      return;
    }

    try {
      Toast.info('در حال ایمپورت...');
      let result;
      if (kind === 'products') {
        result = await ExcelController.importProducts(rawData, { mode });
      } else {
        result = await ExcelController.importContacts(rawData, { mode });
      }

      Modal.close();
      Toast.success(`ایمپورت انجام شد: ${Formatters.number(result.added)} اضافه، ${Formatters.number(result.skipped)} رد شده`);

      // رفرش KPI ها
      await this.reload();
      const grid = document.querySelector('.settings-grid');
      if (grid) grid.innerHTML = this._renderAllCards();
    } catch (err) {
      console.error(err);
      Toast.error('خطا در ایمپورت: ' + err.message);
    } finally {
      window.__importRawData = null;
      window.__importKind = null;
    }
  }

  downloadProductsTemplate() {
    ExcelController.downloadProductsTemplate();
    Toast.success('قالب کالاها دانلود شد');
  }

  downloadContactsTemplate() {
    ExcelController.downloadContactsTemplate();
    Toast.success('قالب اشخاص دانلود شد');
  }

  // ============================================================
  // کارت میانبرهای صفحه‌کلید
  // ============================================================
  _renderShortcutsCard() {
    const s = KeyboardShortcuts.settings;

    const toggle = (id, checked, label, hint) => `
      <label style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;cursor:pointer;border-bottom:1px solid var(--border)">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="margin-top:3px;width:16px;height:16px;cursor:pointer" />
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${label}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;line-height:1.6">${hint}</div>
        </div>
      </label>
    `;

    return `
      <div class="card settings-card" style="border-color:#ddd6fe;background:linear-gradient(135deg,#faf5ff,#f8fafc)">
        <div class="settings-card-header">
          <div class="settings-card-icon" style="background:linear-gradient(135deg,#8b5cf6,#6d28d9)">⌨️</div>
          <div>
            <h3 class="settings-card-title">میانبرهای صفحه‌کلید</h3>
            <p class="settings-card-desc">با این میانبرها کار با برنامه سریع‌تر می‌شود</p>
          </div>
        </div>

        ${toggle('scEnabled', s.enabled, 'فعال بودن میانبرها', 'کلاً همه‌ی میانبرهای زیر رو روشن یا خاموش می‌کند')}
        ${toggle('scEnterConfirms', s.enterConfirms, 'تأیید با Enter', 'وقتی توی فرم هستید، Enter مثل دکمه‌ی ذخیره عمل می‌کند. Ctrl+Enter هم توی همه‌ی فیلدها کار می‌کند')}
        ${toggle('scEscapeCloses', s.escapeCloses, 'بستن با Escape', 'فشار دادن Escape، مودال باز را می‌بندد')}
        ${toggle('scCtrlSaves', s.ctrlSaves, 'ذخیره با Ctrl+S', 'داخل مودال‌ها، Ctrl+S فرم را ذخیره می‌کند')}
        ${toggle('scPlusMinusZeros', s.plusMinusZeros, 'ضریب سریع صفر (+ و -)', 'روی فیلدهای مبلغ، کلید + صفر اضافه و کلید − صفر کم می‌کند')}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;padding-top:14px;border-top:1px dashed var(--border)">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">تعداد صفرهای کلید +</label>
            <input type="text" inputmode="numeric" class="form-control" id="scPlusZeros" value="${Formatters.toPersianDigits(s.plusZeros)}" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">تعداد صفرهای کلید −</label>
            <input type="text" inputmode="numeric" class="form-control" id="scMinusZeros" value="${Formatters.toPersianDigits(s.minusZeros)}" />
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
          <button class="btn" onclick="window.SettingsView.saveShortcuts()">💾 ذخیره تنظیمات</button>
          <button class="btn btn-secondary" onclick="window.SettingsView.resetShortcuts()">↺ بازگشت به پیش‌فرض</button>
        </div>
      </div>
    `;
  }

  saveShortcuts() {
    try {
      const plusZeros = parseInt(Formatters.toLatinDigits(document.getElementById('scPlusZeros').value)) || 0;
      const minusZeros = parseInt(Formatters.toLatinDigits(document.getElementById('scMinusZeros').value)) || 0;

      const settings = {
        enabled: document.getElementById('scEnabled').checked,
        enterConfirms: document.getElementById('scEnterConfirms').checked,
        escapeCloses: document.getElementById('scEscapeCloses').checked,
        ctrlSaves: document.getElementById('scCtrlSaves').checked,
        plusMinusZeros: document.getElementById('scPlusMinusZeros').checked,
        plusZeros: Math.max(0, Math.min(12, plusZeros)),
        minusZeros: Math.max(0, Math.min(12, minusZeros))
      };

      KeyboardShortcuts.saveSettings(settings);
      Toast.success('تنظیمات میانبرهای صفحه‌کلید ذخیره شد');
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  resetShortcuts() {
    Modal.confirm({
      title: 'بازگشت به پیش‌فرض',
      message: 'آیا می‌خواهید همه‌ی تنظیمات میانبرهای صفحه‌کلید به حالت پیش‌فرض برگردد؟',
      confirmText: 'بازگردان',
      onConfirm: () => {
        KeyboardShortcuts.resetSettings();
        Toast.success('تنظیمات به حالت پیش‌فرض برگشت');
        const grid = document.querySelector('.settings-grid');
        if (grid) grid.innerHTML = this._renderAllCards();
      }
    });
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
            <h3 class="settings-card-title">پشتیبان‌گیری JSON</h3>
            <p class="settings-card-desc">پشتیبان‌گیری کامل از دیتابیس (فقط JSON، نه Excel)</p>
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

  _renderAllCards() {
    return this._renderCompanyCard()
      + this._renderExcelCard()
      + this._renderShortcutsCard()
      + this._renderBackupCard()
      + this._renderStatsCard()
      + this._renderThemeCard()
      + this._renderAboutCard();
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
      const grid = document.querySelector('.settings-grid');
      if (grid) grid.innerHTML = this._renderAllCards();
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  // ============================================================
  // بکاپ JSON
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
    if (grid) grid.innerHTML = this._renderAllCards();
  }

  _esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

export const SettingsView = new SettingsViewImpl();
window.SettingsView = SettingsView;