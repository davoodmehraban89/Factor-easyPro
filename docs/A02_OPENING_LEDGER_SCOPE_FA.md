# A02 — ثبت کنترل‌شده دفتر افتتاحیه با اطلاعات پایه موجود

## وضعیت

این عملیات **فقط سند دفتر کل افتتاحیه** را از روی داده‌های پایه و مانده‌های
**از قبل ایجادشده** می‌سازد. هیچ فاکتور قدیمی، ریز مانده شخص، گردش انبار،
تراکنش بانک/صندوق یا چک را وارد نمی‌کند. بنابراین پایان کامل مهاجرت A02 نیست.

## ورودی مورد انتظار

`OpeningBalanceService.preview(input)` و `commit(input, {confirmation})`
هر دو با یک ساختار ورودی کار می‌کنند:

```js
{
  periodId: 'fp-existing',
  openingDate: '1405/01/01',
  lines: [
    { accountId: 'receivable-id', role: 'receivable', debit: 300, credit: 0 },
    { accountId: 'payable-id', role: 'payable', debit: 0, credit: 200 },
    { accountId: 'inventory-id', role: 'inventory', debit: 500, credit: 0 },
    { accountId: 'cash-ledger-id', role: 'cash', debit: 100, credit: 0 },
    { accountId: 'capital-id', role: 'equity', debit: 0, credit: 700 }
  ],
  contacts: [{ contactId: 'existing-contact', receivable: 300, payable: 200 }],
  stock: [{
    warehouseId: 'existing-warehouse', productId: 'existing-product',
    quantityUnits: 1000, value: 500
  }],
  cash: [{ accountId: 'existing-treasury-account', balance: 100 }]
}
```

تمام شناسه‌ها باید متعلق به **شرکت فعال و قابل دسترس** باشند.
`accountId` در `lines` شناسه **حساب دفتر کل** است؛
`accountId` در `cash` شناسه **حساب بانک/صندوق خزانه** است.
آن‌ها را یکی فرض نکنید.

## گیت‌های قبل از ثبت

- فقط مدیر مجاز است. بدون `confirmation: 'CONFIRM_OPENING_LEDGER'`
  هیچ سندی نوشته نمی‌شود.
- تاریخ افتتاحیه باید با روز اول دوره باز برابر باشد.
- مجموع بدهکار و بستانکار باید هم‌ارز، غیرصفر و شامل ارقام صحیح ریال باشد.
- جمع معین اشخاص، بهای موجودی و مانده بانک/صندوق باید با نقش حساب‌ها برابر باشد.
- مانده انبار و بانک/صندوق باید با رکورد واقعی قبلی یکسان باشند.
- هیچ سند حسابداری قطعی، فاکتور، گردش انبار، چک، انبارگردانی
  یا تسویه دیگری از شرکت نباید وجود داشته باشد.
- **در همان تراکنش** دوباره تمام گیت‌ها کنترل می‌شوند؛ فقط سپس
  `journal_entries`، `journal_lines`، رسید مختصر افتتاحیه در
  `settings` و رویداد `audit_events` ثبت می‌شوند.
- کلید منشأ سند `opening_balance` یکتا است. تکرار و خطای آخر تراکنش
  باید تمام نوشته‌ها را برگردانند؛ آزمون تزریق شکست موجود است.

## محدودیت پذیرش

قبولی تست `fake-indexeddb` و build ویندوز، اثبات صحت
بازیابی اطلاعات قدیمی مشتریان، اخذ مانده شخص به شخص و چاپ گزارش نیست.
پیش از استفاده تولیدی به ابزار ورود داده، پذیرش حسابداری، آزمون واقعی
ارتقای نسخه و تهیه نسخه پشتیبان رمزگذاری‌شده نیاز است.
