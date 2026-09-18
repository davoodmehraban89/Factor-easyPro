// ============================================================
// InvoiceFormView — فرم صدور و ویرایش فاکتور
// ============================================================

import { InvoiceController } from '../controllers/InvoiceController.js';
import { ContactController } from '../controllers/ContactController.js';
import { ProductController } from '../controllers/ProductController.js';
import { Modal } from '../core/Modal.js';
import { Toast } from '../core/Toast.js';
import { Formatters } from '../utils/Formatters.js';
import { numberToWords } from '../utils/NumberToWords.js';

let ctx = {
  editId: null,
  data: null,
  contacts: [],
  products: [],
  rowCounter: 0
};

class InvoiceFormViewImpl {
  // ============================================================
  // باز کردن فرم فاکتور (ایجاد یا ویرایش)
  // ============================================================
  async open(invoiceId = null) {
    ctx.editId = invoiceId;
    ctx.contacts = await ContactController.getAll();
    ctx.products = await ProductController.getProducts();
    ctx.rowCounter = 0;

    if (invoiceId) {
      const existing = await InvoiceController.get(invoiceId);
      ctx.data = existing;
    } else {
      ctx.data = {
        kind: 'sale',
        isPreInvoice: false,
        date: this._todayJalali(),
        contactId: null,
        contactName: '',
        items: [],
        discountType: 'fixed',
        discountInput: 0,
        vatEnabled: false,
        vatRate: 9,
        paymentMethod: 'cash',
        paidAmount: 0,
        description: ''
      };
    }

    // اگه فاکتور جدید بدون اقلام، یک ردیف خالی اضافه کن
    if (!ctx.data.items || ctx.data.items.length === 0) {
      ctx.data.items = [this._emptyItem()];
    }

    const body = this._renderFormBody();
    const footer = this._renderFooter();

    const modal = Modal.open({
      title: invoiceId ? `ویرایش فاکتور #${ctx.data.number}` : 'صدور فاکتور جدید',
      body,
      footer,
      size: 'lg',
      onClose: () => { ctx = { editId: null, data: null, contacts: [], products: [], rowCounter: 0 }; }
    });

    // بعد از باز شدن مودال، اقلام رو رندر کن
    setTimeout(() => {
      this._renderItems();
      this._recalc();
    }, 50);
  }

  _emptyItem() {
    return {
      productId: null,
      productName: '',
      unit: 'عدد',
      qty: 1,
      price: 0,
      discount: 0,
      discountType: 'fixed',
      lineSubtotal: 0,
      lineTotal: 0
    };
  }

