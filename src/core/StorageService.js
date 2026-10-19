// ============================================================
// StorageService — IndexedDB wrapper
// v5: جدول‌های حسابداری دوبل و مهاجرت سازگار با نسخه‌های قبلی
// ============================================================

const DB_NAME = 'finora_pro_db';
const DB_VERSION = 7;

const STORES = [
  'users', 'companies', 'contacts', 'products',
  'units', 'categories',
  'treasury',
  'invoices', 'invoice_items', 'stock_movements',
  'transactions', 'cheques', 'expenses',
  'settings', 'logs',
  'account_chart', 'fiscal_periods', 'journal_entries', 'journal_lines',
  'warehouses', 'inventory_balances', 'stocktakes', 'stocktake_lines',
  'settlements', 'account_mappings',
  'audit_events', 'document_corrections'
];

// جدول‌هایی که ایندکس ownerUserId ندارند
const NO_OWNER_INDEX = new Set(['settings', 'logs']);

// ایندکس‌های اختصاصی هر جدول: [نام، keyPath، گزینه‌ها]
const INDEXES = {
  invoices: [['date', 'date'], ['number', 'number'], ['clientUuid', 'clientUuid']],
  stock_movements: [['productId', 'productId']],
  invoice_items: [['invoiceId', 'invoiceId']],
  account_chart: [['companyId', 'companyId'], ['code', 'code']],
  fiscal_periods: [['companyId', 'companyId']],
  journal_entries: [['companyId', 'companyId'], ['sourceKey', 'sourceKey', { unique: true }]],
  journal_lines: [['journalId', 'journalId'], ['companyId', 'companyId']],
  warehouses: [['companyId', 'companyId']],
  inventory_balances: [['companyId', 'companyId'], ['warehouseId', 'warehouseId'], ['productId', 'productId']],
  stocktakes: [['companyId', 'companyId'], ['warehouseId', 'warehouseId']],
  stocktake_lines: [['companyId', 'companyId'], ['stocktakeId', 'stocktakeId']],
  settlements: [['companyId', 'companyId'], ['invoiceId', 'invoiceId'], ['transactionId', 'transactionId']],
  account_mappings: [['companyId', 'companyId']],
  audit_events: [['companyId', 'companyId'], ['sourceId', 'sourceId'], ['correlationId', 'correlationId'], ['commandKey', 'commandKey', { unique: true }]],
  document_corrections: [['companyId', 'companyId'], ['sourceId', 'sourceId'], ['idempotencyKey', 'idempotencyKey', { unique: true }]]
};

// فیلدهای مربوط به رمز عبور کاربران؛ هرگز در فایل پشتیبان نمی‌روند
const CREDENTIAL_FIELDS = ['pass', 'pwHash', 'pwSalt', 'pwIter', 'pwAlgo'];

const APPEND_ONLY_STORES = new Set(['audit_events', 'document_corrections']);
const FINALIZED_COMMERCE_STORES = new Set([
  'stock_movements', 'settlements', 'transactions'
]);

async function existingFinalizedRecord(tx, store, incoming, existing) {
  if (!existing) return false;
  if (FINALIZED_COMMERCE_STORES.has(store)) return true;
  if (store === 'journal_entries') return existing.status === 'posted' || incoming.status === 'posted';
  if (store === 'invoices' || store === 'cheques' || store === 'expenses') {
    return Boolean(existing.financePosted || incoming.financePosted);
  }
  if (store === 'treasury') {
    return existing.recordType === 'transaction' || incoming.recordType === 'transaction';
  }
  if (store === 'journal_lines' || store === 'invoice_items') {
    const parentStore = store === 'journal_lines' ? 'journal_entries' : 'invoices';
    const relation = store === 'journal_lines' ? 'journalId' : 'invoiceId';
    const a = await tx.get(parentStore, existing[relation]);
    const b = existing[relation] === incoming[relation] ? a :
      await tx.get(parentStore, incoming[relation]);
    return parentStore === 'journal_entries'
      ? a?.status === 'posted' || b?.status === 'posted'
      : Boolean(a?.financePosted || b?.financePosted);
  }
  return false;
}

