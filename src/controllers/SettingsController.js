// ============================================================
// SettingsController — تنظیمات، بکاپ و بازیابی
// ============================================================

import { StorageService, STORES } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';
import { DataScope } from '../core/DataScope.js';
import { restoreCompanyBackup, COMPANY_BACKUP_STORES } from '../core/CompanyBackupService.js';

class SettingsControllerImpl {
  async getInvoiceSettings() {
    const companyId = await DataScope.companyId();
    const stored = await StorageService.get('settings', `invoice_numbering_${companyId}`);
    return { numberingMode: stored?.numberingMode === 'manual' ? 'manual' : 'auto', nextNumber: Math.max(1, Number(stored?.nextNumber) || 1) };
  }

  async saveInvoiceSettings({ numberingMode, nextNumber }) {
    if (!['auto', 'manual'].includes(numberingMode) || !Number.isSafeInteger(Number(nextNumber)) || Number(nextNumber) < 1) {
      throw new Error('تنظیمات شماره‌گذاری نامعتبر است');
    }
    const companyId = await DataScope.companyId();
    const saved = { id: `invoice_numbering_${companyId}`, numberingMode, nextNumber: Number(nextNumber), companyId };
    await StorageService.put('settings', saved);
    return { numberingMode: saved.numberingMode, nextNumber: saved.nextNumber };
  }

  // ============================================================
  // بکاپ‌گیری
  // ============================================================
  async exportBackup() {
    const user = Auth.current();
    if (!user) throw new Error('کاربر یافت نشد');

    const backup = {
      app: 'Factor-easyPro',
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      exportedAtJalali: this._todayJalali(),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName
      },
      data: {}
    };

    // Capture one consistent read-only snapshot; exclude sensitive credentials.
    const companyId = await DataScope.companyId();
    const snapshot = await StorageService.exportAll();
    for (const store of STORES) {
      const rows = snapshot.data[store] || [];
      backup.data[store] = COMPANY_BACKUP_STORES.includes(store)
        ? rows.filter(record => record.companyId === companyId)
        : rows;
    }

    return backup;
  }

  downloadBackup() {
    return this.exportBackup().then(async backup => {
      const json = JSON.stringify(backup, null, 2);
      const password = prompt('رمز محافظت از فایل پشتیبان (حداقل ۱۲ نویسه):');
      if (!password || password.length < 12) throw new Error('رمز پشتیبان باید حداقل ۱۲ نویسه باشد');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json));
      const b64 = bytes => { let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(binary); };
      const encrypted = JSON.stringify({ format: 'finora-encrypted-backup-v1', salt: b64(salt), iv: b64(iv), ciphertext: b64(new Uint8Array(ciphertext)) });
      const blob = new Blob([encrypted], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      const date = backup.exportedAtJalali.replace(/\//g, '-');
      const filename = `finora-backup-${date}-${Date.now()}.fbackup`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { filename, size: json.length, counts: this._countItems(backup.data) };
    });
  }

  _countItems(data) {
    const counts = {};
    Object.keys(data).forEach(k => {
      const arr = data[k];
      if (Array.isArray(arr) && arr.length > 0) counts[k] = arr.length;
    });
    return counts;
  }

  // ============================================================
  // بازیابی
  // ============================================================
  async importBackup(fileContent, options = {}) {
    if(!Auth.isAdmin())throw Error('بازیابی اطلاعات فقط توسط مدیر مجاز است');
    const user = Auth.current();
    if (!user) throw new Error('کاربر یافت نشد');

    let backup;
    try {
      backup = typeof fileContent === 'string' ? JSON.parse(fileContent) : fileContent;
    } catch (e) {
      throw new Error('فایل بکاپ معتبر نیست (JSON نامعتبر)');
    }

    if (backup?.format === 'finora-encrypted-backup-v1') {
      const password = prompt('رمز فایل پشتیبان را وارد کنید:');
      if (!password) throw new Error('رمز پشتیبان الزامی است');
      try {
        const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
        const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(backup.salt), iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(backup.iv) }, key, fromB64(backup.ciphertext));
        backup = JSON.parse(new TextDecoder().decode(clear));
      } catch (_) { throw new Error('رمز نادرست است یا فایل پشتیبان آسیب دیده است'); }
    }
    if (!backup || !backup.data) {
      throw new Error('ساختار فایل بکاپ نامعتبر است');
    }

    return restoreCompanyBackup(backup.data, { companyId: await DataScope.companyId(), userId: user.id, mode: options.mode || 'merge' });
  }

  async readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('خطا در خواندن فایل'));
      reader.readAsText(file);
    });
  }

  // ============================================================
  // پاک کردن همه‌ی داده‌ها
  // ============================================================
  async wipeAll() {
    await StorageService.clearAll();
    // sessionStorage و localStorage تمیز
    sessionStorage.clear();
    // دیتای آخرین route رو نگه‌دار، ولی بقیه رو پاک کن
    const lastRoute = localStorage.getItem('finora_pro_last_route');
    localStorage.clear();
    if (lastRoute) localStorage.setItem('finora_pro_last_route', lastRoute);
    return true;
  }

  // ============================================================
  // اطلاعات شرکت
  // ============================================================
  async getCompanyInfo() {
    const active = globalThis.FINORA?.Company ? await globalThis.FINORA.Company.current() : null;
    if (active) return active;
    return {
      id: null,
      name: '',
      entityType: 'legal',
      nationalId: '',
      economicCode: '',
      regNumber: '',
      postalCode: '',
      phone: '',
      mobile: '',
      address: '',
      footer: ''
    };
  }

  async saveCompanyInfo(data) {
    const user = Auth.current();
    let company = await this.getCompanyInfo();
    const isNew = !company.id;

    const updated = {
      ...company,
      id: company.id || StorageService.uid('company_'),
      ownerUserId: user.id,
      name: (data.name || '').trim(),
      entityType: data.entityType || 'legal',
      nationalId: (data.nationalId || '').trim(),
      economicCode: (data.economicCode || '').trim(),
      regNumber: (data.regNumber || '').trim(),
      postalCode: (data.postalCode || '').trim(),
      phone: (data.phone || '').trim(),
      mobile: (data.mobile || '').trim(),
      address: (data.address || '').trim(),
      footer: (data.footer || '').trim()
    };

    await StorageService.put('companies', updated);
    return updated;
  }

  // ============================================================
  // Helpers
  // ============================================================
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
}

export const SettingsController = new SettingsControllerImpl();