  // ============================================================
  // ساختار فرم
  // ============================================================
  _renderFormBody() {
    const d = ctx.data;
    const kindOptions = [
      { value: 'sale', label: 'فاکتور فروش' },
      { value: 'purchase', label: 'فاکتور خرید' },
      { value: 'sale_return', label: 'برگشت از فروش' },
      { value: 'purchase_return', label: 'برگشت از خرید' },
      { value: 'non_formal', label: 'فاکتور غیررسمی' }
    ];
    const kindOpts = kindOptions.map(k =>
      `<option value="${k.value}" ${d.kind === k.value ? 'selected' : ''}>${k.label}</option>`
    ).join('');

    const contactOptions = ctx.contacts.map(c =>
      `<option value="${c.id}" ${d.contactId === c.id ? 'selected' : ''}>${this._esc(c.name)}</option>`
    ).join('');

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">نوع سند</label>
          <select class="form-control" id="invKind" onchange="window.InvoiceFormView._onKindChange()">${kindOpts}</select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">شماره فاکتور</label>
          <input type="text" class="form-control" value="${d.number ? '#' + d.number : '(خودکار)'}" disabled style="background:var(--bg)" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">تاریخ (شمسی)</label>
          <input type="text" class="form-control" id="invDate" value="${this._esc(d.date)}" placeholder="1405/06/27" />
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-bottom:14px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">طرف حساب</label>
          <div style="display:flex;gap:6px">
            <select class="form-control" id="invContact" style="flex:1">
              <option value="">— انتخاب کنید —</option>
              ${contactOptions}
            </select>
            <button class="btn btn-secondary" style="min-height:42px;padding:0 12px" onclick="window.InvoiceFormView._openQuickContact()" title="افزودن شخص جدید">➕</button>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">
            <input type="checkbox" id="invPreInvoice" ${d.isPreInvoice ? 'checked' : ''} />
            پیش‌فاکتور
          </label>
          <small style="color:var(--text-muted);font-size:11px;display:block;margin-top:6px">پیش‌فاکتور، موجودی انبار رو تغییر نمی‌ده</small>
        </div>
      </div>

      <div style="margin:14px 0 10px;display:flex;justify-content:space-between;align-items:center">
        <h4 style="font-size:14px;font-weight:700">اقلام فاکتور</h4>
        <button class="btn btn-secondary" style="min-height:34px;padding:4px 12px;font-size:12px" onclick="window.InvoiceFormView._addRow()">➕ افزودن ردیف</button>
      </div>

      <div class="table-wrap" style="max-height:340px;overflow-y:auto">
        <table>
          <thead>
            <tr>
              <th style="width:36px;text-align:center">#</th>
              <th style="min-width:200px">کالا / خدمات</th>
              <th style="width:70px">واحد</th>
              <th style="width:80px">مقدار</th>
              <th style="width:130px">قیمت واحد</th>
              <th style="width:130px">تخفیف</th>
              <th style="width:140px">جمع</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="itemsBody"></tbody>
        </table>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
        <div class="card" style="margin:0;padding:16px">
          <div style="font-weight:700;font-size:13px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border)">تخفیف، مالیات و پرداخت</div>

          <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
            <span style="flex:1;font-size:12.5px">تخفیف کلی</span>
            <select class="form-control" id="invDiscType" style="width:80px;min-height:34px" onchange="window.InvoiceFormView._onDiscTypeChange()">
              <option value="fixed" ${d.discountType === 'fixed' ? 'selected' : ''}>مبلغ</option>
              <option value="percent" ${d.discountType === 'percent' ? 'selected' : ''}>درصد</option>
            </select>
            <input type="number" class="form-control" id="invDiscInput" style="width:110px;min-height:34px" value="${d.discountInput || 0}" oninput="window.InvoiceFormView._recalc()" />
          </div>

          <div id="vatRow" style="display:${d.kind === 'non_formal' ? 'none' : 'flex'};gap:8px;align-items:center;margin-bottom:10px">
            <label style="flex:1;font-size:12.5px;display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="invVatEnabled" ${d.vatEnabled ? 'checked' : ''} onchange="window.InvoiceFormView._recalc()" />
              مالیات ارزش افزوده
            </label>
            <input type="number" class="form-control" id="invVatRate" style="width:80px;min-height:34px" value="${d.vatRate || 9}" oninput="window.InvoiceFormView._recalc()" />
            <span style="font-size:12.5px;color:var(--text-muted)">٪</span>
          </div>

          <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
            <span style="flex:1;font-size:12.5px">روش پرداخت</span>
            <select class="form-control" id="invPayment" style="min-height:34px" onchange="window.InvoiceFormView._onPaymentChange()">
              <option value="cash" ${d.paymentMethod === 'cash' ? 'selected' : ''}>نقدی</option>
              <option value="credit" ${d.paymentMethod === 'credit' ? 'selected' : ''}>نسیه</option>
              <option value="partial" ${d.paymentMethod === 'partial' ? 'selected' : ''}>پرداخت جزئی</option>
            </select>
          </div>

          <div id="paidRow" style="display:${d.paymentMethod === 'partial' ? 'flex' : 'none'};gap:8px;align-items:center;margin-bottom:10px">
            <span style="flex:1;font-size:12.5px">مبلغ پرداخت‌شده</span>
            <input type="number" class="form-control" id="invPaidAmount" style="width:140px;min-height:34px" value="${d.paidAmount || 0}" oninput="window.InvoiceFormView._recalc()" />
          </div>

          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="font-size:12px">توضیحات</label>
            <textarea class="form-control" id="invDescription" rows="2" style="font-size:12.5px">${this._esc(d.description)}</textarea>
          </div>
        </div>

        <div class="card" style="margin:0;padding:16px;background:var(--bg)">
          <div style="font-weight:700;font-size:13px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border)">جمع‌بندی</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px">
            <span>جمع اقلام:</span>
            <span id="sumSubtotal" style="font-weight:600">۰ ریال</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px">
            <span>تخفیف:</span>
            <span id="sumDiscount" style="font-weight:600;color:var(--danger)">۰ ریال</span>
          </div>
          <div id="sumVatRow" style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px">
            <span>مالیات:</span>
            <span id="sumVat" style="font-weight:600;color:var(--warning)">۰ ریال</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:2px solid var(--primary);font-size:15px">
            <span style="font-weight:700;color:var(--primary)">قابل پرداخت:</span>
            <span id="sumGrand" style="font-weight:800;color:var(--primary)">۰ ریال</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12.5px">
            <span>پرداخت‌شده:</span>
            <span id="sumPaid">۰ ریال</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12.5px">
            <span>باقیمانده:</span>
            <span id="sumRemaining" style="font-weight:700;color:var(--danger)">۰ ریال</span>
          </div>
          <div id="sumWords" style="margin-top:14px;padding:10px;background:var(--card-bg);border-radius:8px;font-size:11px;color:var(--text-muted);line-height:1.7;text-align:justify"></div>
        </div>
      </div>
    `;
  }

  _renderFooter() {
    return `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn" onclick="window.InvoiceFormView._save(false)">💾 ذخیره</button>
      <button class="btn btn-success" onclick="window.InvoiceFormView._save(true)">💾 ذخیره و چاپ</button>
    `;
  }

  // ============================================================
  // رندر اقلام
  // ============================================================
  _renderItems() {
    const tbody = document.getElementById('itemsBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    ctx.data.items.forEach((item, idx) => this._renderRow(item, idx));
  }

  _renderRow(item, idx) {
    const tbody = document.getElementById('itemsBody');
    const row = document.createElement('tr');
    row.dataset.idx = idx;

    const productOptions = ctx.products.map(p =>
      `<option value="${p.id}" ${item.productId === p.id ? 'selected' : ''}>${this._esc(p.name)}${p.code ? ' (' + this._esc(p.code) + ')' : ''}</option>`
    ).join('');

    row.innerHTML = `
      <td style="text-align:center;font-weight:700">${Formatters.toPersianDigits(idx + 1)}</td>
      <td>
        <select class="form-control row-product" style="min-height:36px" onchange="window.InvoiceFormView._onProductChange(${idx}, this.value)">
          <option value="">— انتخاب کالا —</option>
          ${productOptions}
        </select>
      </td>
      <td><input type="text" class="form-control row-unit" style="min-height:36px;text-align:center" value="${this._esc(item.unit)}" oninput="window.InvoiceFormView._onFieldChange(${idx}, 'unit', this.value)" /></td>
      <td><input type="number" class="form-control row-qty" style="min-height:36px;text-align:center" value="${item.qty}" min="0" step="any" oninput="window.InvoiceFormView._onFieldChange(${idx}, 'qty', this.value)" /></td>
      <td><input type="number" class="form-control row-price" style="min-height:36px;text-align:left" value="${item.price}" min="0" oninput="window.InvoiceFormView._onFieldChange(${idx}, 'price', this.value)" /></td>
      <td>
        <div style="display:flex;gap:4px">
          <input type="number" class="form-control row-disc" style="min-height:36px;text-align:left;flex:1" value="${item.discountType === 'percent' ? (item.discountInput || 0) : (item.discount || 0)}" min="0" oninput="window.InvoiceFormView._onFieldChange(${idx}, 'discount', this.value)" />
          <select class="form-control" style="min-height:36px;width:60px;padding:0 6px;text-align:center;font-size:12px" onchange="window.InvoiceFormView._onDiscTypeRowChange(${idx}, this.value)">
            <option value="fixed" ${item.discountType === 'fixed' ? 'selected' : ''}>مبلغ</option>
            <option value="percent" ${item.discountType === 'percent' ? 'selected' : ''}>٪</option>
          </select>
        </div>
      </td>
      <td class="row-total" style="font-weight:700;text-align:left">${Formatters.money(item.lineTotal || 0)}</td>
      <td style="text-align:center">
        <button class="icon-btn-sm danger" onclick="window.InvoiceFormView._removeRow(${idx})" title="حذف">✕</button>
      </td>
    `;
    tbody.appendChild(row);
  }

  _addRow() {
    ctx.data.items.push(this._emptyItem());
    this._renderItems();
    this._recalc();
  }

  _removeRow(idx) {
    if (ctx.data.items.length === 1) {
      Toast.warning('حداقل یک ردیف لازم است');
      return;
    }
    ctx.data.items.splice(idx, 1);
    this._renderItems();
    this._recalc();
  }

  _onProductChange(idx, productId) {
    const product = ctx.products.find(p => p.id === productId);
    if (product) {
      ctx.data.items[idx].productId = product.id;
      ctx.data.items[idx].productName = product.name;
      ctx.data.items[idx].unit = product.unitId
        ? (window.__units_cache?.[product.unitId] || 'عدد')
        : (product.unit || 'عدد');
      ctx.data.items[idx].price = Number(product.sellPrice) || 0;
    } else {
      ctx.data.items[idx].productId = null;
      ctx.data.items[idx].productName = '';
    }
    // به‌روزرسانی فیلدهای ردیف بدون رندر کامل
    const row = document.querySelector(`#itemsBody tr[data-idx="${idx}"]`);
    if (row) {
      row.querySelector('.row-unit').value = ctx.data.items[idx].unit;
      row.querySelector('.row-price').value = ctx.data.items[idx].price;
    }
    this._recalc();
  }

