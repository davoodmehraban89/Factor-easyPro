// ============================================================
// ProductController — منطق کالا، واحد، گروه
// ============================================================

import { StorageService } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';

class ProductControllerImpl {
  // ----- واحدها -----
  async getUnits() {
    const user = Auth.current();
    if (!user) return [];
    const all = await StorageService.getByOwner('units', user.id);
    return all.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fa'));
  }

  async createUnit(name, symbol = '') {
    const user = Auth.current();
    const unit = {
      id: StorageService.uid('unit_'),
      ownerUserId: user.id,
      name: (name || '').trim(),
      symbol: (symbol || '').trim()
    };
    return await StorageService.put('units', unit);
  }

  async deleteUnit(id) {
    return await StorageService.delete('units', id);
  }

  // ----- گروه‌ها -----
  async getCategories() {
    const user = Auth.current();
    const all = await StorageService.getByOwner('categories', user.id);
    return all.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fa'));
  }

  async createCategory(name, parentId = null) {
    const user = Auth.current();
    const cat = {
      id: StorageService.uid('cat_'),
      ownerUserId: user.id,
      parentId,
      name: (name || '').trim()
    };
    return await StorageService.put('categories', cat);
  }

  async deleteCategory(id) {
    return await StorageService.delete('categories', id);
  }

  // ----- کالاها -----
  async getProducts(filter = {}) {
    const user = Auth.current();
    let list = await StorageService.getByOwner('products', user.id);

    if (filter.search) {
      const q = String(filter.search).toLowerCase();
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.code || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q)
      );
    }
    if (filter.categoryId) {
      list = list.filter(p => p.categoryId === filter.categoryId);
    }
    if (filter.type === 'good') {
      list = list.filter(p => p.trackInventory !== false);
    }
    if (filter.type === 'service') {
      list = list.filter(p => p.trackInventory === false);
    }

    return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  async getProduct(id) {
    return await StorageService.get('products', id);
  }

  async createProduct(data) {
    const user = Auth.current();
    const product = {
      id: StorageService.uid('prod_'),
      ownerUserId: user.id,
      code: (data.code || '').trim(),
      barcode: (data.barcode || '').trim(),
      name: (data.name || '').trim(),
      categoryId: data.categoryId || null,
      unitId: data.unitId || null,
      buyPrice: Number(data.buyPrice) || 0,
      sellPrice: Number(data.sellPrice) || 0,
      trackInventory: data.trackInventory !== false,
      isActiveSell: data.isActiveSell !== false,
      isActiveBuy: data.isActiveBuy !== false,
      description: (data.description || '').trim()
    };
    return await StorageService.put('products', product);
  }

  async updateProduct(id, data) {
    const existing = await StorageService.get('products', id);
    if (!existing) throw new Error('کالا یافت نشد');
    const updated = {
      ...existing,
      code: (data.code || '').trim(),
      barcode: (data.barcode || '').trim(),
      name: (data.name || '').trim(),
      categoryId: data.categoryId || null,
      unitId: data.unitId || null,
      buyPrice: Number(data.buyPrice) || 0,
      sellPrice: Number(data.sellPrice) || 0,
      trackInventory: data.trackInventory !== false,
      isActiveSell: data.isActiveSell !== false,
      isActiveBuy: data.isActiveBuy !== false,
      description: (data.description || '').trim()
    };
    return await StorageService.put('products', updated);
  }

  async deleteProduct(id) {
    const user = Auth.current();
    const movements = await StorageService.getByOwner('stock_movements', user.id);
    const related = movements.filter(m => m.productId === id);
    for (const m of related) {
      await StorageService.delete('stock_movements', m.id);
    }
    return await StorageService.delete('products', id);
  }

  // ----- موجودی -----
  async getStock(productId) {
    const user = Auth.current();
    const movements = await StorageService.getByOwner('stock_movements', user.id);
    const productMoves = movements.filter(m => m.productId === productId);
    let stock = 0;
    productMoves.forEach(m => {
      if (m.type === 'in') stock += Number(m.qty) || 0;
      else if (m.type === 'out') stock -= Number(m.qty) || 0;
      else if (m.type === 'adjust') stock = Number(m.qty) || 0;
    });
    return stock;
  }

  async getStockMap(productIds) {
    const user = Auth.current();
    const movements = await StorageService.getByOwner('stock_movements', user.id);
    const map = {};
    productIds.forEach(id => map[id] = 0);
    movements.forEach(m => {
      if (!(m.productId in map)) return;
      if (m.type === 'in') map[m.productId] += Number(m.qty) || 0;
      else if (m.type === 'out') map[m.productId] -= Number(m.qty) || 0;
      else if (m.type === 'adjust') map[m.productId] = Number(m.qty) || 0;
    });
    return map;
  }

  async addStockMovement(productId, type, qty, refType = 'manual', refId = null, note = '') {
    const user = Auth.current();
    const movement = {
      id: StorageService.uid('mv_'),
      ownerUserId: user.id,
      productId,
      type,
      qty: Number(qty) || 0,
      refType,
      refId,
      note,
      date: new Date().toISOString()
    };
    return await StorageService.put('stock_movements', movement);
  }

  async getMovements(productId) {
    const user = Auth.current();
    const all = await StorageService.getByOwner('stock_movements', user.id);
    return all
      .filter(m => m.productId === productId)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
}

export const ProductController = new ProductControllerImpl();