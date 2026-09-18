// ============================================================
// InvoicePrint — چاپ فاکتور با ۳ قالب و تنظیمات زنده
// ============================================================

import { InvoiceController } from '../controllers/InvoiceController.js';
import { ContactController } from '../controllers/ContactController.js';
import { StorageService } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';
import { Modal } from '../core/Modal.js';
import { Toast } from '../core/Toast.js';
import { Formatters } from '../utils/Formatters.js';
import { numberToWords } from '../utils/NumberToWords.js';

class InvoicePrintImpl {
  constructor() {
    this.currentInvoiceId = null;
    this.settings = {
      template: 'non_formal',      // formal | non_formal | thermal
      paperSize: 'A4',
      orientation: 'portrait',
      showSignature: true,
      showCode: true,
      themeColor: '#0d9488',
      showBalance: 'none'           // none | simple | detailed
    };
  }

  // ============================================================
  // باز کردن تنظیمات چاپ
  // ============================================================
  async openSettings(invoiceId) {
    this.currentInvoiceId = invoiceId;
    const inv = await InvoiceController.get(invoiceId);
    if (!inv) { Toast.error('فاکتور یافت نشد'); return; }

    // پیش‌فرض بر اساس نوع سند
    if (inv.kind === 'formal') this.settings.template = 'formal';
    else if (inv.kind === 'non_formal') this.settings.template = 'non_formal';
    else this.settings.template = 'non_formal';

    const body = `
      <div class="form-group">
        <label class="form-label">قالب چاپ</label>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <label class="print-tpl-card ${this.settings.template === 'formal' ? 'active' : ''}" data-tpl="formal">
            <input type="radio" name="tpl" value="formal" ${this.settings.template === 'formal' ? 'checked' : ''} style="display:none" />
            <div style="font-size:24px">📋</div>
            <div style="font-weight:700;font-size:12.5px;margin-top:4px">فاکتور رسمی</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">مطابق مالیاتی</div>
          </label>
          <label class="print-tpl-card ${this.settings.template === 'non_formal' ? 'active' : ''}" data-tpl="non_formal">
            <input type="radio" name="tpl" value="non_formal" ${this.settings.template === 'non_formal' ? 'checked' : ''} style="display:none" />
            <div style="font-size:24px">📄</div>
            <div style="font-weight:700;font-size:12.5px;margin-top:4px">غیررسمی</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">فروشگاهی مدرن</div>
          </label>
          <label class="print-tpl-card ${this.settings.template === 'thermal' ? 'active' : ''}" data-tpl="thermal">
            <input type="radio" name="tpl" value="thermal" ${this.settings.template === 'thermal' ? 'checked' : ''} style="display:none" />
            <div style="font-size:24px">🧾</div>
            <div style="font-weight:700;font-size:12.5px;margin-top:4px">فیش حرارتی</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">۸۰ میلی‌متری</div>
          </label>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">اندازه کاغذ</label>
          <select class="form-control" id="prPaper">
            <option value="A4" ${this.settings.paperSize === 'A4' ? 'selected' : ''}>A4</option>
            <option value="A5" ${this.settings.paperSize === 'A5' ? 'selected' : ''}>A5</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">جهت صفحه</label>
          <select class="form-control" id="prOrientation">
            <option value="portrait" ${this.settings.orientation === 'portrait' ? 'selected' : ''}>عمودی</option>
            <option value="landscape" ${this.settings.orientation === 'landscape' ? 'selected' : ''}>افقی</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">رنگ سربرگ</label>
          <input type="color" class="form-control" id="prColor" value="${this.settings.themeColor}" style="height:42px;padding:4px" />
        </div>
      </div>

      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="prSignature" ${this.settings.showSignature ? 'checked' : ''} />
          نمایش محل مهر و امضا
        </label>
      </div>

      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="prCode" ${this.settings.showCode ? 'checked' : ''} />
          نمایش کد کالا در جدول
        </label>
      </div>

      <div class="form-group">
        <label class="form-label">نمایش وضعیت حساب مشتری</label>
        <select class="form-control" id="prBalance">
          <option value="none" ${this.settings.showBalance === 'none' ? 'selected' : ''}>عدم نمایش</option>
          <option value="simple" ${this.settings.showBalance === 'simple' ? 'selected' : ''}>فقط مانده فعلی</option>
        </select>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">انصراف</button>
      <button class="btn btn-secondary" onclick="window.InvoicePrint._preview()">👁️ پیش‌نمایش</button>
      <button class="btn" onclick="window.InvoicePrint._print()">🖨️ چاپ</button>
    `;

    Modal.open({ title: 'تنظیمات چاپ فاکتور', body, footer, size: 'md' });

    // ذخیره تنظیمات در ctx
    setTimeout(() => {
      document.querySelectorAll('.print-tpl-card').forEach(card => {
        card.addEventListener('click', () => {
          document.querySelectorAll('.print-tpl-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          card.querySelector('input').checked = true;
        });
      });
    }, 50);
  }

  _collectSettings() {
    // فقط اگه فیلدهای تنظیمات توی صفحه موجودن، مقدار جدید رو بگیر
    // وگرنه از مقدار قبلی (this.settings) استفاده کن
    const tpl = document.querySelector('input[name="tpl"]:checked');
    if (tpl) this.settings.template = tpl.value;

    const paper = document.getElementById('prPaper');
    if (paper) this.settings.paperSize = paper.value;

    const orientation = document.getElementById('prOrientation');
    if (orientation) this.settings.orientation = orientation.value;

    const color = document.getElementById('prColor');
    if (color) this.settings.themeColor = color.value;

    const sig = document.getElementById('prSignature');
    if (sig) this.settings.showSignature = sig.checked;

    const code = document.getElementById('prCode');
    if (code) this.settings.showCode = code.checked;

    const bal = document.getElementById('prBalance');
    if (bal) this.settings.showBalance = bal.value;

    return this.settings;
  }

  async _preview() {
    this._collectSettings();
    const html = await this._buildHtml(this.currentInvoiceId);
    // نمایش پیش‌نمایش در یک مودال جدید
    const body = `
      <div style="background:#e5e7eb;padding:20px;border-radius:8px;overflow:auto;max-height:70vh">
        <div style="background:#fff;margin:0 auto;max-width:${this.settings.template === 'thermal' ? '80mm' : '210mm'};box-shadow:0 4px 20px rgba(0,0,0,.15)">
          ${html}
        </div>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="FINORA.Modal.close()">بستن</button>
      <button class="btn" onclick="window.InvoicePrint._print()">🖨️ چاپ</button>
    `;
    Modal.open({ title: 'پیش‌نمایش چاپ', body, footer, size: 'lg' });
  }

  async _print() {
    this._collectSettings();
    const html = await this._buildHtml(this.currentInvoiceId);
    this._openPrintWindow(html);
    Modal.close();
  }

  // ============================================================
  // ساخت HTML چاپ
  // ============================================================
  async _buildHtml(invoiceId) {
    const inv = await InvoiceController.get(invoiceId);
    if (!inv) throw new Error('فاکتور یافت نشد');

    const user = Auth.current();
    const companies = await StorageService.getByOwner('companies', user.id);
    const seller = companies[0] || {
      name: 'شرکت شما',
      phone: '', address: '', national_id: '', economic_code: '',
      reg_number: '', postal_code: '', footer: ''
    };

    const contact = inv.contactId ? await StorageService.get('contacts', inv.contactId) : {};

    let balance = 0;
    if (this.settings.showBalance !== 'none' && inv.contactId) {
      balance = await ContactController.getBalance(inv.contactId);
    }

    if (this.settings.template === 'formal') {
      return this._formalTemplate(inv, seller, contact, balance);
    } else if (this.settings.template === 'thermal') {
      return this._thermalTemplate(inv, seller, contact);
    } else {
      return this._nonFormalTemplate(inv, seller, contact, balance);
    }
  }

  // ------------------------------------------------------------
  // قالب فاکتور رسمی
  // ------------------------------------------------------------
  _formalTemplate(inv, seller, contact, balance) {
    const color = this.settings.themeColor;
    const showCode = this.settings.showCode;

    const items = inv.items.map((it, idx) => {
      const qty = Number(it.qty) || 0;
      const price = Number(it.price) || 0;
      const lineSub = qty * price;
      const disc = Number(it.discount) || 0;
      const afterDisc = lineSub - disc;
      const vat = inv.vatEnabled ? Math.round(afterDisc * (Number(inv.vatRate) || 0) / 100) : 0;
      const net = afterDisc + vat;
      return `
        <tr>
          <td>${Formatters.toPersianDigits(idx + 1)}</td>
          <td style="text-align:right">${this._esc(it.productName)}</td>
          <td>${Formatters.toPersianDigits(qty)}</td>
          <td>${this._esc(it.unit || 'عدد')}</td>
          <td>${Formatters.number(price)}</td>
          <td>${Formatters.number(lineSub)}</td>
          <td>${Formatters.number(disc)}</td>
          <td>${Formatters.number(vat)}</td>
          <td style="font-weight:700">${Formatters.number(net)}</td>
        </tr>
      `;
    }).join('');

    const balanceHtml = this.settings.showBalance === 'simple' && balance !== 0 ? `
      <div style="margin-top:6px;padding:6px 10px;background:#fef3c7;border-radius:6px;font-size:10px">
        <strong>مانده حساب فعلی مشتری:</strong>
        ${balance > 0 ? Formatters.money(balance) + ' بدهکار' : Formatters.money(Math.abs(balance)) + ' بستانکار'}
      </div>
    ` : '';

    return `
      <div class="print-doc" dir="rtl" style="direction:rtl;text-align:right;font-family:'Vazirmatn FD',Tahoma,sans-serif;color:#000;padding:6mm">
        <table style="width:100%;border-collapse:collapse;border:2px solid ${color};margin-bottom:4px">
          <tr>
            <td style="width:28%;border:1px solid ${color};padding:6px;font-size:11px;vertical-align:middle">
              <div style="font-weight:bold;font-size:13px;color:${color}">${this._esc(seller.name)}</div>
              <div style="font-size:9.5px;color:#475569;margin-top:2px">صادرکننده فاکتور رسمی</div>
            </td>
            <td style="width:44%;border:1px solid ${color};padding:8px;text-align:center;vertical-align:middle;background:#f0fdfa">
              <h1 style="font-size:16px;margin:0;font-weight:bold;color:${color}">صورتحساب فروش کالا و خدمات</h1>
              <div style="font-size:10px;margin-top:3px">(ماده ۱۶۹ مکرر قانون مالیات‌های مستقیم)</div>
            </td>
            <td style="width:28%;border:1px solid ${color};padding:6px;font-size:10.5px;vertical-align:middle;text-align:left">
              <div>شماره سریال: <strong style="color:#b91c1c">${Formatters.toPersianDigits(inv.number)}</strong></div>
              <div style="margin-top:2px">تاریخ صدور: <strong>${Formatters.toPersianDigits(inv.date)}</strong></div>
            </td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;border:1.5px solid ${color};font-size:10.5px;margin-bottom:4px">
          <tr style="background:#f8fafc;font-weight:bold">
            <td colspan="4" style="border:1px solid ${color};padding:3px 8px;color:${color}">الف) مشخصات فروشنده</td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;width:15%;background:#f1f5f9">نام شخص حقیقی/حقوقی:</td>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;width:35%"><strong>${this._esc(seller.name)}</strong></td>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;width:15%;background:#f1f5f9">شماره اقتصادی:</td>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;width:35%">${this._esc(seller.economic_code || '—')}</td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;background:#f1f5f9">شناسه ملی / شماره ثبت:</td>
            <td style="border:1px solid #cbd5e1;padding:4px 8px">${this._esc(seller.national_id || '—')} / ${this._esc(seller.reg_number || '—')}</td>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;background:#f1f5f9">کد پستی ۱۰ رقمی:</td>
            <td style="border:1px solid #cbd5e1;padding:4px 8px">${Formatters.toPersianDigits(seller.postal_code || '—')}</td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;background:#f1f5f9">نشانی و تلفن:</td>
            <td colspan="3" style="border:1px solid #cbd5e1;padding:4px 8px">${this._esc(seller.address || '—')}${seller.phone ? ' | تلفن: ' + Formatters.phone(seller.phone) : ''}</td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;border:1.5px solid ${color};font-size:10.5px;margin-bottom:4px">
          <tr style="background:#f8fafc;font-weight:bold">
            <td colspan="4" style="border:1px solid ${color};padding:3px 8px;color:${color}">ب) مشخصات خریدار</td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;width:15%;background:#f1f5f9">نام شخص حقیقی/حقوقی:</td>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;width:35%"><strong>${this._esc(contact.name || inv.contactName || '—')}</strong></td>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;width:15%;background:#f1f5f9">شماره اقتصادی:</td>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;width:35%">${this._esc(contact.economicCode || '—')}</td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;background:#f1f5f9">شناسه ملی / شماره ثبت:</td>
            <td style="border:1px solid #cbd5e1;padding:4px 8px">${this._esc(contact.nationalId || '—')} / ${this._esc(contact.regNumber || '—')}</td>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;background:#f1f5f9">کد پستی ۱۰ رقمی:</td>
            <td style="border:1px solid #cbd5e1;padding:4px 8px">${Formatters.toPersianDigits(contact.postalCode || '—')}</td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;background:#f1f5f9">نشانی و تلفن:</td>
            <td colspan="3" style="border:1px solid #cbd5e1;padding:4px 8px">${this._esc(contact.address || '—')}${contact.mobile ? ' | همراه: ' + Formatters.phone(contact.mobile) : ''}</td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;border:1.5px solid ${color};font-size:10.5px">
          <thead>
            <tr style="background:${color};color:#fff;font-weight:bold;text-align:center">
              <th style="border:1px solid ${color};padding:4px;width:30px">ردیف</th>
              <th style="border:1px solid ${color};padding:4px 6px;text-align:right">شرح کالا یا خدمات</th>
              <th style="border:1px solid ${color};padding:4px;width:50px">تعداد</th>
              <th style="border:1px solid ${color};padding:4px;width:50px">واحد</th>
              <th style="border:1px solid ${color};padding:4px;width:90px">مبلغ واحد</th>
              <th style="border:1px solid ${color};padding:4px;width:100px">مبلغ کل</th>
              <th style="border:1px solid ${color};padding:4px;width:75px">تخفیف</th>
              <th style="border:1px solid ${color};padding:4px;width:80px">مالیات</th>
              <th style="border:1px solid ${color};padding:4px;width:110px">مبلغ نهایی</th>
            </tr>
          </thead>
          <tbody>${items}</tbody>
        </table>

        <table style="width:100%;border-collapse:collapse;border:1.5px solid ${color};font-size:10.5px;margin-top:4px">
          <tr>
            <td style="width:60%;border:1px solid ${color};padding:8px;vertical-align:top;background:#f8fafc">
              <div style="margin-bottom:5px"><strong>مبلغ کل به حروف:</strong> ${numberToWords(inv.grandTotal)}</div>
              <div style="margin-bottom:5px"><strong>شرایط و نحوه پرداخت:</strong> ${this._paymentLabel(inv.paymentMethod)}</div>
              ${inv.description ? `<div style="margin-bottom:5px"><strong>توضیحات:</strong> ${this._esc(inv.description)}</div>` : ''}
              ${balanceHtml}
            </td>
            <td style="width:40%;border:1px solid ${color};padding:0">
              <table style="width:100%;border-collapse:collapse;font-size:10.5px">
                <tr><td style="border-bottom:1px solid #cbd5e1;padding:4px 10px">جمع کل اقلام:</td><td style="border-bottom:1px solid #cbd5e1;padding:4px 10px;text-align:left">${Formatters.money(inv.subtotal)}</td></tr>
                <tr><td style="border-bottom:1px solid #cbd5e1;padding:4px 10px">مجموع تخفیف:</td><td style="border-bottom:1px solid #cbd5e1;padding:4px 10px;text-align:left">${Formatters.money(inv.totalDiscount)}</td></tr>
                ${inv.vatEnabled ? `<tr><td style="border-bottom:1px solid #cbd5e1;padding:4px 10px">مالیات (${Formatters.toPersianDigits(inv.vatRate)}٪):</td><td style="border-bottom:1px solid #cbd5e1;padding:4px 10px;text-align:left">${Formatters.money(inv.vatAmount)}</td></tr>` : ''}
                <tr style="background:#f0fdfa;font-weight:bold;font-size:12px;color:${color}">
                  <td style="padding:6px 10px">مبلغ قابل پرداخت:</td>
                  <td style="padding:6px 10px;text-align:left">${Formatters.money(inv.grandTotal)}</td>
                </tr>
                ${inv.paidAmount > 0 ? `<tr><td style="padding:4px 10px">پرداخت‌شده:</td><td style="padding:4px 10px;text-align:left">${Formatters.money(inv.paidAmount)}</td></tr>` : ''}
                ${inv.remaining > 0 ? `<tr><td style="padding:4px 10px;color:#b91c1c"><strong>باقیمانده:</strong></td><td style="padding:4px 10px;text-align:left;color:#b91c1c;font-weight:bold">${Formatters.money(inv.remaining)}</td></tr>` : ''}
              </table>
            </td>
          </tr>
        </table>

        ${this.settings.showSignature ? `
          <table style="width:100%;border-collapse:collapse;border:1px solid ${color};margin-top:8px;text-align:center;font-size:11px">
            <tr>
              <td style="width:50%;height:70px;vertical-align:top;border:1px solid ${color};padding:6px;background:#fff"><div style="font-weight:bold">مهر و امضای فروشنده</div></td>
              <td style="width:50%;height:70px;vertical-align:top;border:1px solid ${color};padding:6px;background:#fff"><div style="font-weight:bold">مهر و امضای خریدار</div></td>
            </tr>
          </table>
        ` : ''}
      </div>
    `;
  }

  // ------------------------------------------------------------
  // قالب غیررسمی
  // ------------------------------------------------------------
  _nonFormalTemplate(inv, seller, contact, balance) {
    const color = this.settings.themeColor;

    const items = inv.items.map((it, idx) => {
      const qty = Number(it.qty) || 0;
      const price = Number(it.price) || 0;
      const lineSub = qty * price;
      const disc = Number(it.discount) || 0;
      const total = lineSub - disc;
      return `
        <tr>
          <td style="text-align:center">${Formatters.toPersianDigits(idx + 1)}</td>
          <td style="text-align:right">${this._esc(it.productName)}</td>
          <td style="text-align:center">${this._esc(it.unit || 'عدد')}</td>
          <td style="text-align:center">${Formatters.toPersianDigits(qty)}</td>
          <td style="text-align:left">${Formatters.number(price)}</td>
          <td style="text-align:left">${Formatters.number(disc)}</td>
          <td style="text-align:left;font-weight:700">${Formatters.number(total)}</td>
        </tr>
      `;
    }).join('');

    const balanceHtml = this.settings.showBalance === 'simple' && balance !== 0 ? `
      <div style="margin-top:8px;padding:8px 12px;background:#fef3c7;border-radius:8px;font-size:11px">
        <strong>مانده حساب فعلی مشتری:</strong>
        ${balance > 0 ? Formatters.money(balance) + ' بدهکار' : Formatters.money(Math.abs(balance)) + ' بستانکار'}
      </div>
    ` : '';

    return `
      <div class="print-doc" dir="rtl" style="direction:rtl;text-align:right;font-family:'Vazirmatn FD',Tahoma,sans-serif;color:#000;padding:8mm">
        <div style="display:flex;justify-content:space-between;align-items:start;padding-bottom:12px;border-bottom:3px solid ${color};margin-bottom:14px">
          <div style="flex:1">
            <div style="font-size:20px;font-weight:800;color:${color}">${this._esc(seller.name)}</div>
            ${seller.address ? `<div style="font-size:11px;color:#64748b;margin-top:4px">${this._esc(seller.address)}</div>` : ''}
            ${seller.phone ? `<div style="font-size:11px;color:#64748b;margin-top:2px">تلفن: ${Formatters.phone(seller.phone)}</div>` : ''}
          </div>
          <div style="text-align:left;min-width:180px">
            <div style="font-size:22px;font-weight:800;color:${color};margin-bottom:6px">${inv.isPreInvoice ? 'پیش‌فاکتور' : 'فاکتور فروش'}</div>
            <div style="font-size:12px;background:${color};color:#fff;padding:6px 12px;border-radius:6px;font-weight:700;display:inline-block">#${Formatters.toPersianDigits(inv.number)}</div>
            <div style="font-size:11px;color:#475569;margin-top:6px">تاریخ: ${Formatters.toPersianDigits(inv.date)}</div>
          </div>
        </div>

        <div style="display:flex;gap:12px;margin-bottom:14px">
          <div style="flex:1;background:#f8fafc;padding:10px 12px;border-radius:8px;border-right:3px solid ${color}">
            <div style="font-size:11px;font-weight:700;color:${color};margin-bottom:6px">فروشنده</div>
            <div style="font-size:12px;font-weight:600">${this._esc(seller.name)}</div>
            ${seller.national_id ? `<div style="font-size:10.5px;color:#64748b;margin-top:2px">شناسه ملی: ${Formatters.toPersianDigits(seller.national_id)}</div>` : ''}
            ${seller.phone ? `<div style="font-size:10.5px;color:#64748b;margin-top:2px">تلفن: ${Formatters.phone(seller.phone)}</div>` : ''}
          </div>
          <div style="flex:1;background:#f8fafc;padding:10px 12px;border-radius:8px;border-right:3px solid ${color}">
            <div style="font-size:11px;font-weight:700;color:${color};margin-bottom:6px">خریدار</div>
            <div style="font-size:12px;font-weight:600">${this._esc(contact.name || inv.contactName || '—')}</div>
            ${contact.mobile ? `<div style="font-size:10.5px;color:#64748b;margin-top:2px">همراه: ${Formatters.phone(contact.mobile)}</div>` : ''}
            ${contact.address ? `<div style="font-size:10.5px;color:#64748b;margin-top:2px;line-height:1.5">${this._esc(contact.address)}</div>` : ''}
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px">
          <thead>
            <tr style="background:${color};color:#fff">
              <th style="padding:8px 4px;width:40px;text-align:center;border-radius:0 6px 0 0">#</th>
              <th style="padding:8px 8px;text-align:right">شرح کالا یا خدمات</th>
              <th style="padding:8px 4px;width:60px;text-align:center">واحد</th>
              <th style="padding:8px 4px;width:60px;text-align:center">مقدار</th>
              <th style="padding:8px 4px;width:100px;text-align:left">قیمت واحد</th>
              <th style="padding:8px 4px;width:90px;text-align:left">تخفیف</th>
              <th style="padding:8px 4px;width:110px;text-align:left;border-radius:6px 0 0 0">جمع</th>
            </tr>
          </thead>
          <tbody>${items}</tbody>
        </table>

        <div style="display:flex;gap:14px;align-items:stretch">
          <div style="flex:1">
            <div style="background:#f8fafc;padding:12px;border-radius:8px;font-size:11px;line-height:1.9">
              <div style="font-weight:700;color:${color};margin-bottom:6px">مبلغ به حروف:</div>
              <div>${numberToWords(inv.grandTotal)}</div>
              ${inv.description ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #cbd5e1"><strong>توضیحات:</strong> ${this._esc(inv.description)}</div>` : ''}
              ${balanceHtml}
            </div>
          </div>
          <div style="flex:0 0 280px">
            <table style="width:100%;border-collapse:collapse;font-size:11.5px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
              <tr style="background:#f8fafc"><td style="padding:8px 12px">جمع اقلام:</td><td style="padding:8px 12px;text-align:left">${Formatters.money(inv.subtotal)}</td></tr>
              ${inv.totalDiscount > 0 ? `<tr><td style="padding:8px 12px">تخفیف:</td><td style="padding:8px 12px;text-align:left;color:#dc2626">- ${Formatters.money(inv.totalDiscount)}</td></tr>` : ''}
              ${inv.vatEnabled ? `<tr><td style="padding:8px 12px">مالیات (${Formatters.toPersianDigits(inv.vatRate)}٪):</td><td style="padding:8px 12px;text-align:left;color:#d97706">${Formatters.money(inv.vatAmount)}</td></tr>` : ''}
              <tr style="background:${color};color:#fff;font-weight:700;font-size:14px"><td style="padding:10px 12px">قابل پرداخت:</td><td style="padding:10px 12px;text-align:left">${Formatters.money(inv.grandTotal)}</td></tr>
              ${inv.paidAmount > 0 ? `<tr><td style="padding:6px 12px">پرداخت‌شده:</td><td style="padding:6px 12px;text-align:left;color:#059669">${Formatters.money(inv.paidAmount)}</td></tr>` : ''}
              ${inv.remaining > 0 ? `<tr style="background:#fef2f2"><td style="padding:6px 12px;color:#b91c1c;font-weight:700">باقیمانده:</td><td style="padding:6px 12px;text-align:left;color:#b91c1c;font-weight:700">${Formatters.money(inv.remaining)}</td></tr>` : ''}
            </table>
          </div>
        </div>

        ${this.settings.showSignature ? `
          <div style="display:flex;justify-content:space-between;gap:20px;margin-top:24px;padding-top:14px;border-top:1px dashed #cbd5e1">
            <div style="flex:1;text-align:center;font-size:11px;color:#64748b">
              <div style="font-weight:700;color:#0f172a;margin-bottom:40px">مهر و امضای فروشنده</div>
            </div>
            <div style="flex:1;text-align:center;font-size:11px;color:#64748b">
              <div style="font-weight:700;color:#0f172a;margin-bottom:40px">مهر و امضای خریدار</div>
            </div>
          </div>
        ` : ''}

        ${seller.footer ? `<div style="margin-top:20px;padding:10px;background:#f8fafc;border-radius:6px;font-size:10.5px;color:#64748b;text-align:center">${this._esc(seller.footer)}</div>` : ''}
      </div>
    `;
  }

  // ------------------------------------------------------------
  // قالب فیش حرارتی
  // ------------------------------------------------------------
  _thermalTemplate(inv, seller, contact) {
    const items = inv.items.map((it, idx) => {
      const qty = Number(it.qty) || 0;
      const price = Number(it.price) || 0;
      const total = qty * price - (Number(it.discount) || 0);
      return `
        <tr>
          <td style="text-align:right;padding:2px 0;font-size:10px">${this._esc(it.productName)}</td>
          <td style="text-align:center;padding:2px 0;font-size:10px">${Formatters.toPersianDigits(qty)}</td>
          <td style="text-align:left;padding:2px 0;font-size:10px">${Formatters.number(total)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="print-doc" dir="rtl" style="direction:rtl;text-align:right;font-family:'Vazirmatn FD',Tahoma,monospace;color:#000;padding:3mm;width:76mm;font-size:11px;background:#fff">
        <div style="text-align:center;padding-bottom:6px;border-bottom:1px dashed #000;margin-bottom:6px">
          <div style="font-size:14px;font-weight:800">${this._esc(seller.name)}</div>
          ${seller.phone ? `<div style="font-size:10px;margin-top:2px">تلفن: ${Formatters.phone(seller.phone)}</div>` : ''}
          ${seller.address ? `<div style="font-size:9px;margin-top:2px">${this._esc(seller.address)}</div>` : ''}
        </div>

        <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:4px">
          <div>شماره: ${Formatters.toPersianDigits(inv.number)}</div>
          <div>تاریخ: ${Formatters.toPersianDigits(inv.date)}</div>
        </div>

        <div style="font-size:10px;padding:4px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;margin-bottom:6px">
          مشتری: ${this._esc(contact.name || inv.contactName || '—')}
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:6px">
          <thead>
            <tr style="border-bottom:1px solid #000">
              <th style="text-align:right;padding:3px 0">شرح</th>
              <th style="text-align:center;padding:3px 0;width:30px">تعداد</th>
              <th style="text-align:left;padding:3px 0;width:70px">مبلغ</th>
            </tr>
          </thead>
          <tbody>${items}</tbody>
        </table>

        <div style="border-top:1px dashed #000;padding-top:6px;font-size:11px">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <span>جمع کل:</span>
            <span>${Formatters.number(inv.subtotal)}</span>
          </div>
          ${inv.totalDiscount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>تخفیف:</span><span>- ${Formatters.number(inv.totalDiscount)}</span></div>` : ''}
          ${inv.vatEnabled ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>مالیات:</span><span>${Formatters.number(inv.vatAmount)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:800;padding:6px 0;border-top:1px solid #000;border-bottom:1px solid #000;margin:4px 0">
            <span>قابل پرداخت:</span>
            <span>${Formatters.number(inv.grandTotal)}</span>
          </div>
          ${inv.paidAmount > 0 ? `<div style="display:flex;justify-content:space-between;margin-top:3px"><span>پرداخت:</span><span>${Formatters.number(inv.paidAmount)}</span></div>` : ''}
          ${inv.remaining > 0 ? `<div style="display:flex;justify-content:space-between;margin-top:3px;font-weight:700"><span>باقیمانده:</span><span>${Formatters.number(inv.remaining)}</span></div>` : ''}
        </div>

        <div style="text-align:center;margin-top:8px;padding-top:6px;border-top:1px dashed #000;font-size:9.5px">
          ${seller.footer ? this._esc(seller.footer) : 'از خرید شما سپاسگزاریم'}
        </div>
        <div style="text-align:center;font-size:9px;margin-top:4px;color:#64748b">
          فینورا پرو
        </div>
      </div>
    `;
  }

  // ============================================================
  // باز کردن پنجره چاپ
  // ============================================================
    _openPrintWindow(html) {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      Toast.error('لطفاً پاپ‌آپ را فعال کنید');
      return;
    }

    // تعیین اندازه‌ی صفحه
    let pageCss = 'A4 portrait';
    if (this.settings.template === 'thermal') {
      pageCss = '80mm auto';
    } else {
      const size = this.settings.paperSize === 'A5' ? 'A5' : 'A4';
      pageCss = size + ' ' + (this.settings.orientation || 'portrait');
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>چاپ فاکتور</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/misc/Farsi-Digits/Vazirmatn-FD-font-face.css" />
        <style>
          /* @page باید بیرون از @media print باشه تا درست اعمال بشه */
          @page {
            size: ${pageCss};
            margin: 6mm;
          }

          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body {
            direction: rtl;
            text-align: right;
            font-family: 'Vazirmatn FD', Tahoma, sans-serif;
            background: #fff;
            color: #000;
          }
          body { padding: 4px; }
          table { direction: rtl; }
          td, th { direction: rtl; }
          .print-doc { direction: rtl !important; }

          @media print {
            body { padding: 0; }
            .print-doc { page-break-inside: auto; }
            /* جلوگیری از چاپ رنگ‌های پیش‌فرض */
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        </style>
      </head>
      <body>${html}</body>
      </html>
    `);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  }

  _paymentLabel(method) {
    const labels = { cash: 'نقدی ☑', credit: 'نسیه/چک ☑', partial: 'پرداخت جزئی ☑' };
    return labels[method] || '—';
  }

  _esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

export const InvoicePrint = new InvoicePrintImpl();
window.InvoicePrint = InvoicePrint;