  _onFieldChange(idx, field, value) {
    if (field === 'qty' || field === 'price' || field === 'discount') {
      ctx.data.items[idx][field] = Number(value) || 0;
    } else {
      ctx.data.items[idx][field] = value;
    }
    this._recalc();
  }

  _onDiscTypeRowChange(idx, type) {
    ctx.data.items[idx].discountType = type;
    ctx.data.items[idx].discount = 0;
    ctx.data.items[idx].discountInput = 0;
    const row = document.querySelector(`#itemsBody tr[data-idx="${idx}"]`);
    if (row) row.querySelector('.row-disc').value = 0;
    this._recalc();
  }

  _onKindChange() {
    const kind = document.getElementById('invKind').value;
    ctx.data.kind = kind;
    const vatRow = document.getElementById('vatRow');
    const sumVatRow = document.getElementById('sumVatRow');
    if (kind === 'non_formal') {
      vatRow.style.display = 'none';
      sumVatRow.style.display = 'none';
      document.getElementById('invVatEnabled').checked = false;
    } else {
      vatRow.style.display = 'flex';
      sumVatRow.style.display = 'flex';
    }
    this._recalc();
  }

  _onDiscTypeChange() {
    ctx.data.discountType = document.getElementById('invDiscType').value;
    document.getElementById('invDiscInput').value = 0;
    ctx.data.discountInput = 0;
    this._recalc();
  }

