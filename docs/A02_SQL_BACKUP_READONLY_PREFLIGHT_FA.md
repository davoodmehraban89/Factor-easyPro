# A02 — کنترل فقط‌خواندنی بکاپ واقعی SQL Server پیش از مهاجرت هلو

**وضعیت:** پل تشخیصی فنی برای Windows PowerShell 5.1، **نه بازیابی یا ورود اطلاعات**. برای آزمایش فقط پس از فراهم‌شدن یک SQL Server محلی سازگار و داشتن کپی مجاز فایل `.bak` یا فایل بازیابی‌شده از ZIP استفاده شود. نصب SQL Server، استخراج ZIP و اتصال UI در این PR انجام نمی‌شود.

## کارهایی که انجام می‌دهد

`scripts/a02-sql-backup-readonly-preflight.ps1` به نمونه **محلی** SQL Server از طریق پروتکل Shared Memory با احراز هویت ویندوز متصل می‌شود. گزینه نمونه تنها نام ساده محلی مثل `FINORAMIG` یا `SQLEXPRESS` را می‌پذیرد؛ نه سرور خارجی، نه نام کاربری/گذرواژه و نه مسیر سرور شبکه‌ای. فایل ورودی باید در دیسک محلی و با مسیر مطلق باشد؛ فایل UNC، ADS، symlink و فایل تهی رد می‌شود.

در SQL Server، دستورات زیر را به ترتیب روی *فایل بکاپ* اجرا می‌کند:

1. `RESTORE HEADERONLY` — بررسی ساختار سربرگ و اطلاعات نسخه، بدون اجرای Restore
2. `RESTORE FILELISTONLY` — شمارش فایل‌های منطقی داخل مجموعه
3. `RESTORE VERIFYONLY` — بررسی قابل‌خواندن‌بودن بکاپ از دید موتور SQL Server؛ **جایگزین بازیابی واقعی یا کنترل مانده‌ها نیست**

در صورت وجود بیش از یک backup set یا نسخه منبع بالاتر از نسخه SQL هدف، فرایند متوقف می‌شود. هیچ `RESTORE DATABASE`، `WITH REPLACE`، `CREATE DATABASE`، ثبت مالی، دانلود، تغییر سرویس یا نصب برنامه‌ای اجرا نمی‌شود. فقط خلاصه‌ای شامل **تعداد فایل‌ها و نسخه‌های اصلی SQL** چاپ می‌شود و نام دیتابیس، اشخاص، مسیر فایل و متن خام خطای SQL چاپ نمی‌شود.

## اجرای نمونه برای متخصص در ویندوز

در PowerShell 5.1، روی رایانه مالک بکاپ، پس از تهیه کپی امن و آماده‌سازی SQL Server مجزا:

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\a02-sql-backup-readonly-preflight.ps1 -BackupPath 'D:\PrivateBackup\Holoo1' -InstanceName FINORAMIG
```

در این مثال مسیر یک *نمونه فرضی* است، نه مسیر فایل خصوصی موجود. این قابلیت **به کاربر عمومی عرضه نشود**؛ اجرای آن به نصب نمونه محلی سازگار SQL Server و دسترسی سرویس SQL به فایل نیاز دارد.

برای تست مستقل از SQL Server و فایل واقعی:

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\a02-sql-backup-readonly-preflight.ps1 -SelfTest
```

این تست فقط قرارداد escaping و محدوده فرمان را بررسی می‌کند. گردش واقعی `HEADERONLY/FILELISTONLY/VERIFYONLY` تا زمان اجرا روی موتور SQL سازگار **NOT_RUN** است.

## ملاحظات حیاتی

- فایل ZIP هلو باید با روش امن و روی کپی خارج شود؛ این اسکریپت ZIP باز نمی‌کند.
- اگر فضای آزاد ناکافی باشد، نسخه SQL قدیمی باشد یا SQL Server نتواند فایل را بخواند، عملیات باید بدون تغییر داده خاتمه یابد.
- `VERIFYONLY` صحت تراز افتتاحیه و بدهکار/بستانکار یا صحت سند را تأیید نمی‌کند؛ این‌ها در آداپتور مهاجرت و با حسابدار مستقل کنترل می‌شوند.
- داده خام و خروجی استخراج‌شده از فایل صاحب‌داده نباید به مخزن عمومی، CI یا artefact غیرخصوصی ارسال شود.
- قابلیت «انتقال یک‌کلیکی بکاپ هلو» هنوز **پیاده‌سازی نشده** و A02 باید `accepted: false` بماند.
- گام بعد: نصب اختیاری SQL به روش امضاشده، بازیابی به DB جداگانه *فقط پس از تأیید کاربر*، نگاشت نسخه هلو، کنترل مبالغ/اسناد و rollback؛ پیگیری در Issue #146.

منبع رسمی: https://learn.microsoft.com/en-us/sql/t-sql/statements/restore-statements-headeronly-transact-sql و https://learn.microsoft.com/en-us/sql/t-sql/statements/restore-statements-verifyonly-transact-sql
