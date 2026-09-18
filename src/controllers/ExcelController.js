// ============================================================
// ExcelController — خروجی و ورودی Excel
// ============================================================

import { StorageService } from '../core/StorageService.js';
import { Auth } from '../core/Auth.js';
import { Jalali } from '../utils/Jalali.js';
import { ContactController } from './ContactController.js';
import { ProductController } from './ProductController.js';
import { Toast } from '../core/Toast.js';

class ExcelControllerImpl {
  // ============================================================
  // ذخیره فایل + نمایش پیام + باز کردن خودکار (سازگار با Tauri)
  // ============================================================
  async _saveFile(wb, fileName) {
    const isTauri = '__TAURI_INTERNALS__' in window;

    // حالت مرورگر: دانلود معمولی
    if (!isTauri) {
      XLSX.writeFile(wb, fileName);
      Toast.success(`فایل «${fileName}» دانلود شد`, 'خروجی Excel');
      return;
    }

    // حالت Tauri: گرفتن مسیر از کاربر + نوشتن + باز کردن
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      const { openPath } = await import('@tauri-apps/plugin-opener');

      const filePath = await save({
        defaultPath: fileName,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
      });

      if (!filePath) {
        Toast.info('ذخیره فایل لغو شد');
        return;
      }

      const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      await writeFile(filePath, new Uint8Array(data));

      Toast.success('فایل با موفقیت ذخیره و باز شد', 'خروجی Excel');

      try {
        await openPath(filePath);
      } catch (openErr) {
        console.warn('خطا در باز کردن فایل:', openErr);
      }
    } catch (err) {
      console.error('خطا در ذخیره فایل:', err);
      Toast.error('خطا در ذخیره فایل: ' + err.message, 'خروجی Excel');
    }
  }

  // ============================================================
  // خروجی کامل (Backup Excel)
  // ============================================================
  async exportAll() {
    const user = Auth.current();
    if (!user) throw new Error('کاربر یافت نشد');

    const [companies, contacts, products, invoices, cheques, treasury, expenses, units, categories] = await Promise.all([
      StorageService.getByOwner('companies', user.id),
      StorageService.getByOwner('contacts', user.id),
      StorageService.getByOwner('products', user.id),
      StorageService.getByOwner('invoices', user.id),
      StorageService.getByOwner('cheques', user.id),
      StorageService.getByOwner('treasury', user.id),
      StorageService.getByOwner('expenses', user.id),
      StorageService.getByOwner('units', user.id),
      StorageService.getByOwner('categories', user.id)
    ]);

    const accounts = treasury.filter(t => t.recordType === 'account');
    const transactions = treasury.filter(t => t.recordType === 'transaction');
    const stockMovements = await StorageService.getByOwner('stock_movements', user.id);

    const wb = XLSX.utils.book_new();

    // ۱. کالاها
    const productsData = [
      ['کد', 'نام', 'مشخصه', 'واحد', 'قیمت خرید', 'قیمت فروش', 'نقطه سفارش', 'موجودی', 'نوع']
    ];
    const stockMap = await ProductController.getStockMap(products.map(p => p.id));
    products.forEach(p => {
      const unit = units.find(u => u.id === p.unitId);
      productsData.push([
        p.code || '',
        p.name || '',
        p.spec || '',
        unit?.name || p.unit || 'عدد',
        Number(p.buyPrice) || 0,
        Number(p.sellPrice) || 0,
        Number(p.minStock) || 0,
        p.trackInventory === false ? '—' : (stockMap[p.id] || 0),
        p.trackInventory === false ? 'خدمت' : 'کالا'
      ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(productsData), 'کالاها');

    // ۲. اشخاص
    const contactsData = [
      ['نام', 'نوع', 'نقش', 'موبایل', 'تلفن', 'کد ملی/شناسه', 'کد اقتصادی', 'شماره ثبت', 'کد پستی', 'نشانی', 'مانده']
    ];
    const balanceMap = await ContactController.getBalanceMap(contacts.map(c => c.id));
    contacts.forEach(c => {
      contactsData.push([
        c.name || '',
        c.entityType === 'legal' ? 'حقوقی' : 'حقیقی',
        c.role === 'customer' ? 'مشتری' : c.role === 'supplier' ? 'تامین‌کننده' : 'هر دو',
        c.mobile || '',
        c.phone || '',
        c.nationalId || '',
        c.economicCode || '',
        c.regNumber || '',
        c.postalCode || '',
        c.address || '',
        Number(balanceMap[c.id]) || 0
      ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(contactsData), 'اشخاص');

    // ۳. فاکتورها (خلاصه)
    const invoicesData = [
      ['شماره', 'تاریخ', 'نوع', 'پیش‌فاکتور', 'فروشنده', 'خریدار', 'جمع کل', 'تخفیف', 'مالیات', 'قابل پرداخت', 'پرداخت‌شده', 'باقیمانده', 'وضعیت', 'توضیحات']
    ];
    const kindLabels = {
      sale: 'فروش', purchase: 'خرید', sale_return: 'برگشت فروش',
      purchase_return: 'برگشت خرید', non_formal: 'غیررسمی'
    };
    invoices.forEach(inv => {
      invoicesData.push([
        inv.number || '',
        inv.date || '',
        kindLabels[inv.kind] || inv.kind,
        inv.isPreInvoice ? 'بله' : 'خیر',
        inv.companyName || '',
        inv.contactName || '',
        Number(inv.subtotal) || 0,
        Number(inv.totalDiscount) || 0,
        Number(inv.vatAmount) || 0,
        Number(inv.grandTotal) || 0,
        Number(inv.paidAmount) || 0,
        Number(inv.remaining) || 0,
        inv.status === 'paid' ? 'تسویه' : inv.status === 'partial' ? 'جزئی' : 'پرداخت‌نشده',
        inv.description || ''
      ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invoicesData), 'فاکتورها');

    // ۴. اقلام فاکتور
    const itemsData = [
      ['شماره فاکتور', 'تاریخ', 'کالا', 'واحد', 'تعداد', 'قیمت واحد', 'تخفیف', 'جمع ردیف']
    ];
    invoices.forEach(inv => {
      (inv.items || []).forEach(it => {
        itemsData.push([
          inv.number || '',
          inv.date || '',
          it.productName || '',
          it.unit || 'عدد',
          Number(it.qty) || 0,
          Number(it.price) || 0,
          Number(it.discount) || 0,
          Number(it.lineTotal) || 0
        ]);
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemsData), 'اقلام فاکتور');

    // ۵. چک‌ها
    const chequesData = [
      ['نوع', 'طرف حساب', 'شماره صیادی', 'بانک', 'شعبه', 'مبلغ', 'تاریخ صدور', 'سررسید', 'وضعیت', 'توضیحات']
    ];
    const chequeStatusLabels = {
      pending: 'در جریان', cleared: 'وصول شده', bounced: 'برگشتی',
      returned: 'عودت داده شده', spent: 'خرج شده'
    };
    cheques.forEach(c => {
      chequesData.push([
        c.direction === 'inbound' ? 'دریافتی' : 'پرداختی',
        c.contactName || '',
        c.sayadNumber || '',
        c.bankName || '',
        c.branchName || '',
        Number(c.amount) || 0,
        c.issueDate || '',
        c.dueDate || '',
        chequeStatusLabels[c.status] || c.status,
        c.description || ''
      ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chequesData), 'چک‌ها');

    // ۶. تراکنش‌ها
    const txData = [
      ['نوع', 'تاریخ', 'طرف حساب', 'از حساب', 'به حساب', 'مبلغ', 'روش', 'توضیحات']
    ];
    const methodLabels = { cash: 'نقدی', card: 'کارت', cheque: 'چک', transfer: 'انتقال' };
    transactions.forEach(t => {
      const fromAcc = accounts.find(a => a.id === t.fromAccountId);
      const toAcc = accounts.find(a => a.id === t.toAccountId);
      txData.push([
        t.type === 'receipt' ? 'دریافت' : t.type === 'payment' ? 'پرداخت' : 'انتقال',
        t.date || '',
        t.contactName || '',
        fromAcc?.name || '',
        toAcc?.name || '',
        Number(t.amount) || 0,
        methodLabels[t.method] || t.method,
        t.description || ''
      ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txData), 'تراکنش‌ها');

    // ۷. هزینه‌ها
    const expData = [
      ['نوع', 'تاریخ', 'سرفصل', 'شرح', 'روش', 'شماره پیگیری', 'مبلغ']
    ];
    expenses.forEach(e => {
      expData.push([
        e.kind === 'income' ? 'درآمد' : 'هزینه',
        e.date || '',
        e.category || '',
        e.description || '',
        methodLabels[e.method] || e.method,
        e.refNumber || '',
        Number(e.amount) || 0
      ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expData), 'هزینه‌ها');

    // ۸. شرکت‌ها
    const compData = [
      ['نام', 'نوع', 'تلفن', 'شناسه ملی', 'کد اقتصادی', 'شماره ثبت', 'کد پستی', 'نشانی']
    ];
    companies.forEach(c => {
      compData.push([
        c.name || '',
        c.entity_type === 'legal' ? 'حقوقی' : 'حقیقی',
        c.phone || '',
        c.national_id || '',
        c.economic_code || '',
        c.reg_number || '',
        c.postal_code || '',
        c.address || ''
      ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(compData), 'شرکت‌ها');

    // ۹. کاردکس انبار
    const mvData = [
      ['کالا', 'نوع حرکت', 'تعداد', 'مرجع', 'یادداشت', 'تاریخ']
    ];
    const typeLabels = { in: 'ورود', out: 'خروج', adjust: 'اصلاح' };
    stockMovements.forEach(m => {
      const p = products.find(prod => prod.id === m.productId);
      mvData.push([
        p?.name || '',
        typeLabels[m.type] || m.type,
        Number(m.qty) || 0,
        m.refType || '',
        m.note || '',
        m.date || ''
      ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mvData), 'کاردکس');

    // ذخیره + پیام
    const date = Jalali.today().replace(/\//g, '-');
    await this._saveFile(wb, `finora-backup-${date}.xlsx`);

    return {
      sheets: 9,
      counts: {
        products: products.length,
        contacts: contacts.length,
        invoices: invoices.length,
        items: itemsData.length - 1,
        cheques: cheques.length,
        transactions: transactions.length,
        expenses: expenses.length,
        companies: companies.length,
        movements: stockMovements.length
      }
    };
  }

  // ============================================================
  // خروجی انتخابی
  // ============================================================
  async exportSection(section) {
    const user = Auth.current();
    if (!user) throw new Error('کاربر یافت نشد');

    const wb = XLSX.utils.book_new();
    const date = Jalali.today().replace(/\//g, '-');

    switch (section) {
      case 'products': {
        const products = await StorageService.getByOwner('products', user.id);
        const units = await StorageService.getByOwner('units', user.id);
        const stockMap = await ProductController.getStockMap(products.map(p => p.id));
        const data = [['کد', 'نام', 'مشخصه', 'واحد', 'قیمت خرید', 'قیمت فروش', 'نقطه سفارش', 'موجودی']];
        products.forEach(p => {
          const unit = units.find(u => u.id === p.unitId);
          data.push([
            p.code || '', p.name || '', p.spec || '',
            unit?.name || p.unit || 'عدد',
            Number(p.buyPrice) || 0,
            Number(p.sellPrice) || 0,
            Number(p.minStock) || 0,
            p.trackInventory === false ? '—' : (stockMap[p.id] || 0)
          ]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'کالاها');
        await this._saveFile(wb, `finora-products-${date}.xlsx`);
        return { count: products.length };
      }

      case 'contacts': {
        const contacts = await StorageService.getByOwner('contacts', user.id);
        const balanceMap = await ContactController.getBalanceMap(contacts.map(c => c.id));
        const data = [['نام', 'نوع', 'نقش', 'موبایل', 'تلفن', 'کد ملی/شناسه', 'کد پستی', 'نشانی', 'مانده']];
        contacts.forEach(c => {
          data.push([
            c.name || '',
            c.entityType === 'legal' ? 'حقوقی' : 'حقیقی',
            c.role === 'customer' ? 'مشتری' : c.role === 'supplier' ? 'تامین‌کننده' : 'هر دو',
            c.mobile || '', c.phone || '', c.nationalId || '',
            c.postalCode || '', c.address || '',
            Number(balanceMap[c.id]) || 0
          ]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'اشخاص');
        await this._saveFile(wb, `finora-contacts-${date}.xlsx`);
        return { count: contacts.length };
      }

      case 'invoices': {
        const invoices = await StorageService.getByOwner('invoices', user.id);
        const data = [['شماره', 'تاریخ', 'نوع', 'خریدار', 'جمع', 'تخفیف', 'مالیات', 'قابل پرداخت', 'پرداخت‌شده', 'باقیمانده']];
        invoices.forEach(inv => {
          data.push([
            inv.number || '', inv.date || '',
            inv.kindLabel || inv.kind || '',
            inv.contactName || '',
            Number(inv.subtotal) || 0,
            Number(inv.totalDiscount) || 0,
            Number(inv.vatAmount) || 0,
            Number(inv.grandTotal) || 0,
            Number(inv.paidAmount) || 0,
            Number(inv.remaining) || 0
          ]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'فاکتورها');
        await this._saveFile(wb, `finora-invoices-${date}.xlsx`);
        return { count: invoices.length };
      }

      case 'cheques': {
        const cheques = await StorageService.getByOwner('cheques', user.id);
        const data = [['نوع', 'طرف حساب', 'شماره صیادی', 'بانک', 'مبلغ', 'سررسید', 'وضعیت']];
        cheques.forEach(c => {
          data.push([
            c.direction === 'inbound' ? 'دریافتی' : 'پرداختی',
            c.contactName || '', c.sayadNumber || '', c.bankName || '',
            Number(c.amount) || 0, c.dueDate || '', c.status || ''
          ]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'چک‌ها');
        await this._saveFile(wb, `finora-cheques-${date}.xlsx`);
        return { count: cheques.length };
      }

      case 'expenses': {
        const expenses = await StorageService.getByOwner('expenses', user.id);
        const data = [['نوع', 'تاریخ', 'سرفصل', 'شرح', 'مبلغ']];
        expenses.forEach(e => {
          data.push([
            e.kind === 'income' ? 'درآمد' : 'هزینه',
            e.date || '', e.category || '',
            e.description || '', Number(e.amount) || 0
          ]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'هزینه‌ها');
        await this._saveFile(wb, `finora-expenses-${date}.xlsx`);
        return { count: expenses.length };
      }

      default:
        throw new Error('بخش نامعتبر');
    }
  }

  // ============================================================
  // ورودی از Excel
  // ============================================================
  async readExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const result = {};
          workbook.SheetNames.forEach(sheetName => {
            result[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
          });
          resolve(result);
        } catch (err) {
          reject(new Error('خطا در خواندن فایل اکسل: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('خطا در خواندن فایل'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * پیش‌نمایش فایل قبل از ایمپورت
   */
  async previewFile(file) {
    const data = await this.readExcelFile(file);
    const sheets = Object.keys(data).map(name => ({
      name,
      count: data[name].length,
      sample: data[name].slice(0, 3)
    }));
    return { sheets, raw: data };
  }

  /**
   * ایمپورت کالاها از Excel
   */
  async importProducts(rawData, options = {}) {
    const user = Auth.current();
    if (!user) throw new Error('کاربر یافت نشد');

    const sheetName = Object.keys(rawData).find(n =>
      n.includes('کالا') || n.toLowerCase().includes('product')
    ) || Object.keys(rawData)[0];

    const rows = rawData[sheetName] || [];
    if (rows.length === 0) throw new Error('شیت کالاها خالی است');

    const mode = options.mode || 'merge';
    const existing = await StorageService.getByOwner('products', user.id);

    if (mode === 'replace') {
      for (const p of existing) {
        await StorageService.delete('products', p.id);
      }
    }

    let added = 0, skipped = 0;
    for (const row of rows) {
      const name = row['نام'] || row['نام کالا'] || row['عنوان'];
      if (!name) { skipped++; continue; }

      const code = String(row['کد'] || row['کد کالا'] || '').trim();
      if (mode === 'merge' && code && existing.some(p => p.code === code)) {
        skipped++;
        continue;
      }

      const product = {
        id: StorageService.uid('prod_'),
        ownerUserId: user.id,
        code,
        name: String(name).trim(),
        spec: String(row['مشخصه'] || row['مشخصه و نوع'] || '').trim(),
        unit: String(row['واحد'] || 'عدد').trim(),
        unitId: null,
        categoryId: null,
        buyPrice: Number(row['قیمت خرید'] || row['قیمت خرید (ریال)'] || 0) || 0,
        sellPrice: Number(row['قیمت فروش'] || row['قیمت فروش (ریال)'] || 0) || 0,
        minStock: Number(row['نقطه سفارش'] || 0) || 0,
        trackInventory: (row['نوع'] || '').toString().includes('خدمت') ? false : true,
        isActiveSell: true,
        isActiveBuy: true,
        description: ''
      };
      await StorageService.put('products', product);
      added++;
    }

    return { added, skipped, mode };
  }

  /**
   * ایمپورت اشخاص از Excel
   */
  async importContacts(rawData, options = {}) {
    const user = Auth.current();
    if (!user) throw new Error('کاربر یافت نشد');

    const sheetName = Object.keys(rawData).find(n =>
      n.includes('اشخاص') || n.toLowerCase().includes('contact')
    ) || Object.keys(rawData)[0];

    const rows = rawData[sheetName] || [];
    if (rows.length === 0) throw new Error('شیت اشخاص خالی است');

    const mode = options.mode || 'merge';
    const existing = await StorageService.getByOwner('contacts', user.id);

    if (mode === 'replace') {
      for (const c of existing) {
        await StorageService.delete('contacts', c.id);
      }
    }

    let added = 0, skipped = 0;
    for (const row of rows) {
      const name = row['نام'] || row['نام شخص یا شرکت'] || row['نام شخص'];
      if (!name) { skipped++; continue; }

      const mobile = String(row['موبایل'] || row['شماره همراه'] || '').trim();
      if (mode === 'merge' && mobile && existing.some(c => c.mobile === mobile)) {
        skipped++;
        continue;
      }

      const entityType = (row['نوع'] || row['نوع (حقیقی/حقوقی)'] || '').toString().includes('حقوقی') ? 'legal' : 'natural';

      const contact = {
        id: StorageService.uid('contact_'),
        ownerUserId: user.id,
        entityType,
        role: (row['نقش'] || '').toString().includes('تامین') ? 'supplier' : 'customer',
        prefix: '',
        name: String(name).trim(),
        mobile,
        phone: String(row['تلفن'] || '').trim(),
        nationalId: String(row['کد ملی/شناسه'] || row['شناسه یا کد ملی'] || row['کد ملی'] || '').trim(),
        economicCode: String(row['کد اقتصادی'] || '').trim(),
        regNumber: String(row['شماره ثبت'] || '').trim(),
        postalCode: String(row['کد پستی'] || '').trim(),
        address: String(row['نشانی'] || '').trim(),
        tags: [],
        note: '',
        isActive: true
      };
      await StorageService.put('contacts', contact);
      added++;
    }

    return { added, skipped, mode };
  }

  // ============================================================
  // دانلود قالب‌های نمونه
  // ============================================================
  async downloadProductsTemplate() {
    const data = [
      ['کد', 'نام', 'مشخصه', 'واحد', 'قیمت خرید', 'قیمت فروش', 'نقطه سفارش', 'نوع'],
      ['P001', 'هارد سرور 2.5 اینچ', 'SAS 1TB', 'عدد', 30000000, 37000000, 5, 'کالا'],
      ['P002', 'سوئیچ 24 پورت', 'با 2 پاور', 'عدد', 1800000000, 2180000000, 2, 'کالا'],
      ['S001', 'خدمات نصب و راه‌اندازی', '', 'ساعت', 0, 5000000, 0, 'خدمت']
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'کالاها');
    await this._saveFile(wb, 'finora-products-template.xlsx');
  }

  async downloadContactsTemplate() {
    const data = [
      ['نام', 'نوع', 'نقش', 'موبایل', 'تلفن', 'کد ملی/شناسه', 'کد اقتصادی', 'شماره ثبت', 'کد پستی', 'نشانی'],
      ['شرکت آرا بتن', 'حقوقی', 'مشتری', '09124376991', '', '14008507476', '14008507476', '544926', '1445956311', 'تهران'],
      ['آقای احمدی', 'حقیقی', 'مشتری', '09121111111', '', '1234567890', '', '', '1234567890', 'اصفهان']
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'اشخاص');
    await this._saveFile(wb, 'finora-contacts-template.xlsx');
  }
}

export const ExcelController = new ExcelControllerImpl();
window.ExcelController = ExcelController;