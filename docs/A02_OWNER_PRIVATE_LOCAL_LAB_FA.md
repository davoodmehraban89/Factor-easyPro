# A02 — دستورالعمل اجرای خصوصی و مرحله‌ای مهاجرت هلو

**وضعیت: ابزار فنی برای محیط آزمایشی، نه ویزارد عمومی و نه نسخه آماده مهاجرت.** هیچ مرحله‌ای اطلاعات حسابداری را به Factor-easyPro وارد نمی‌کند. این زنجیره هنوز روی بکاپ واقعی مالک در SQL Server آزمایش نشده است.

## پیش‌نیازهای الزامی

- ویندوز ۶۴بیتی و Windows PowerShell 5.1؛ فایل ZIP هلو روی دیسک محلی؛ نسخه اصلی به‌صورت دست‌نخورده و جداگانه نگه‌داری شود.
- یک نمونه SQL Server **از پیش نصب‌شده، محلی و مخصوص آزمایش** با نام دقیق `FINORAMIG`، نسخه سازگار، ظرفیت کافی و Windows Authentication؛ نصب یا تغییر SQL Server اصلی هلو ممنوع.
- امکان خواندن فایل بکاپ توسط حساب **سرویس همین نمونه SQL**. فایل استخراج‌شده در پوشه خصوصی `LOCALAPPDATA` کاربر است و معمولاً سرویس SQL دسترسی پیش‌فرض ندارد؛ تنظیم ACL فقط با تأیید متخصص روی کپی و با حداقل سطح دسترسی انجام شود. **هرگز به `Everyone` دسترسی ندهید.**
- فضای کافی برای فایل بکاپ استخراج‌شده، داده‌ها، لاگ و دو گیگابایت فضای رزرو در هر دیسک مقصد؛ قبل از Restore سقف Edition (از جمله SQL Express) کنترل می‌شود.
- پوشه خصوصی خروجی اثرانگشت ساختار از قبل روی **دیسک ثابت محلی** ایجاد شده، فاقد junction/symlink و مسیر خروجی جدید و خالی باشد.
- قبل از اقدام، حساب ویندوز و وضعیت سرویس SQL مجزا تأیید شود و در محیط آزمایشی Snapshot/برنامه بازیابی موجود باشد.

## مراحل با تأییدهای مستقل

**۱. آزمون کاملاً مصنوعی، بدون بکاپ مالک یا اتصال واقعی به SQL**

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\a02-private-owner-local-lab.ps1 -Mode Test
```

این حالت تست مصنوعی ZIP، قرارداد خواندن SQL، اسکیما و رسانه نصب SQL را فراخوانی می‌کند. هیچ SQL Server نصب و هیچ Restore واقعی انجام نمی‌دهد. در GitHub CI فقط همین حالت مجاز است.

**۲. استخراج فقط یک نسخه خصوصی با CRC و TAPE معتبر**

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\a02-private-owner-local-lab.ps1 -Mode Stage -SourceZip 'D:\Private\OwnerHoloo.zip' -StagingConsent 'I_AUTHORIZE_PRIVATE_HOLOO_STAGING'
```

خروجی روی رایانه خود مالک مسیر `stagedBackupPath` را می‌دهد. مسیر را خصوصی نگه دارید و در مراحل بعد همان کپی را استفاده کنید. هیچ دیتابیسی ایجاد نمی‌شود.

