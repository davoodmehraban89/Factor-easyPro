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
    if (filter.categoryId) list = list.filter(p => p.categoryId === filter.categoryId);
    if (filter.type === 'good') list = list.filter(p => p.trackInventory !== false);
    if (filter.type === 'service') list = list.filter(p => p.trackInventory === false);

    // فیلترهای جدید فاز ۹
    if (filter.stockStatus) {
      const ids = list.map(p => p.id);
      const stockMap = await this.getStockMap(ids);
      if (filter.stockStatus === 'low') {
        list = list.filter(p => {
          if (p.trackInventory === false) return false;
          const s = stockMap[p.id] || 0;
          const min = Number(p.minStock) || 0;
          return s <= min && s > 0;
        });
      } else if (filter.stockStatus === 'out') {
        list = list.filter(p => {
          if (p.trackInventory === false) return false;
          return (stockMap[p.id] || 0) <= 0;
        });
      } else if (filter.stockStatus === 'ok') {
        list = list.filter(p => {
          if (p.trackInventory === false) return false;
          const s = stockMap[p.id] || 0;
          const min = Number(p.minStock) || 0;
          return s > min;
        });
      }
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
      unit: data.unit || 'عدد',
      buyPrice: Number(data.buyPrice) || 0,
      sellPrice: Number(data.sellPrice) || 0,
      trackInventory: data.trackInventory !== false,
      isActiveSell: data.isActiveSell !== false,
      isActiveBuy: data.isActiveBuy !== false,
      minStock: Number(data.minStock) || 0,
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
      unit: data.unit || existing.unit || 'عدد',
      buyPrice: Number(data.buyPrice) || 0,
      sellPrice: Number(data.sellPrice) || 0,
      trackInventory: data.trackInventory !== false,
      isActiveSell: data.isActiveSell !== false,
      isActiveBuy: data.isActiveBuy !== false,
      minStock: Number(data.minStock) || 0,
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
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }

  // ============================================================
  // متدهای جدید فاز ۹
  // ============================================================

  /**
   * کاردکس کامل یک کالا با موجودی تجمعی
   */
  async getKardex(productId) {
    const movements = await this.getMovements(productId);
    let runningBalance = 0;
    let totalIn = 0, totalOut = 0;
    const rows = movements.map(m => {
      const qty = Number(m.qty) || 0;
      if (m.type === 'in') { runningBalance += qty; totalIn += qty; }
      else if (m.type === 'out') { runningBalance -= qty; totalOut += qty; }
      else if (m.type === 'adjust') { runningBalance = qty; }
      return {
        id: m.id,
        date: m.date,
        type: m.type,
        qty,
        balance: runningBalance,
        refType: m.refType,
        refId: m.refId,
        note: m.note || ''
      };
    });
    return { rows, totalIn, totalOut, finalBalance: runningBalance };
  }

  /**
   * کالاهای زیر نقطه سفارش
   */
  async getLowStockProducts() {
    const products = await this.getProducts({ type: 'good' });
    const ids = products.map(p => p.id);
    const stockMap = await this.getStockMap(ids);
    return products.filter(p => {
      const s = stockMap[p.id] || 0;
      const min = Number(p.minStock) || 0;
      return s <= min;
    }).map(p => ({
      ...p,
      currentStock: stockMap[p.id] || 0,
      minStock: Number(p.minStock) || 0,
      deficit: Math.max(0, (Number(p.minStock) || 0) - (stockMap[p.id] || 0))
    }));
  }

  /**
   * جمع ارزش موجودی انبار (بر اساس قیمت خرید و فروش)
   */
  async getTotalStockValue() {
    const products = await this.getProducts({ type: 'good' });
    const ids = products.map(p => p.id);
    const stockMap = await this.getStockMap(ids);
    let totalBuyValue = 0, totalSellValue = 0;
    products.forEach(p => {
      const stock = stockMap[p.id] || 0;
      if (stock > 0) {
        totalBuyValue += stock * (Number(p.buyPrice) || 0);
        totalSellValue += stock * (Number(p.sellPrice) || 0);
      }
    });
    return { totalBuyValue, totalSellValue, potentialProfit: totalSellValue - totalBuyValue };
  }

  /**
   * خلاصه‌ی حرکات انبار
   */
  async getMovementSummary() {
    const user = Auth.current();
    if (!user) return { total: 0, in: 0, out: 0, adjust: 0 };
    const all = await StorageService.getByOwner('stock_movements', user.id);
    const summary = { total: all.length, in: 0, out: 0, adjust: 0 };
    all.forEach(m => {
      if (m.type === 'in') summary.in++;
      else if (m.type === 'out') summary.out++;
      else if (m.type === 'adjust') summary.adjust++;
    });
    return summary;
  }
}

export const ProductController = new ProductControllerImpl();
window.ProductController = ProductController;