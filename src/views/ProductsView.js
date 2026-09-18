// ============================================================
// ProductsView — صفحه‌ی کالا، واحد، گروه
// ============================================================

import { ProductController } from '../controllers/ProductController.js';
import { Modal } from '../core/Modal.js';
import { Toast } from '../core/Toast.js';
import { Formatters } from '../utils/Formatters.js';
import { numberToWords } from '../utils/NumberToWords.js';
import { NumberInput } from '../utils/NumberInput.js';
import { StockKardexModal } from './StockKardexModal.js';

let currentTab = 'products';
let currentSearch = '';
let currentStockFilter = ''; // '' | 'low' | 'out' | 'ok'
let cache = {
  products: [],
  units: [],
  categories: [],
  stockMap: {},
  lowStockCount: 0,
  outOfStockCount: 0,
  totalStockValue: { totalBuyValue: 0, totalSellValue: 0, potentialProfit: 0 }
};

class ProductsViewImpl {
  async render() {
    await this.reload();
    return `
      <div class="page-title">
        <h2>کالا و انبار</h2>
        <p>مدیریت کالاها، خدمات، واحدها، گروه‌ها و موجودی انبار</p>
      </div>

      <div class="tabs">
        <button class="tab-btn ${currentTab === 'products' ? 'active' : ''}" onclick="window.ProductsView._switchTab('products', event)">
          📦 کالاها و خدمات
        </button>
        <button class="tab-btn ${currentTab === 'units' ? 'active' : ''}" onclick="window.ProductsView._switchTab('units', event)">
          📏 واحدها
        </button>
        <button class="tab-btn ${currentTab === 'categories' ? 'active' : ''}" onclick="window.ProductsView._switchTab('categories', event)">
          🗂️ گروه‌ها
        </button>
      </div>

      <div id="products-tab-content">
        ${this.renderTabContent()}
      </div>
    `;
  }

  onMount() {
    window.ProductsView = this;
  }

  async reload() {
    cache.products = await ProductController.getProducts();
    cache.units = await ProductController.getUnits();
    cache.categories = await ProductController.getCategories();
    const ids = cache.products.map(p => p.id);
    cache.stockMap = await ProductController.getStockMap(ids);

    // محاسبه KPI ها
    let lowCount = 0, outCount = 0;
    cache.products.forEach(p => {
      if (p.trackInventory === false) return;
      const s = cache.stockMap[p.id] || 0;
      const min = Number(p.minStock) || 0;
      if (s <= 0) outCount++;
      else if (s <= min) lowCount++;
    });
    cache.lowStockCount = lowCount;
    cache.outOfStockCount = outCount;

    try {
      cache.totalStockValue = await ProductController.getTotalStockValue();
    } catch (e) {
      cache.totalStockValue = { totalBuyValue: 0, totalSellValue: 0, potentialProfit: 0 };
    }
  }

  renderTabContent() {
    if (currentTab === 'products') return this.renderProductsTab();
    if (currentTab === 'units') return this.renderUnitsTab();
    if (currentTab === 'categories') return this.renderCategoriesTab();
    return '';
  }

  _switchTab(tab, evt) {
    currentTab = tab;
    const el = document.getElementById('products-tab-content');
    if (el) {
      document.querySelectorAll('.tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
      const target = (evt && evt.target) ? evt.target.closest('.tab-btn') : null;
      if (target) target.classList.add('active');
      el.innerHTML = this.renderTabContent();
    }
  }

  // ============================================================
  // تب کالاها
  // ============================================================
  renderProductsTab() {
    let filtered = cache.products;

    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(q)
        || (p.code || '').toLowerCase().includes(q)
        || (p.barcode || '').toLowerCase().includes(q)
      );
    }

    if (currentStockFilter) {
      filtered = filtered.filter(p => {
        if (p.trackInventory === false) return false;
        const s = cache.stockMap[p.id] || 0;
        const min = Number(p.minStock) || 0;
        if (currentStockFilter === 'low') return s <= min && s > 0;
        if (currentStockFilter === 'out') return s <= 0;
        if (currentStockFilter === 'ok') return s > min;
        return true;
      });
    }