  _onPaymentChange() {
    const method = document.getElementById('invPayment').value;
    ctx.data.paymentMethod = method;
    const paidRow = document.getElementById('paidRow');
    if (method === 'partial') {
      paidRow.style.display = 'flex';
    } else {
      paidRow.style.display = 'none';
      document.getElementById('invPaidAmount').value = 0;
    }
    this._recalc();
  }

  // ============================================================
  // محاسبه‌ی مجدد
  // ============================================================
  _recalc() {
    // اقلام
    let subtotal = 0;
    const tbody = document.getElementById('itemsBody');
    if (tbody) {
      ctx.data.items.forEach((item, idx) => {
        const qty = Number(item.qty) || 0;
        const price = Number(item.price) || 0;
        const lineSubtotal = qty * price;
        let lineDiscount = 0;
        const discInput = Number(item.discountInput !== undefined ? item.discountInput : item.discount) || 0;
        if (item.discountType === 'percent') {
          lineDiscount = Math.round(lineSubtotal * discInput / 100);
        } else {
          lineDiscount = discInput;
        }
        lineDiscount = Math.max(0, Math.min(lineDiscount, lineSubtotal));
        item.lineSubtotal = lineSubtotal;
        item.lineTotal = lineSubtotal - lineDiscount;
        item.discount = lineDiscount;
        item.discountInput = discInput;
        subtotal += item.lineTotal;

        const row = tbody.querySelector(`tr[data-idx="${idx}"]`);
        if (row) {
          const totalEl = row.querySelector('.row-total');
          if (totalEl) totalEl.textContent = Formatters.money(item.lineTotal);
        }
      });
    }

    // تخفیف کلی
    const discType = document.getElementById('invDiscType')?.value || 'fixed';
    const discInput = Number(document.getElementById('invDiscInput')?.value) || 0;
    let totalDiscount = 0;
    if (discType === 'percent') {
      totalDiscount = Math.round(subtotal * discInput / 100);
    } else {
      totalDiscount = discInput;
    }
    totalDiscount = Math.max(0, Math.min(totalDiscount, subtotal));
    const afterDiscount = subtotal - totalDiscount;

    // مالیات
    const kind = document.getElementById('invKind')?.value || 'sale';
    const vatEnabled = kind !== 'non_formal' && document.getElementById('invVatEnabled')?.checked;
    const vatRate = Number(document.getElementById('invVatRate')?.value) || 0;
    let vatAmount = 0;
    if (vatEnabled) vatAmount = Math.round(afterDiscount * vatRate / 100);

    const grandTotal = afterDiscount + vatAmount;

    // پرداخت
    const method = document.getElementById('invPayment')?.value || 'cash';
    let paidAmount = 0;
    if (method === 'cash') paidAmount = grandTotal;
    else if (method === 'credit') paidAmount = 0;
    else if (method === 'partial') paidAmount = Math.max(0, Math.min(Number(document.getElementById('invPaidAmount')?.value) || 0, grandTotal));
    const remaining = grandTotal - paidAmount;

    // نمایش
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('sumSubtotal', Formatters.money(subtotal));
    set('sumDiscount', Formatters.money(totalDiscount));
    set('sumVat', Formatters.money(vatAmount));
    set('sumGrand', Formatters.money(grandTotal));
    set('sumPaid', Formatters.money(paidAmount));
    set('sumRemaining', Formatters.money(remaining));

    const wordsEl = document.getElementById('sumWords');
    if (wordsEl) wordsEl.textContent = numberToWords(grandTotal);

    // ذخیره در ctx برای استفاده در save
    ctx.totals = { subtotal, totalDiscount, vatAmount, grandTotal, paidAmount, remaining };
  }

