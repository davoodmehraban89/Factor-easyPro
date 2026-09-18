// ============================================================
// SettingsController — تنظیمات، بکاپ و بازیابی
// ============================================================

import { StorageService, STORES } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';

class SettingsControllerImpl {
  // ============================================================
  // بکاپ‌گیری
  // ============================================================
  async exportBackup() {
    const user = Auth.current();
    if (!user) throw new Error('کاربر یافت نشد');

    const backup = {
      app: 'Finora Pro',
      version: '0.1.0',
      exportedAt: new Date().toISOString(),
      exportedAtJalali: this._todayJalali(),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName
      },
      data: {}
    };

    // همه‌ی جدول‌ها رو خونده و توی بکاپ می‌ذاریم
    for (const store of STORES) {
      try {
        if (store === 'settings' || store === 'logs') {
          backup.data[store] = await StorageService.getAll(store);
        } else {
          backup.data[store] = await StorageService.getByOwner(store, user.id);
        }
      } catch (e) {
        console.warn(`Backup: store "${store}" skipped:`, e.message);
        backup.data[store] = [];
      }
    }

    return backup;
  }

  downloadBackup() {
    return this.exportBackup().then(backup => {
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const date = backup.exportedAtJalali.replace(/\//g, '-');
      const filename = `finora-backup-${date}-${Date.now()}.json`;

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
    const user = Auth.current();
    if (!user) throw new Error('کاربر یافت نشد');

    let backup;
    try {
      backup = typeof fileContent === 'string' ? JSON.parse(fileContent) : fileContent;
    } catch (e) {
      throw new Error('فایل بکاپ معتبر نیست (JSON نامعتبر)');
    }

    if (!backup || !backup.data) {
      throw new Error('ساختار فایل بکاپ نامعتبر است');
    }

    const mode = options.mode || 'merge';  // merge | replace
    const counts = { added: 0, updated: 0, skipped: 0 };

    for (const store of STORES) {
      const items = backup.data[store];
      if (!Array.isArray(items) || items.length === 0) continue;

      // برای settings/logs مستقیم؛ بقیه با ownerUserId
      for (const rawItem of items) {
        const item = { ...rawItem };

        // اگه مالک اصلی فرق داره، به کاربر فعلی نسبت بده
        if (item.ownerUserId && item.ownerUserId !== user.id && store !== 'settings' && store !== 'logs') {
          item.ownerUserId = user.id;
          item.id = StorageService.uid(item.id?.split('_')[0] + '_' || 'item_');
        }

        if (mode === 'replace') {
          await StorageService.put(store, item);
          counts.added++;
        } else {
          // merge: اگه id از قبل هست، skip کن
          const existing = await StorageService.get(store, item.id);
          if (existing) {
            counts.skipped++;
          } else {
            await StorageService.put(store, item);
            counts.added++;
          }
        }
      }
    }

    return counts;
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
    const user = Auth.current();
    const list = await StorageService.getByOwner('companies', user.id);
    if (list.length > 0) return list[0];
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