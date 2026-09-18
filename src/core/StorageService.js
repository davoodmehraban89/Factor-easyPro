// ============================================================
// StorageService — IndexedDB wrapper
// ============================================================

const DB_NAME = 'finora_pro_db';
const DB_VERSION = 1;

const STORES = [
  'users', 'companies', 'contacts', 'products',
  'invoices', 'invoice_items', 'stock_movements',
  'transactions', 'cheques', 'expenses',
  'settings', 'logs'
];

class StorageServiceImpl {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        STORES.forEach(name => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' });
            if (name !== 'settings' && name !== 'logs') {
              store.createIndex('ownerUserId', 'ownerUserId', { unique: false });
            }
            if (name === 'invoices') {
              store.createIndex('date', 'date', { unique: false });
              store.createIndex('number', 'number', { unique: false });
              store.createIndex('clientUuid', 'clientUuid', { unique: false });
            }
            if (name === 'stock_movements') {
              store.createIndex('productId', 'productId', { unique: false });
            }
            if (name === 'invoice_items') {
              store.createIndex('invoiceId', 'invoiceId', { unique: false });
            }
          }
        });
      };
      req.onsuccess = () => {
        this.db = req.result;
        console.log('✅ IndexedDB ready');
        resolve(this.db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async _tx(store, mode = 'readonly') {
    if (!this.db) await this.init();
    return this.db.transaction(store, mode).objectStore(store);
  }

  async getAll(store) {
    return new Promise(async (resolve, reject) => {
      const s = await this._tx(store);
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getByOwner(store, ownerId) {
    return new Promise(async (resolve, reject) => {
      const s = await this._tx(store);
      const idx = s.index('ownerUserId');
      const req = idx.getAll(ownerId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async get(store, id) {
    return new Promise(async (resolve, reject) => {
      const s = await this._tx(store);
      const req = s.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async put(store, obj) {
    if (!obj.id) obj.id = this.uid();
    obj.updatedAt = new Date().toISOString();
    if (!obj.createdAt) obj.createdAt = obj.updatedAt;
    return new Promise(async (resolve, reject) => {
      const s = await this._tx(store, 'readwrite');
      const req = s.put(obj);
      req.onsuccess = () => resolve(obj);
      req.onerror = () => reject(req.error);
    });
  }

  async bulkPut(store, items) {
    const db = await this.init();
    const tx = db.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    items.forEach(item => {
      if (!item.id) item.id = this.uid();
      s.put(item);
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(items.length);
      tx.onerror = () => reject(tx.error);
    });
  }

  async delete(store, id) {
    return new Promise(async (resolve, reject) => {
      const s = await this._tx(store, 'readwrite');
      const req = s.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async count(store) {
    return new Promise(async (resolve, reject) => {
      const s = await this._tx(store);
      const req = s.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async clearAll() {
    const db = await this.init();
    const tx = db.transaction(STORES, 'readwrite');
    STORES.forEach(name => tx.objectStore(name).clear());
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async exportAll() {
    const data = {};
    for (const store of STORES) {
      data[store] = await this.getAll(store);
    }
    return {
      app: 'Finora Pro',
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      data
    };
  }

  async importAll(json) {
    if (!json || !json.data) throw new Error('فرمت فایل نامعتبر است');
    for (const store of STORES) {
      if (Array.isArray(json.data[store])) {
        await this.bulkPut(store, json.data[store]);
      }
    }
    return true;
  }

  uid(prefix = '') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
  }
}

export const StorageService = new StorageServiceImpl();
export { STORES };