// Compare snapshot metadata without depending on JSON property insertion order.
function snapshotComparable(value) {
  if (Array.isArray(value)) return value.map(snapshotComparable);
  if (value && typeof value === 'object') {
    const normalized = {};
    for (const key of Object.keys(value).sort()) normalized[key] = snapshotComparable(value[key]);
    return normalized;
  }
  return value;
}
const sameSnapshotRecord = (left, right) =>
  JSON.stringify(snapshotComparable(left)) === JSON.stringify(snapshotComparable(right));


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
    this.blockedTimeoutMs = 12000;
  }

  // ---------- باز کردن پایگاه داده ----------

  init() {
    if (this.db) return Promise.resolve(this.db);
    if (this._opening) return this._opening;

    this._opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      let resolved = false;
      let blockedTimer = null;
      const fail = error => {
        if (resolved) return;
        resolved = true;
        if (blockedTimer !== null) clearTimeout(blockedTimer);
        this._opening = null;
        reject(error);
      };

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
        console.warn('IndexedDB: نسخه دیگری از پایگاه داده هنوز باز است');
        if (blockedTimer !== null) return;
        blockedTimer = setTimeout(() => {
          fail(new Error('ارتقای پایگاه داده متوقف شده است؛ پنجره‌های دیگر برنامه را ببندید و دوباره تلاش کنید'));
        }, this.blockedTimeoutMs);
      };

      req.onsuccess = () => {
        if (blockedTimer !== null) clearTimeout(blockedTimer);
        // An older blocked request may complete after its timeout. Close it:
        // only a fresh explicit retry may take ownership of that DB handle.
        if (resolved) { req.result.close(); return; }
        resolved = true;
        this.db = req.result;
        this.db.onversionchange = () => {
          this.db.close();
          this.db = null;
          this._opening = null;
        };
        console.log('✅ IndexedDB ready');
        resolve(this.db);
      };

      req.onerror = () => fail(req.error || new Error('باز کردن پایگاه داده ناموفق بود'));
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
    if (mode === 'readwrite' && globalThis.FINORA?.License) globalThis.FINORA.License.assertWritable();
    const db = await this.init();
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    // Immutable history must be appended alongside a business operation.
    // Read-only access to a history store remains permitted.
    if (mode === 'readwrite' && names.length === 1 && APPEND_ONLY_STORES.has(names[0])) {
      throw new Error('ثبت سابقه ممیزی یا اصلاح بدون تراکنش تجاری مجاز نیست');
    }


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
        // Audit/correction history may be appended, never overwritten.
        put: (s, obj) => { this._touch(obj); return wrap(
          APPEND_ONLY_STORES.has(s) ? os(s).add(obj) : os(s).put(obj)
        ).then(() => obj); },
        putRaw: (s, obj) => { if (!obj.id) obj.id = this.uid(); return wrap(
          APPEND_ONLY_STORES.has(s) ? os(s).add(obj) : os(s).put(obj)
        ).then(() => obj); },
        add: (s, obj) => { if (!obj.id) obj.id = this.uid(); return wrap(os(s).add(obj)).then(() => obj); },
        delete: (s, id) => APPEND_ONLY_STORES.has(s)
          ? Promise.reject(new Error('حذف مستقیم سابقه ممیزی یا اصلاح سند مجاز نیست'))
          : wrap(os(s).delete(id)).then(() => undefined),
        clear: (s) => APPEND_ONLY_STORES.has(s)
          ? Promise.reject(new Error('پاک‌سازی مستقیم سابقه ممیزی یا اصلاح سند مجاز نیست'))
          : wrap(os(s).clear()).then(() => undefined)
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

  async getByCompany(store, companyId) {
    if (!companyId) return [];
    const all = await this.getAll(store);
    return all.filter(row => row.companyId === companyId);
  }

  async getAllByIndex(store, indexName, key) {
    const r = await this._exec(store, 'readonly', s => s.index(indexName).getAll(key));
    return r || [];
  }

  get(store, id) {
    return this._exec(store, 'readonly', s => s.get(id));
  }

  async put(store, obj) {
    // Audit/correction records must be appended in the same transaction as
    // their business operation; standalone writes cannot prove atomicity.
    if (APPEND_ONLY_STORES.has(store)) {
      throw new Error('ثبت مستقیم سابقه ممیزی یا اصلاح سند مجاز نیست');
    }
    if (globalThis.FINORA?.License && !['users', 'settings', 'logs'].includes(store)) globalThis.FINORA.License.assertWritable();
    this._touch(obj);
    await this._exec(store, 'readwrite',
      s => APPEND_ONLY_STORES.has(store) ? s.add(obj) : s.put(obj));
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
    if (APPEND_ONLY_STORES.has(store)) {
      throw new Error('حذف مستقیم سابقه ممیزی یا اصلاح سند مجاز نیست');
    }
    if (globalThis.FINORA?.License && !['users', 'settings', 'logs'].includes(store)) globalThis.FINORA.License.assertWritable();
    await this._exec(store, 'readwrite', s => s.delete(id));
  }

  count(store) {
    return this._exec(store, 'readonly', s => s.count());
  }

  // Explicit full-database reset/maintenance is intentionally separate from
  // the ordinary transaction API. That API must never permit clearing
  // append-only audit or correction history on its own.
  // Keep the full reset atomic and wait for IDB transaction completion.
  async clearAll() {
    if (globalThis.FINORA?.License) globalThis.FINORA.License.assertWritable();
    const db = await this.init();
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(STORES, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error('بازنشانی کامل پایگاه داده لغو شد'));
        for (const name of STORES) tx.objectStore(name).clear();
      } catch (err) {
        if (tx) {
          try { tx.abort(); } catch (_) { /* Transaction may already be inactive. */ }
        }
        reject(err);
      }
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
      app: 'Factor-easyPro',
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
    if (!json || typeof json !== 'object' || Array.isArray(json) ||
      !json.data || typeof json.data !== 'object' || Array.isArray(json.data)) {
      throw new Error('فرمت فایل نامعتبر است');
    }
    if (!['Finora Pro', 'Factor-easyPro'].includes(json.app)) {
      throw new Error('این فایل پشتیبان فینورا پرو نیست');
    }
    if (!Number.isSafeInteger(json.version) || json.version < 1) {
      throw new Error('نسخه فایل پشتیبان نامعتبر است');
    }
    if (json.version > DB_VERSION) {
      throw new Error('این پشتیبان مربوط به نسخه جدیدتری از برنامه است');
    }

    // اعتبارسنجی کامل پیش از هر نوشتن
    for (const store of STORES) {
      const items = json.data[store];
      if (items === undefined) continue;
      if (!Array.isArray(items)) throw new Error(`بخش «${store}» در فایل پشتیبان نامعتبر است`);
      const seenIds = new Set();
      for (const item of items) {
        const isObject = item && typeof item === 'object' && !Array.isArray(item);
        const idOk = isObject && (item.id === undefined ||
          (typeof item.id === 'string' && item.id.trim().length > 0) ||
          (typeof item.id === 'number' && Number.isSafeInteger(item.id) && item.id > 0));
        if (!idOk) throw new Error(`رکورد نامعتبر در بخش «${store}»`);
        if (item.id !== undefined) {
          if (seenIds.has(item.id)) throw new Error(`شناسه تکراری در بخش «${store}»`);
          seenIds.add(item.id);
        }
      }
    }

    await this.transaction(STORES, async tx => {
      for (const store of STORES) {
        const items = json.data[store];
        if (!items) continue;
        if (store === 'users') {
          await this._importUsers(tx, items);
        } else if (APPEND_ONLY_STORES.has(store)) {
          // Backup replay may re-add history but can never rewrite it.
          // A conflicting record aborts the WHOLE multi-store restore.
          for (const item of items) {
            if (!item.id || typeof item.id !== 'string' ||
                !item.companyId || typeof item.companyId !== 'string') {
              throw new Error('رکورد تاریخچه ممیزی یا اصلاح سند نامعتبر است');
            }
            const old = await tx.get(store, item.id);
            if (old) {
              if (!sameSnapshotRecord(old, item)) {
                throw new Error('بازنویسی سابقه ممیزی یا اصلاح سند از پشتیبان مجاز نیست');
              }
            } else {
              await tx.add(store, { ...item });
            }
          }
        } else {
          for (const item of items) {
            // A full backup is not an authorization to rewrite posted invoices,
            // journals, settlements, cheques, money or inventory movements.
            // Older snapshots may add missing rows but conflicting historical
            // financial facts fail the complete restore transaction.
            const previous = item.id === undefined ? null : await tx.get(store, item.id);
            if (previous && await existingFinalizedRecord(tx, store, item, previous)) {
              if (!sameSnapshotRecord(previous, item)) {
                throw new Error('بازنویسی سند قطعی مالی در بازیابی کامل مجاز نیست');
              }
              continue;
            }
            await tx.putRaw(store, item);
          }
        }
      }
    });
    return true;
  }

  async _importUsers(tx, items) {
    const localUsers = await tx.getAll('users');
    const byId = new Map(localUsers.map(u => [u.id, u]));
    const imported = new Map();
    for (const incoming of items) {
      const user = stripCredentials(incoming);
      if (!user.id) user.id = this.uid();
      const existing = byId.get(user.id);
      if (existing) {
        // Passwords and access grants belong to the authenticated local
        // installation. A JSON backup cannot promote a user to admin or
        // assign another company's permissions.
        CREDENTIAL_FIELDS.forEach(f => {
          if (existing[f] !== undefined) user[f] = existing[f];
        });
        user.role = existing.role;
        user.companyIds = existing.companyIds;
        if (existing.mustSetPassword !== undefined) {
          user.mustSetPassword = existing.mustSetPassword;
        }
      } else {
        user.role = 'user';
        user.companyIds = [];
        user.mustSetPassword = true;
      }
      imported.set(user.id, user);
    }
    const final = new Map(byId);
    for (const [id, user] of imported) final.set(id, user);
    if (final.size > 4) {
      throw Error('فایل پشتیبان بیش از چهار کاربر برای این نصب ایجاد می‌کند');
    }
    const names = new Set();
    for (const user of final.values()) {
      const name = typeof user.username === 'string' ? user.username.trim() : '';
      if (!name || names.has(name)) {
        throw Error('نام کاربری تکراری یا نامعتبر در فایل پشتیبان');
      }
      names.add(name);
    }
    for (const user of imported.values()) await tx.putRaw('users', user);
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