**۳. بررسی واقعی SQL، فقط READ-ONLY / VERIFYONLY**

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\a02-private-owner-local-lab.ps1 -Mode InspectStaged -StagedBackupPath 'C:\Users\Owner\AppData\Local\FactorEasyPro\HolooMigrationStaging\stage_0123456789abcdef0123456789abcdef\HolooBackupCopy.bak'
```

مسیر بالا صرفاً یک **نمونه فرضی** است. ابزار وجود و محل کپی را کنترل می‌کند؛ `RESTORE HEADERONLY` و `FILELISTONLY` و `VERIFYONLY WITH MOVE`، سازگاری نسخه و سقف Express بررسی می‌شوند. اگر سرویس SQL نتواند کپی را بخواند، بررسی مسدود می‌شود. هیچ مجوزی به‌صورت خودکار تغییر داده نمی‌شود.

**۴. فقط در محیط خصوصی و پس از موفقیت مرحله قبل: Restore به دیتابیس جدید و استخراج اسکیما**

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\a02-private-owner-local-lab.ps1 -Mode RestoreAndInventory -StagedBackupPath 'C:\Users\Owner\AppData\Local\FactorEasyPro\HolooMigrationStaging\stage_0123456789abcdef0123456789abcdef\HolooBackupCopy.bak' -RestoreConsent 'I_AUTHORIZE_A_NEW_ISOLATED_SQL_DATABASE' -ManifestOutputPath 'C:\FinoraPrivate\holoo-schema.dpapi'
```

در این حالت پس از بررسی مجدد بکاپ، دیتابیس تصادفی جدید با `MOVE` تمام فایل‌ها ایجاد می‌شود؛ `WITH REPLACE` و `DROP DATABASE` در مسیر واقعی وجود ندارد. ابزار **فقط پس از `DBCC CHECKDB` موفق**، فراداده جدول‌ها، ستون‌ها، PK، Unique Index و Foreign Key را می‌گیرد و فایل `.dpapi` خصوصی تولید می‌کند.

**۵. فقط با همان کاربر ویندوز: رمزگشایی محلی برای بررسی نگاشت**

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\a02-isolated-schema-inventory.ps1 -Mode DecryptManifest -InputPath 'C:\FinoraPrivate\holoo-schema.dpapi' -OutputPath 'C:\FinoraPrivate\holoo-schema.private.json'
```

JSON شامل **نام جدول‌ها/ستون‌ها و روابط** است، نه ردیف‌های تجاری؛ اما حتی اسامی ساختاری ممکن است محرمانه باشند. JSON نباید به مخزن عمومی، CI یا گزارش خطای سراسری فرستاده شود. قبل از به‌اشتراک‌گذاری باید مالک آن را بازبینی و تأیید کند.

## خطاها و توقف امن

- هر مرحله ناموفق، زنجیره را قطع می‌کند؛ مراحل بعدی اجرا نمی‌شوند و **هیچ انتقال مالی انجام نمی‌شود**.
- حتی با شکست Restore ممکن است دیتابیس **جدید و ناقص** باقی بماند. ابزار آن را خودکار حذف نمی‌کند؛ تصمیم پاکسازی به متخصص و مالک واگذار می‌شود.
- کپی `.bak` استخراج‌شده **رمزنشده** است و تا حذف خصوصی و کنترل‌شده باقی می‌ماند. برخلاف فایل DPAPI، روی خود بکاپ رمزنگاری اعمال نشده است؛ برای نگهداری/حذف باید سیاست مشخص وجود داشته باشد.
- ابزار CLI است، برای کاربر عادی مناسب نیست، SQL Express را نصب نمی‌کند و در صورت نداشتن دسترسی حساب سرویس SQL به فایل، خودکار ACL را باز نمی‌کند.
- نتیجه `DBCC CHECKDB` و وجود فایل اسکیما، صحت مانده اشخاص، موجودی، فاکتورها، چک‌ها یا اسناد را اثبات نمی‌کند؛ آداپتور نسخه‌دار و کنترل مستقل حسابداری هنوز الزامی است.
- گیت A02 تا Restore واقعی و تطبیق مانده‌ها و تأیید C1/C2/C3 **پذیرفته نشده** باقی می‌ماند. هیچ نسخه عمومی منتشر نشده است.

پیگیری: [PR #152](https://github.com/davoodmehraban89/Factor-easyPro/pull/152) و [Issue #146](https://github.com/davoodmehraban89/Factor-easyPro/issues/146).