  // ============================================================
  // افزودن سریع شخص
  // ============================================================
  async _openQuickContact() {
    const body = `
      <div class="form-group">
        <label class="form-label">نام <span class="req">*</span></label>
        <input type="text" class="form-control" id="qcName" />
      </div>
      <div class="form-group">
        <label class="form-label">موبایل</label>
        <input type="tel" class="form-control" id="qcMobile" />
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn" onclick="window.InvoiceFormView._saveQuickContact()">ذخیره</button>
    `;
    Modal.open({ title: 'شخص جدید سریع', body, footer, size: 'sm' });
  }

  async _saveQuickContact() {
    const name = document.getElementById('qcName').value.trim();
    const mobile = document.getElementById('qcMobile').value.trim();
    if (!name) { Toast.warning('نام الزامی است'); return; }
    try {
      const newContact = await ContactController.create({
        entityType: 'natural', role: 'customer', name, mobile
      });
      Toast.success('شخص اضافه شد');
      // refresh dropdown
      const select = document.getElementById('invContact');
      const opt = document.createElement('option');
      opt.value = newContact.id;
      opt.textContent = newContact.name;
      opt.selected = true;
      select.appendChild(opt);
      Modal.close();
    } catch (err) {
      Toast.error('خطا: ' + err.message);
    }
  }

  // ============================================================
  // ذخیره
  // ============================================================
  async _save(printAfter) {
    const contactId = document.getElementById('invContact').value;
    if (!contactId) {
      Toast.warning('لطفاً طرف حساب را انتخاب کنید');
      return;
    }
    const contact = ctx.contacts.find(c => c.id === contactId);
    if (!contact) {
      Toast.warning('طرف حساب انتخاب شده معتبر نیست');
      return;
    }

    // اعتبارسنجی اقلام
    const validItems = ctx.data.items.filter(it => it.productId && (Number(it.qty) || 0) > 0);
    if (validItems.length === 0) {
      Toast.warning('حداقل یک ردیف معتبر (کالا با مقدار) لازم است');
      return;
    }

    const data = {
      kind: document.getElementById('invKind').value,
      isPreInvoice: document.getElementById('invPreInvoice').checked,
      date: document.getElementById('invDate').value,
      contactId: contact.id,
      contactName: contact.name,
      items: validItems,
      discountType: document.getElementById('invDiscType').value,
      discountInput: Number(document.getElementById('invDiscInput').value) || 0,
      vatEnabled: document.getElementById('invVatEnabled')?.checked || false,
      vatRate: Number(document.getElementById('invVatRate')?.value) || 0,
      paymentMethod: document.getElementById('invPayment').value,
      paidAmount: Number(document.getElementById('invPaidAmount')?.value) || 0,
      description: document.getElementById('invDescription').value
    };

    try {
      const saved = await InvoiceController.save(data, ctx.editId);
      Toast.success(ctx.editId ? 'فاکتور ویرایش شد' : `فاکتور #${saved.number} صادر شد`);
      const savedId = saved.id;
      Modal.close();
      if (printAfter) {
        const { InvoicePrint } = await import('../utils/InvoicePrint.js');
        setTimeout(() => InvoicePrint.print(savedId), 200);
      }
      // refresh list
      if (window.InvoicesView) window.InvoicesView.reloadAndRender?.();
    } catch (err) {
      console.error(err);
      Toast.error('خطا: ' + err.message);
    }
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

  _esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

export const InvoiceFormView = new InvoiceFormViewImpl();
window.InvoiceFormView = InvoiceFormView;