    let rowsHtml = '';
    if (filtered.length === 0) {
      rowsHtml = `
        <tr><td colspan="7">
          <div class="empty-state">
            <div class="icon">📦</div>
            <h3>هیچ کالایی یافت نشد</h3>
            <p>${currentSearch || currentStockFilter ? 'فیلتر رو تغییر بده یا کالای جدید اضافه کن' : 'اولین کالا یا خدمات خود را اضافه کنید'}</p>
          </div>
        </td></tr>`;
    } else {
      rowsHtml = filtered.map(p => {
        const unit = cache.units.find(u => u.id === p.unitId);
        const cat = cache.categories.find(c => c.id === p.categoryId);
        const stock = cache.stockMap[p.id] || 0;
        const minStock = Number(p.minStock) || 0;
        const isService = p.trackInventory === false;

        let stockHtml;
        if (isService) {
          stockHtml = '<span class="badge badge-muted">خدمت</span>';
        } else if (stock <= 0) {
          stockHtml = `<strong style="color:var(--danger)">${Formatters.number(stock)}</strong> <span class="badge badge-danger" style="font-size:9px">تمام</span>`;
        } else if (stock <= minStock) {
          stockHtml = `<strong style="color:var(--warning)">${Formatters.number(stock)}</strong> <span class="badge badge-warning" style="font-size:9px">کم</span>`;
        } else {
          stockHtml = `<strong style="color:var(--success)">${Formatters.number(stock)}</strong>`;
        }

        return `
          <tr>
            <td><strong>${this._esc(p.code || '—')}</strong></td>
            <td>
              <div style="font-weight:600">${this._esc(p.name)}</div>
              ${cat ? `<small style="color:var(--text-muted);font-size:11px">${this._esc(cat.name)}</small>` : ''}
            </td>
            <td>${unit ? this._esc(unit.name) : (p.unit ? this._esc(p.unit) : '—')}</td>
            <td>${Formatters.money(p.buyPrice)}</td>
            <td>${Formatters.money(p.sellPrice)}</td>
            <td>${stockHtml}</td>
            <td>
              <div class="row-actions">
                ${!isService ? `<button class="icon-btn-sm" title="کاردکس انبار" onclick="window.ProductsView.openKardex('${p.id}')">📊</button>` : ''}
                <button class="icon-btn-sm" title="ویرایش" onclick="window.ProductsView.editProduct('${p.id}')">✏️</button>
                <button class="icon-btn-sm danger" title="حذف" onclick="window.ProductsView.deleteProduct('${p.id}')">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    const totalStockVal = cache.totalStockValue.totalBuyValue || 0;
    const totalSellVal = cache.totalStockValue.totalSellValue || 0;

    return `
      <div class="grid-kpi">
        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--primary)">
          <div class="kpi-card-icon" style="background:#eff6ff;color:var(--primary)">📦</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">تعداد کالا</div>
            <div style="font-size:17px;font-weight:800;color:var(--primary)">${Formatters.number(cache.products.length)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${Formatters.number(cache.products.filter(p => p.trackInventory !== false).length)} فیزیکی</div>
          </div>
        </div>

        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--success)">
          <div class="kpi-card-icon" style="background:#ecfdf5;color:var(--success)">💰</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">ارزش موجودی (خرید)</div>
            <div style="font-size:14px;font-weight:800;color:var(--success)">${Formatters.money(totalStockVal)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">فروش: ${Formatters.money(totalSellVal)}</div>
          </div>
        </div>

        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--warning);cursor:${cache.lowStockCount > 0 ? 'pointer' : 'default'}" onclick="window.ProductsView._setStockFilter('low')">
          <div class="kpi-card-icon" style="background:#fffbeb;color:var(--warning)">⚠️</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">کالاهای کم‌موجود</div>
            <div style="font-size:17px;font-weight:800;color:var(--warning)">${Formatters.number(cache.lowStockCount)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">زیر نقطه سفارش</div>
          </div>
        </div>

        <div class="card kpi-card" style="margin:0;border-top:3px solid var(--danger);cursor:${cache.outOfStockCount > 0 ? 'pointer' : 'default'}" onclick="window.ProductsView._setStockFilter('out')">
          <div class="kpi-card-icon" style="background:#fef2f2;color:var(--danger)">🚨</div>
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">کالاهای تمام‌شده</div>
            <div style="font-size:17px;font-weight:800;color:var(--danger)">${Formatters.number(cache.outOfStockCount)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">موجودی صفر</div>
          </div>
        </div>
      </div>

      <div class="toolbar">
        <div class="search-input-wrap">
          <span class="icon">🔍</span>
          <input type="text" class="form-control" id="productSearch" placeholder="جستجو بر اساس نام، کد یا بارکد..." value="${this._esc(currentSearch)}" oninput="window.ProductsView._onSearch(this.value)" />
        </div>
        <select class="form-control" style="width:auto;min-width:160px" onchange="window.ProductsView._setStockFilter(this.value)">
          <option value="" ${currentStockFilter === '' ? 'selected' : ''}>همه کالاها</option>
          <option value="low" ${currentStockFilter === 'low' ? 'selected' : ''}>⚠️ کم‌موجود</option>
          <option value="out" ${currentStockFilter === 'out' ? 'selected' : ''}>🚨 تمام‌شده</option>
          <option value="ok" ${currentStockFilter === 'ok' ? 'selected' : ''}>✅ موجودی سالم</option>
        </select>
        <button class="btn" onclick="window.ProductsView.openProductModal()">➕ کالای جدید</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:100px">کد</th>
              <th>نام</th>
              <th style="width:90px">واحد</th>
              <th style="width:130px">خرید</th>
              <th style="width:130px">فروش</th>
              <th style="width:120px">موجودی</th>
              <th style="width:130px">عملیات</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  _onSearch(val) {
    currentSearch = val;
    const el = document.getElementById('products-tab-content');
    if (el) el.innerHTML = this.renderProductsTab();
    const input = document.getElementById('productSearch');
    if (input) { input.focus(); input.setSelectionRange(val.length, val.length); }
  }

  _setStockFilter(filter) {
    currentStockFilter = filter;
    const el = document.getElementById('products-tab-content');
    if (el) el.innerHTML = this.renderProductsTab();
  }

  // ============================================================
  // واحدها
  // ============================================================
  renderUnitsTab() {
    let rowsHtml = '';
    if (cache.units.length === 0) {
      rowsHtml = `<tr><td colspan="3"><div class="empty-state"><div class="icon">📏</div><h3>واحدی ثبت نشده</h3><p>واحدهای اندازه‌گیری مثل عدد، کیلوگرم، متر را اضافه کنید</p></div></td></tr>`;
    } else {
      rowsHtml = cache.units.map(u => `
        <tr>
          <td><strong>${this._esc(u.name)}</strong></td>
          <td>${this._esc(u.symbol || '—')}</td>
          <td>
            <div class="row-actions">
              <button class="icon-btn-sm danger" title="حذف" onclick="window.ProductsView.deleteUnit('${u.id}')">🗑️</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
    return `
      <div class="toolbar">
        <button class="btn" onclick="window.ProductsView.openUnitModal()">➕ واحد جدید</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>نام واحد</th><th>نماد</th><th style="width:100px">عملیات</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  // ============================================================
  // گروه‌ها
  // ============================================================
  renderCategoriesTab() {
    let rowsHtml = '';
    if (cache.categories.length === 0) {
      rowsHtml = `<tr><td colspan="3"><div class="empty-state"><div class="icon">🗂️</div><h3>گروهی ثبت نشده</h3><p>کالاها را در گروه‌های مختلف دسته‌بندی کنید</p></div></td></tr>`;
    } else {
      rowsHtml = cache.categories.map(c => {
        const parent = c.parentId ? cache.categories.find(x => x.id === c.parentId) : null;
        return `
          <tr>
            <td><strong>${this._esc(c.name)}</strong></td>
            <td>${parent ? this._esc(parent.name) : '<span class="badge badge-muted">بدون والد</span>'}</td>
            <td>
              <div class="row-actions">
                <button class="icon-btn-sm danger" title="حذف" onclick="window.ProductsView.deleteCategory('${c.id}')">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
    return `
      <div class="toolbar">
        <button class="btn" onclick="window.ProductsView.openCategoryModal()">➕ گروه جدید</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>نام گروه</th><th>گروه والد</th><th style="width:100px">عملیات</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  // ============================================================
  // فرم کالا
  // ============================================================
  async openProductModal(productId = null) {
    const product = productId ? await ProductController.getProduct(productId) : null;
    const isEdit = !!product;
    const data = product || {
      code: '', barcode: '', name: '', categoryId: null, unitId: null,
      buyPrice: 0, sellPrice: 0, trackInventory: true,
      isActiveSell: true, isActiveBuy: true, minStock: 0, description: ''
    };

    const unitOptions = cache.units.map(u =>
      `<option value="${u.id}" ${data.unitId === u.id ? 'selected' : ''}>${this._esc(u.name)}</option>`
    ).join('');

    const catOptions = cache.categories.map(c =>
      `<option value="${c.id}" ${data.categoryId === c.id ? 'selected' : ''}>${this._esc(c.name)}</option>`
    ).join('');

    const body = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">کد کالا</label>
          <input type="text" class="form-control" id="pCode" value="${this._esc(data.code)}" placeholder="مثلاً ۱۰۱" />
        </div>
        <div class="form-group">
          <label class="form-label">بارکد</label>
          <input type="text" class="form-control" id="pBarcode" value="${this._esc(data.barcode)}" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">نام کالا / خدمت <span class="req">*</span></label>
        <input type="text" class="form-control" id="pName" value="${this._esc(data.name)}" placeholder="مثلاً هارد سرور" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">واحد</label>
          <select class="form-control" id="pUnit">${unitOptions}</select>
          <button class="btn-add-inline" onclick="window.ProductsView.openUnitModal(true)">➕ واحد جدید</button>
        </div>
        <div class="form-group">
          <label class="form-label">گروه</label>
          <select class="form-control" id="pCategory">${catOptions}</select>
          <button class="btn-add-inline" onclick="window.ProductsView.openCategoryModal(true)">➕ گروه جدید</button>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">قیمت خرید (ریال)</label>
          <input type="text" inputmode="numeric" class="form-control" id="pBuyPrice" value="${NumberInput.format(data.buyPrice || 0)}" />
        </div>
        <div class="form-group">
          <label class="form-label">قیمت فروش (ریال)</label>
          <input type="text" inputmode="numeric" class="form-control" id="pSellPrice" value="${NumberInput.format(data.sellPrice || 0)}" />
        </div>
      </div>

      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="pTrackInventory" ${data.trackInventory !== false ? 'checked' : ''} onchange="window.ProductsView._toggleMinStock()" />
          <span style="font-size:13px">پیگیری موجودی انبار</span>
        </label>
        <small style="color:var(--text-muted);font-size:11.5px;display:block;margin-top:2px;padding-right:24px">
          اگه این گزینه رو بردارید، این مورد به عنوان «خدمت» ثبت می‌شه و موجودی براش محاسبه نمی‌شه.
        </small>
      </div>

      <div class="form-group" id="minStockBox" style="display:${data.trackInventory !== false ? 'block' : 'none'}">
        <label class="form-label">نقطه سفارش (حداقل موجودی)</label>
        <input type="text" inputmode="numeric" class="form-control" id="pMinStock" value="${NumberInput.format(data.minStock || 0)}" />
        <small style="color:var(--text-muted);font-size:11.5px;display:block;margin-top:4px">
          وقتی موجودی به این عدد یا کمتر رسید، هشدار «کم‌موجود» نمایش داده می‌شه.
        </small>
      </div>

      <div class="form-group">
        <label class="form-label">توضیحات</label>
        <textarea class="form-control" id="pDescription" placeholder="توضیحات اضافی...">${this._esc(data.description)}</textarea>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn" onclick="window.ProductsView.saveProduct(${isEdit ? `'${productId}'` : 'null'})">💾 ذخیره</button>
    `;

    Modal.open({
      title: isEdit ? 'ویرایش کالا' : 'کالای جدید',
      body,
      footer,
      size: 'md'
    });
  }

  _toggleMinStock() {
    const checked = document.getElementById('pTrackInventory').checked;
    document.getElementById('minStockBox').style.display = checked ? 'block' : 'none';
  }

  // ⬇️ متد ویرایش کالا
  async editProduct(id) {
    await this.openProductModal(id);
  }

  async saveProduct(id) {
    const data = {
      code: document.getElementById('pCode').value,
      barcode: document.getElementById('pBarcode').value,
      name: document.getElementById('pName').value,
      unitId: document.getElementById('pUnit').value || null,
      categoryId: document.getElementById('pCategory').value || null,
      buyPrice: NumberInput.parse(document.getElementById('pBuyPrice').value),
      sellPrice: NumberInput.parse(document.getElementById('pSellPrice').value),
      trackInventory: document.getElementById('pTrackInventory').checked,
      minStock: NumberInput.parse(document.getElementById('pMinStock')?.value || '0'),
      description: document.getElementById('pDescription').value
    };

    if (!data.name.trim()) {
      Toast.warning('نام کالا الزامی است');
      return;
    }

    try {
      if (id) {
        await ProductController.updateProduct(id, data);
        Toast.success('کالا با موفقیت ویرایش شد');
      } else {
        await ProductController.createProduct(data);
        Toast.success('کالا با موفقیت ثبت شد');
      }
      Modal.close();
      await this.reload();
      document.getElementById('products-tab-content').innerHTML = this.renderTabContent();
    } catch (err) {
      Toast.error('خطا در ذخیره‌سازی: ' + err.message);
    }
  }

  async deleteProduct(id) {
    const product = cache.products.find(p => p.id === id);
    Modal.confirm({
      title: 'حذف کالا',
      message: `آیا از حذف «${this._esc(product?.name || '')}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`,
      confirmText: 'حذف',
      danger: true,
      onConfirm: async () => {
        try {
          await ProductController.deleteProduct(id);
          Toast.success('کالا حذف شد');
          await this.reload();
          document.getElementById('products-tab-content').innerHTML = this.renderTabContent();
        } catch (err) {
          Toast.error('خطا در حذف: ' + err.message);
        }
      }
    });
  }

  // ============================================================
  // کاردکس
  // ============================================================
  openKardex(productId) {
    StockKardexModal.open(productId);
  }

  // ============================================================
  // فرم واحد
  // ============================================================
  openUnitModal(fromProductForm = false) {
    const body = `
      <div class="form-group">
        <label class="form-label">نام واحد <span class="req">*</span></label>
        <input type="text" class="form-control" id="uName" placeholder="مثلاً عدد، کیلوگرم، متر، بسته" />
      </div>
      <div class="form-group">
        <label class="form-label">نماد (اختیاری)</label>
        <input type="text" class="form-control" id="uSymbol" placeholder="مثلاً kg، m" />
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn" onclick="window.ProductsView.saveUnit(${fromProductForm})">💾 ذخیره</button>
    `;
    Modal.open({ title: 'واحد جدید', body, footer, size: 'sm' });
  }

  async saveUnit(fromProductForm) {
    const name = document.getElementById('uName').value;
    const symbol = document.getElementById('uSymbol').value;
    if (!name.trim()) { Toast.warning('نام واحد الزامی است'); return; }

    try {
      const newUnit = await ProductController.createUnit(name, symbol);
      Toast.success('واحد ثبت شد');

      Modal.close();
      cache.units = await ProductController.getUnits();

      if (fromProductForm) {
        const unitSelect = document.getElementById('pUnit');
        if (unitSelect) {
          unitSelect.innerHTML = cache.units.map(u =>
            `<option value="${u.id}">${this._esc(u.name)}</option>`
          ).join('');
          unitSelect.value = newUnit.id;
        }
      } else {
        const el = document.getElementById('products-tab-content');
        if (el) el.innerHTML = this.renderTabContent();
      }
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  async deleteUnit(id) {
    Modal.confirm({
      title: 'حذف واحد',
      message: 'آیا از حذف این واحد مطمئن هستید؟',
      confirmText: 'حذف',
      danger: true,
      onConfirm: async () => {
        await ProductController.deleteUnit(id);
        Toast.success('واحد حذف شد');
        await this.reload();
        document.getElementById('products-tab-content').innerHTML = this.renderTabContent();
      }
    });
  }

  // ============================================================
  // فرم گروه
  // ============================================================
  openCategoryModal(fromProductForm = false) {
    const parentOptions = cache.categories.map(c =>
      `<option value="${c.id}">${this._esc(c.name)}</option>`
    ).join('');
    const body = `
      <div class="form-group">
        <label class="form-label">نام گروه <span class="req">*</span></label>
        <input type="text" class="form-control" id="cName" placeholder="مثلاً لوازم اداری" />
      </div>
      <div class="form-group">
        <label class="form-label">گروه والد (اختیاری)</label>
        <select class="form-control" id="cParent">
          <option value="">— بدون والد —</option>
          ${parentOptions}
        </select>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn" onclick="window.ProductsView.saveCategory(${fromProductForm})">💾 ذخیره</button>
    `;
    Modal.open({ title: 'گروه جدید', body, footer, size: 'sm' });
  }

  async saveCategory(fromProductForm) {
    const name = document.getElementById('cName').value;
    const parentId = document.getElementById('cParent').value || null;
    if (!name.trim()) { Toast.warning('نام گروه الزامی است'); return; }

    try {
      const newCategory = await ProductController.createCategory(name, parentId);
      Toast.success('گروه ثبت شد');

      Modal.close();
      cache.categories = await ProductController.getCategories();

      if (fromProductForm) {
        const catSelect = document.getElementById('pCategory');
        if (catSelect) {
          catSelect.innerHTML = cache.categories.map(c =>
            `<option value="${c.id}">${this._esc(c.name)}</option>`
          ).join('');
          catSelect.value = newCategory.id;
        }
      } else {
        const el = document.getElementById('products-tab-content');
        if (el) el.innerHTML = this.renderTabContent();
      }
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  async deleteCategory(id) {
    Modal.confirm({
      title: 'حذف گروه',
      message: 'آیا از حذف این گروه مطمئن هستید؟',
      confirmText: 'حذف',
      danger: true,
      onConfirm: async () => {
        await ProductController.deleteCategory(id);
        Toast.success('گروه حذف شد');
        await this.reload();
        document.getElementById('products-tab-content').innerHTML = this.renderTabContent();
      }
    });
  }

  _esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

export const ProductsView = new ProductsViewImpl();
window.ProductsView = ProductsView;