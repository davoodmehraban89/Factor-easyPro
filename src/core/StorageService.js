// ============================================================
// StorageService — IndexedDB wrapper
// v4: تراکنش چندجدولی، مهاجرت درست ایندکس‌ها، ورود/خروج امن داده
// ============================================================

const DB_NAME = 'finora_pro_db';
const DB_VERSION = 4;

const STORES = [
  'users', 'companies', 'contacts', 'products',
  'units', 'categories',
  'treasury',
  'invoices', 'invoice_items', 'stock_movements',
  'transactions', 'cheques', 'expenses',
  'settings', 'logs'
];

// جدول‌هایی که ایندکس ownerUserId ندارند
const NO_OWNER_INDEX = new Set(['settings', 'logs']);

// ایندکس‌های اختصاصی هر جدول: [نام، keyPath، گزینه‌ها]
const INDEXES = {
  invoices: [['date', 'date'], ['number', 'number'], ['clientUuid', 'clientUuid']],
  stock_movements: [['productId', 'productId']],
  invoice_items: [['invoiceId', 'invoiceId']]
};

// فیلدهای مربوط به رمز عبور کاربران؛ هرگز در فایل پشتیبان نمی‌روند
const CREDENTIAL_FIELDS = ['pass', 'pwHash', 'pwSalt', 'pwIter', 'pwAlgo'];

function stripCredentials(user) {
  const copy = { ...user };
  CREDENTIAL_FIELDS.forEach(f => delete copy[f]);
  return copy;
}

function ensureIndex(store, name, keyPath, options = { unique: false }) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
}

class StorageServiceImpl {
  constructor() {
    this.db = null;
    this._opening = null;
  }

  // ---------- باز کردن پایگاه داده ----------

  init() {
    if (this.db) return Promise.resolve(this.db);
    if (this._opening) return this._opening;

    this._opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const upgradeTx = e.target.transaction;
        STORES.forEach(name => {
          // جدول‌های موجود دست نمی‌خورند؛ فقط ایندکس‌های جاافتاده اضافه می‌شوند
          const store = db.objectStoreNames.contains(name)
            ? upgradeTx.objectStore(name)
            : db.createObjectStore(name, { keyPath: 'id' });
          if (!NO_OWNER_INDEX.has(name)) ensureIndex(store, 'ownerUserId', 'ownerUserId');
          (INDEXES[name] || []).forEach(([idx, keyPath, opts]) => ensureIndex(store, idx, keyPath, opts));
        });
      };

      req.onblocked = () => {
        console.warn('IndexedDB: ارتقای پایگاه داده منتظر بسته شدن پنجره‌های دیگر است');
      };

      req.onsuccess = () => {
        this.db = req.result;
        this.db.onversionchange = () => {
          this.db.close();
          this.db = null;
          this._opening = null;
        };
        console.log('✅ IndexedDB ready');
        resolve(this.db);
      };

      req.onerror = () => {
        this._opening = null;
        reject(req.error);
      };
    });

    return this._opening;
  }

  // ---------- ابزار داخلی ----------

  _touch(obj) {
    if (!obj.id) obj.id = this.uid();
    obj.updatedAt = new Date().toISOString();
    if (!obj.createdAt) obj.createdAt = obj.updatedAt;
    return obj;
  }

  /**
   * اجرای یک عملیات روی یک جدول. نتیجه فقط بعد از commit شدن تراکنش برمی‌گردد.
   */
  _exec(store, mode, op) {
    return this.init().then(db => new Promise((resolve, reject) => {
      let tx, req;
      try {
        tx = db.transaction(store, mode);
        req = op(tx.objectStore(store));
      } catch (err) {
        try { if (tx) tx.abort(); } catch (_) { /* تراکنش قبلاً بسته شده */ }
        reject(err);
        return;
      }
      let result;
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || req.error || new Error('تراکنش IndexedDB لغو شد'));
    }));
  }

  // سازگاری با کدهای قدیمی (منسوخ): مستقیماً objectStore برمی‌گرداند
  async _tx(store, mode = 'readonly') {
    const db = await this.init();
    return db.transaction(store, mode).objectStore(store);
  }

  // ---------- تراکنش اتمی چندجدولی ----------

  /**
   * همه عملیات داخل fn یا با هم ثبت می‌شوند یا هیچ‌کدام.
   * اگر fn خطا بدهد (throw)، کل تراکنش برگردانده می‌شود (rollback).
   *
   * مثال:
   *   await StorageService.transaction(['invoices','invoice_items','stock_movements'], async tx => {
   *     await tx.put('invoices', invoice);
   *     for (const it of items) await tx.put('invoice_items', it);
   *   });
   *
   * هشدار: داخل fn فقط روی عملیات tx.* منتظر بمانید (await). انتظار برای
   * fetch، setTimeout یا هر چیز غیر IndexedDB باعث commit زودهنگام می‌شود.
   */
  async transaction(storeNames, fn, mode = 'readwrite') {
    const db = await this.init();
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];

    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(names, mode);
      } catch (err) {
        reject(err);
        return;
      }

      const wrap = (req) => new Promise((res, rej) => {
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      const os = (name) => tx.objectStore(name);

      const api = {
        get: (s, id) => wrap(os(s).get(id)),
        getAll: (s) => wrap(os(s).getAll()).then(r => r || []),
        getAllByIndex: (s, index, key) => wrap(os(s).index(index).getAll(key)).then(r => r || []),
        count: (s) => wrap(os(s).count()),
        put: (s, obj) => { this._touch(obj); return wrap(os(s).put(obj)).then(() => obj); },
        putRaw: (s, obj) => { if (!obj.id) obj.id = this.uid(); return wrap(os(s).put(obj)).then(() => obj); },
        delete: (s, id) => wrap(os(s).delete(id)).then(() => undefined),
        clear: (s) => wrap(os(s).clear()).then(() => undefined)
      };

      let result;
      let failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error('تراکنش IndexedDB لغو شد'));

      Promise.resolve()
        .then(() => fn(api))
        .then(
          (r) => { result = r; },
          (err) => {
            failure = err;
            try { tx.abort(); } catch (_) { /* قبلاً لغو شده */ }
          }
        );
    });
  }

  // ---------- عملیات ساده ----------

  async getAll(store) {
    const r = await this._exec(store, 'readonly', s => s.getAll());
    return r || [];
  }

  async getByOwner(store, ownerId) {
    const r = await this._exec(store, 'readonly', s => s.index('ownerUserId').getAll(ownerId));
    return r || [];
  }

  async getAllByIndex(store, indexName, key) {
    const r = await this._exec(store, 'readonly', s => s.index(indexName).getAll(key));
    return r || [];
  }

  get(store, id) {
    return this._exec(store, 'readonly', s => s.get(id));
  }

  async put(store, obj) {
    this._touch(obj);
    await this._exec(store, 'readwrite', s => s.put(obj));
    return obj;
  }

  // ثبت گروهی در یک تراکنش (زمان‌ها دست‌نخورده می‌مانند؛ مناسب بازیابی پشتیبان)
  bulkPut(store, items) {
    return this.transaction(store, async tx => {
      await Promise.all(items.map(item => tx.putRaw(store, item)));
      return items.length;
    });
  }

  async delete(store, id) {
    await this._exec(store, 'readwrite', s => s.delete(id));
  }

  count(store) {
    return this._exec(store, 'readonly', s => s.count());
  }

  clearAll() {
    return this.transaction(STORES, async tx => {
      await Promise.all(STORES.map(name => tx.clear(name)));
    });
  }

  // ---------- پشتیبان‌گیری ----------

  /**
   * خروجی کامل داده‌ها از یک تصویر یکپارچه (snapshot).
   * به‌طور پیش‌فرض رمزهای کاربران در خروجی نمی‌آید.
   */
  async exportAll({ includeCredentials = false } = {}) {
    const data = await this.transaction(STORES, async tx => {
      const out = {};
      for (const store of STORES) out[store] = await tx.getAll(store);
      return out;
    }, 'readonly');

    if (!includeCredentials && Array.isArray(data.users)) {
      data.users = data.users.map(stripCredentials);
    }

    return {
      app: 'Finora Pro',
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      data
    };
  }

  /**
   * بازیابی اتمی: اگر هر مرحله‌ای خطا بدهد هیچ چیز نوشته نمی‌شود.
   * رمز کاربران هرگز از فایل خوانده نمی‌شود؛ کاربران موجود رمز فعلی‌شان را نگه
   * می‌دارند و کاربران جدید باید در اولین ورود رمز تعیین کنند.
   */
  async importAll(json) {
    if (!json || typeof json !== 'object' || !json.data || typeof json.data !== 'object') {
      throw new Error('فرمت فایل نامعتبر است');
    }
    if (json.app && json.app !== 'Finora Pro') {
      throw new Error('این فایل پشتیبان فینورا پرو نیست');
    }
    if (typeof json.version === 'number' && json.version > DB_VERSION) {
      throw new Error('این پشتیبان مربوط به نسخه جدیدتری از برنامه است');
    }

    // اعتبارسنجی کامل پیش از هر نوشتن
    for (const store of STORES) {
      const items = json.data[store];
      if (items === undefined) continue;
      if (!Array.isArray(items)) throw new Error(`بخش «${store}» در فایل پشتیبان نامعتبر است`);
      for (const item of items) {
        const isObject = item && typeof item === 'object' && !Array.isArray(item);
        const idOk = isObject && (item.id === undefined || typeof item.id === 'string' || typeof item.id === 'number');
        if (!idOk) throw new Error(`رکورد نامعتبر در بخش «${store}»`);
      }
    }

    await this.transaction(STORES, async tx => {
      for (const store of STORES) {
        const items = json.data[store];
        if (!items) continue;
        if (store === 'users') {
          await this._importUsers(tx, items);
        } else {
          await Promise.all(items.map(item => tx.putRaw(store, item)));
        }
      }
    });
    return true;
  }

  async _importUsers(tx, items) {
    for (const incoming of items) {
      const user = stripCredentials(incoming);
      if (!user.id) user.id = this.uid();
      const existing = await tx.get('users', user.id);
      if (existing) {
        CREDENTIAL_FIELDS.forEach(f => { if (existing[f] !== undefined) user[f] = existing[f]; });
        if (existing.mustSetPassword !== undefined) user.mustSetPassword = existing.mustSetPassword;
      } else {
        user.mustSetPassword = true;
      }
      await tx.putRaw('users', user);
    }
  }

  // ---------- شناسه یکتا ----------

  uid(prefix = '') {
    const c = globalThis.crypto;
    const core = (c && typeof c.randomUUID === 'function')
      ? c.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    return prefix + core;
  }
}

export const StorageService = new StorageServiceImpl();
export { STORES, CREDENTIAL_FIELDS };
