# PROJECT_STATUS — Factor-easyPro

> **نقطه ورود ثابت به پروژه** برای هر چت، توسعه‌دهنده یا اجرای جدید. ابتدا این فایل و سپس اسناد لینک‌شده را بخوانید. این فایل «وضعیت» است، نه سند قابلیت‌های اثبات‌نشده.

**تاریخ بازبینی:** 2026-10-14  
**شاخه مرجع:** `main` در [davoodmehraban89/Factor-easyPro](https://github.com/davoodmehraban89/Factor-easyPro)  
**آخرین نسخه منتشرشده و تأییدشده در Releases:** [v2.0.3](https://github.com/davoodmehraban89/Factor-easyPro/releases/tag/v2.0.3)  
**هدف محصول مصوب:** رقیب گسترده‌تر هلو، با هسته مالی و انبار مستقل و ماژولار؛ بدون کپی کد/ظاهر اختصاصی رقیب.  
**روش اجرا:** فقط GitHub، PR، GitHub Actions و Releases؛ Remote Desktop پیش‌نیاز نیست.  
**وضعیت فعلی:** برنامه‌ریزی توسعه پس از 2.0.3؛ فازهای A، B و C به‌عنوان قابلیت اجرایی **تکمیل نشده‌اند**.

## برنامه سه‌فازی و مالکیت اصلی

| فاز | هدف | وضعیت | Epic | خروج |
|---|---|---|---|---|
| A — Reliable Core | اسناد اصلاحی و ممیزی، مهاجرت/بازیابی، انضباط دوره، امنیت و آزمون ارتقا | Planned | [#2](../../issues/2) | تمام P0ها با آزمون و پذیرش، بدون مغایرت مالی/خرابی داده |
| B — Retail Pro | POS، صندوق و تسویه ترکیبی، قیمت و سفارش، انبار و گزارش پیشرفته | Blocked by A | [#3](../../issues/3) | گردش روز کامل فروشگاه و حسابداری با آزمون سخت‌افزار |
| C — Industry & Scale | تولید/پخش/اموال/پروژه/حقوق و طراحی شبکه/مودیان مشروط | Blocked by B | [#4](../../issues/4) | پذیرش مستقل هر ماژول، هزینه و الزامات قانونی جدا |

**مرجع کامل:** [نقشه راه رقابتی](docs/ROADMAP_HOLOO_COMPETITOR_FA.md) · [ماتریس فاز A](docs/PHASE_A_BACKLOG_FA.md) · [قرارداد GitHub](docs/GITHUB_EXECUTION_PLAN_FA.md).

## نقطه شروع فنی

1. [#5 — ADR برای سند اصلاحی و رویداد ممیزی](../../issues/5)؛ مالک: معماری هسته مالی؛ **خروجی ابتدا فقط طراحی قابل بازبینی، نه تغییر داده**.
2. [#7 — بازیابی مقاوم](../../issues/7) و [#10 — audit](../../issues/10) بر اساس قرارداد مصوب؛ مالک به‌ترتیب پایداری داده و امنیت داده.
3. [#9 — چرخه اصلاح اسناد](../../issues/9)، سپس [#8 — مهاجرت افتتاحیه](../../issues/8) و بقیه P0ها [#11–#14](../../issues/11)؛ وابستگی‌های دقیق در Issueها هستند.
4. **توسعه B/C قبل از پذیرش A مجاز به انتشار تجاری نیست**؛ بررسی/ADR مستقل آن‌ها می‌تواند در شاخه‌های جداگانه انجام شود.

## استاندارد برای «تکمیل‌شده»

- Issue → branch مستقل → PR و مرور تغییرات.
- `npm test`، `npm run build`، ممیزی وابستگی تولید و Windows NSIS preview از `.github/workflows/pr-quality-gates.yml` با موفقیت گذرانده شوند.
- تغییر مالی/داده: آزمون atomic rollback، company isolation، عدم ثبت تکراری و مهاجرت/restore؛ تاریخچه تغییرات و حداقل مجوز سرویس.
- merge **فقط پس از review و CI**؛ انتشار عمومی **فقط با اجازه صریح انتشار، نه صرف موفقیت build**.
- هر Release شامل نسخه/هش SHA-256/Release Notes/محدودیت‌های آزموده‌نشده باشد.
- هر مرحله پس از پذیرش، وضعیت Issueها، تاریخ/نسخه، PRها و آزمون‌ها در همین فایل به‌روزرسانی شود.

## وضعیت زیرساخت GitHub

- [PR کیفیت و قرارداد اجرا، ادغام‌شده #6](../../pull/6): `pr-quality-gates.yml`، قالب PR و مستندات فاز A.
- [#19 — تنظیمات مخزن](../../issues/19): **سه Milestone و برچسب‌های فاز و اولویت در GitHub ایجاد شده و انتساب ۱۸/۱۸ Issue تأیید شده است.** اسکریپت idempotent با [PR #22](../../pull/22) اصلاح و در [اجرای موفق #38515448943](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38515448943) آزموده شد؛ **Ruleset محافظت main، الزام review و Environment انتشار هنوز تنظیم نشده‌اند**.
- [#20 — استانداردسازی انتشار نسخه‌ها](../../issues/20): Planned؛ گردش مستقل release قدیمی هنوز در مخزن است.
- **هشدار:** GitHub Ruleset `main` در بررسی 2026-10-14 موجود نبود. تغییر محدودیت دسترسی/قفل شاخه نیازمند بررسی مدیر مخزن است.

## موارد خارج از تعهد فعلی

قابلیت شبکه چندکاربره واقعی، سامانه مؤدیان، استقرار سرور، لایسنس تجاری نهایی، چاپ روی سخت‌افزار مشتری یا ماژول تولیدی **تا زمان آزمون و پذیرش مربوطه عملیاتی محسوب نمی‌شوند**. بدون حذف داده واقعی، هزینه زیرساخت یا دستکاری مجوزها اقدام نکنید.

**آخرین پیشرفت تأییدشده:** [PR #23 — ADR-001 طراحی اصلاح اسناد و Audit](../../pull/23) در 2026-10-14 با موفقیت در `main` ادغام شد؛ این PR فقط سند معماری را اضافه کرد و **هیچ migration یا اصلاح سند واقعی اجرا نکرد**. وضعیت خود [ADR-001](docs/adr/ADR-001-immutable-commercial-documents-and-audit.md) همچنان `Proposed` است و پذیرش تخصصی حسابداری/امنیت/QA از ادغام کد متمایز است.

**اقدام فعال بعدی:** بازبینی و تصمیم مستند درباره ADR در [Issue #5](../../issues/5)، خصوصاً سیاست برگشت فاکتور تسویه‌جزئی، برگشت خرید و دسترسی به ردپا. فقط پس از تصویب، اجرای تدریجی [#10 — Audit](../../issues/10) و [#9 — Correction](../../issues/9) با آزمون اتمیک/مهاجرت و PR جدا آغاز شود. **قابلیت اصلاح سند قطعی هنوز تکمیل نشده است.**


## پیگیری جاری — 2026-10-14

- [PR #25](../../pull/25): ماتریس قابلیت‌ها، باز و در انتظار تکمیل CI و review.
- [PR #26](../../pull/26): آزمون‌های تفکیک شرکت و صحت دفتر، پس از CI موفق با squash در `main` ادغام شد (`bf4c1858`).
- [PR #27](../../pull/27): اصلاح عنوان و حاشیه چاپ، به همراه آزمون رگرسیون؛ پس از مشاهده شکست آزمون به‌دلیل تفسیر `${pageCss}` در regex، آزمون در commit `10abed9` اصلاح شد. اجرای CI جدید و آزمون چاپ فیزیکی هنوز باید تأیید شوند.
- ترتیب توسعه پیشنهادی چهار فاز: ۱) پایداری/صحت مالی P0، ۲) فروشگاهی P1، ۳) تولید و پخش P2، ۴) سازمانی و یکپارچه‌سازی P3. اسناد تفصیلی A/B/C فعلی همچنان مبنای اجرایی‌اند.
- این گزارش، تأیید ادغام یا انتشار نسخه جدید نیست.

- 2026-10-14: [PR #27](../../pull/27) پس از موفقیت CI و ساخت ویندوز در `main` ادغام شد (`d5f06c2`). [PR #30](../../pull/30) اعتبارسنجی نسخه/شناسه/ساختار فایل بکاپ و آزمون‌های مربوط را تجمیع کرده و منتظر CI است. [PR #29](../../pull/29) نسخه قدیمی‌تر همان اصلاح است و نباید مستقل از PR #30 ادغام شود.

- 2026-10-14: [PR #30](../../pull/30) پس از موفقیت CI (آزمون، build، audit و Windows preview) در `main` ادغام شد (`ac4a105`). [PR #28](../../pull/28) نیز پس از CI موفق ادغام شد (`2a3fa5e`). [PR #29](../../pull/29) به‌دلیل پوشش کامل در #30 بدون ادغام بسته شد. این‌ها فقط بخشی از A04 و مستندسازی فاز ۱ هستند؛ فاز ۱ تکمیل نشده، آزمون واقعی restore و تأیید ADR هنوز باقی است.

## وضعیت اجرایی به‌روزشده فاز A — 2026-10-14 (مبنای ارزیابی: main)

| حوزه | شاهد واقعی | وضعیت پذیرش |
|---|---|---|
| A01 اصلاح اسناد قطعی | ADR-001 در #5 هنوز Proposed؛ قرارداد ابطال فروش تسویه‌جزئی نیازمند تأیید حسابداری | **مسدود؛ تکمیل نشده** |
| A02 افتتاحیه/مهاجرت | طرح در #8، بدون dry-run و تطبیق مانده نسخه‌های مشتری | **تکمیل نشده** |
| A03 Audit اتمی | طراحی در ADR-001؛ بدون جدول/پیاده‌سازی اجرایی | **تکمیل نشده** |
| A04 بکاپ/بازیابی | [#30](../../pull/30)، [#31](../../pull/31)، [#32](../../pull/32) ادغام‌شده: اعتبارسنجی ساختار/نسخه/شناسه/شرکت، ۷ تست بازیابی fake-indexeddb و rollback، احراز هویت با AES-GCM در فایل رمزگذاری‌شده موجود | **بخشی از پذیرش پاس شده**؛ تست فایل v1.1.x واقعی/ناشناس، checksum manifest و تست خرابی برق/دستگاه باقی است |
| A05 بستن دوره/خزانه | تست دفتر کل و بستن دوره در accounting-phase1؛ چرخه کامل اسناد تجاری و چک ناقص | **تکمیل نشده** |
| A06 مجوز و دسترسی | [#33](../../pull/33) گیت مدیر برای export و wipe؛ [#34](../../pull/34) اعتبارسنجی payload مجوز | **بخشی از پذیرش پاس شده**؛ صدور و فعال‌سازی واقعی امضای دیجیتال و threat model کامل نیست |
| A07 نصب/چاپ | [#27](../../pull/27) چاپ بدون سربرگ مرورگر؛ CI Windows preview برای PRهای ادغام‌شده | **بخشی از پذیرش پاس شده**؛ چاپ فیزیکی و ارتقای نسخه روی Windows با داده واقعی ناشناس آزموده نشده |
| A08 عملکرد | بنچمارک ۱۰هزار کالا و ۵۰هزار فاکتور با نتیجه ثبت‌شده وجود ندارد | **تکمیل نشده** |

**شواهد جدید CI:** [اجرای #38618854402](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38618854402) برای #32، [#38619078112](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38619078112) برای #33، [#38619463100](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38619463100) برای #34: آزمون، build، ممیزی وابستگی و Windows preview موفق. [PR #35](../../pull/35) برای نسخه صحیح manifest پشتیبان هنوز تا CI کامل/merge بررسی می‌شود.

**گیت خروج فاز A بسته است.** تا تعیین سیاست اصلاح سند در ADR-001، تأیید حسابداری و آزمون مستقل مهاجرت/بازیابی، انتشار نسخه تولیدی یا ادعای پایان فاز A ممنوع است. اقدام واقعی مخرب روی اطلاعات کاربر انجام نشده است.


## تصمیم‌های مبتنی بر بررسی سپیدار و راهکاران — 2026-10-14

- مرجع طراحی: [تحقیق قابلیت‌ها و ابزارها](docs/IR_ACCOUNTING_COMPETITOR_BENCHMARK_FA.md) بر اساس آموزش‌های رسمی استقرار، تسویه و مرجوعی سپیدار و معرفی رسمی راهکاران ERP. قرارداد اصلاح فاکتور، متکی بر اسناد **جدید و قابل ارجاع** است؛ receipt قبلی حذف نمی‌شود، مازاد پرداخت پس از مرجوعی «اعتبار مشتری در انتظار بررسی» است و پرداخت نقدی خودکار انجام نمی‌شود.
- [PR #35](../../pull/35) پس از CI کامل در main ادغام شد؛ خروجی backup اکنون نسخه واقعی برنامه را ثبت می‌کند، جدا از نسخه schema.
- [PR #36](../../pull/36) پس از CI Node/frontend/dependency audit و Windows preview موفق [#38623104082](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38623104082) ادغام شد (commit `2321339`): قرارداد تحقیق، `ReturnSettlementCore` و پیش‌نمایش **read-only** مرجوعی شرکت‌محور با آزمون مقادیر ریالی و جداسازی شرکت‌ها.
- [PR #37](../../pull/37) در حال ارزیابی CI است: ابزار درخواستی «کنترل سلامت تسویه‌های مالی» در تنظیمات مدیر با check مبتنی بر invoice/settlement/treasury؛ فقط خواندنی و **بدون اجرای خودکار در هنگام ورود**.
- افزونه‌ها: `plugin-fs` و `plugin-dialog` از قبل در وابستگی‌ها حاضرند؛ افزودن `fast-check`، schema validator، Stronghold و updater فقط با تست/قفل نسخه و گیت امنیتی پیشنهاد شده است. مهاجرت ناگهانی به SQLite/Dexie در فاز A انجام نشد.
- [#13](../../issues/13): وابستگی CDN فونت/XLSX مانع اثبات کارکرد کامل آفلاین است؛ بسته‌بندی محلی و آزمون Windows بدون اینترنت لازم است.
- **مهم:** فاز A پایان نیافته است. این تغییرات «پیش‌نمایش و تشخیص ایمن» هستند، نه ثبت اصلاح سند قطعی/ممیزی اتمی، مجوز سامانه مؤدیان یا تأیید نهایی استقرار. ADR-001 هنوز Proposed است؛ تصمیم فنی برگشت تسویه‌جزئی ثبت شده، اما آزمون مالی/قانونی مستقل قبل از فعال‌سازی عمومی لازم است.

- **تحویل نهایی این نوبت (2026-10-14):** [PR #37](../../pull/37) با موفقیت آزمون کامل Node، ساخت Vite، ممیزی وابستگی‌ها و Windows NSIS preview در [CI #38623975160](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38623975160) در `main` ادغام شد (`922edf5`). کارت درخواستی «کنترل سلامت تسویه‌های مالی» فقط برای مدیر در تنظیمات موجود است؛ بررسی فقط هنگام کلیک اجرا می‌شود و هیچ سند یا مانده‌ای را ویرایش نمی‌کند. این قابلیت **A05 را کامل نمی‌کند**؛ کنترل بسته‌شدن دوره، برگشت و اصلاح تجاری همچنان باقی‌اند.

## پیگیری فاز ۱ — ۱۶ اکتبر ۲۰۲۶

**وضعیت انتشار عمومی: ممنوع تا تأیید گیت‌های فاز A؛ آخرین نسخه عمومی 2.0.3 است.**

- [PR #57](../../pull/57) بعد از CI کامل آزمون‌ها، ممیزی وابستگی و Windows preview ادغام شد (commit `6b3bcf4`). مسیر عملی A02 برای **ثبت کنترل‌شده فقط سند دفتر کل افتتاحیه** اضافه شد: بررسی دوره و کدینگ و اطلاعات پایه موجود، کنترل تراز و مغایرت بانک/انبار، جلوگیری از شرکت اشتباه و ثبت مجدد، تأیید صریح مدیر، ثبت یک تراکنش journal+lines+receipt+audit، و آزمون rollback تزریق‌شده. **واردکردن واقعی رکوردهای تاریخی اشخاص، پرداخت‌ها و انبار هنوز انجام نشده است** و ادعای تکمیل A02 ممنوع است. قرارداد استفاده در [docs/A02_OPENING_LEDGER_SCOPE_FA.md](docs/A02_OPENING_LEDGER_SCOPE_FA.md) ثبت شد.
- [PR #58](../../pull/58) با CI موفق در main ادغام شد (commit `5464284`): دسترسی عمومی DataScope به audit و corrections به شرکت فعال محدود شد، همراه آزمون جلوگیری از نشت رکورد شرکت دیگر.
- [PR #59](../../pull/59) با CI موفق ادغام شد (commit `f75a57f`): بازیابی سابقه ممیزی و اصلاح سند با ترتیب متفاوت کلیدهای JSON، بدون تغییر مقدار، پذیرفته می‌شود؛ تغییر واقعی مقدار همچنان با rollback رد می‌شود.
- [PR #60](../../pull/60): پنل مدیریتی بررسی فایل افتتاحیه و تأیید جداگانه ثبت؛ در زمان این گزارش، نتیجه ساخت Windows CI هنوز در جریان است. بدون آزمون نهایی، ادغام‌شده یا عملیاتی اعلام نمی‌شود.

**پیش‌شرط‌های باز برای Release:** A01 (اصلاح کامل/استرداد چک و خزانه)، A02 (مهاجرت تفصیلی واقعی)، A03 (پوشش تمام رویدادها)، A04 (نمونه ارتقای واقعی و بازیابی نسخه قبلی)، A05 (تسویه چندگانه و بسته‌شدن دوره روی داده واقعی)، A06 (کلید عمومی صادرکننده تولیدی و تست فعال‌سازی)، A07 (نصب/ارتقای عملی، چاپ چندصفحه‌ای RTL)، A08 (آزمون دستگاه واقعی و قطع برق/خرابی)، QA مستقل و نسخه پشتیبان. `docs/PHASE_A_RELEASE_ACCEPTANCE.json` به همین دلیل عمداً هنوز به‌عنوان پذیرفته‌شده علامت نخورده است.

هیچ داده واقعی مشتری حذف نشده و هیچ نسخه عمومی جدیدی در این مرحله منتشر نشده است.


## تکمیل کنترل‌های بازیابی و حسابرسی — 2026-10-16

- **PR #62** پس از موفقیت دو workflow ویندوز و تست‌ها ادغام شد؛ سناریوی آزمایشی ارتقای پایگاه‌داده IndexedDB نسخه ۶ به ۷ در Edge آفلاین آزموده شد. این جایگزین ارتقای نصب روی رایانه واقعی مشتری و فایل بکاپ 1.1.x نیست.
- **PR #64**: [CI #38911714479](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38911714479) موفق و در `main` ادغام شد. Restore در حالت `replace` دیگر سند قطعی مالی موجود، اقلام دفتر، انبار، خزانه، چک، تسویه و شناسه ثبت‌کننده اصلی را بازنویسی نمی‌کند. تضاد باعث rollback همه جدول‌ها می‌شود.
- **PR #65**: [CI #38912009325](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38912009325) موفق و در `main` ادغام شد. همان محافظت برای `StorageService.importAll` کامل اعمال شد و بازپخش عین سند بی‌خطر است.
- **PR #66**: [CI #38912474190](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38912474190) موفق و در `main` ادغام شد. Restore شرکتی برای سند دارای `financePosted`، مرجع معتبر و قطعی دفتر کلِ هم‌شرکت و هم‌منشأ را الزامی می‌کند؛ ارجاعات نادرست خزانه و چک رد می‌شوند.
- **PR #67**: [CI #38913052164](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38913052164) با موفقیت آزمون، build، audit و Windows preview تکمیل شد و در `main` ادغام شد (`57e2f89`). بازیابی کامل دیگر نمی‌تواند نقش یا شرکت‌های مجاز کاربران فعلی را تغییر دهد؛ کاربران وارداتی جدید با نقش عادی و بدون دسترسی شرکتی و با نیاز به تعیین رمز ایجاد می‌شوند؛ نام کاربری تکراری و بیش از چهار کاربر رد می‌شود.

**بازبینی Release:** پرچم‌های A01–A08 و QA مستقل در [manifest پذیرش](docs/PHASE_A_RELEASE_ACCEPTANCE.json) هنوز تایید نشده‌اند. آخرین نسخه عمومی همچنان 2.0.3 است. تکمیل کدهای محافظتی بالا مساوی پایان فاز اول یا مجوز انتشار عمومی نیست. پذیرش نصب/بازیابی روی Windows واقعی، چرخه اصلاح اسناد، مهاجرت کامل اطلاعات قدیمی، تهیه و آزمون بکاپ، کلید عمومی مجوز تجاری تولیدی و بازبینی مالی مستقل باقی‌اند.


## آزمایشگاه واقعی نصب و ارتقا روی Windows VM — 2026-10-16

- **PR #68** (merged, `ece0548`): ساخت نصب‌کننده NSIS واقعی، دریافت و بررسی checksum نصب‌کننده عمومی 2.0.3، نصب اولیه، ورود مدیر، ارتقای واقعی 2.0.3 → کاندید 2.0.4 و بررسی حفظ کالا/فاکتور ساختگی، گذار IndexedDB v6→v7 و DPAPI. [اجرای موفق](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38920001588).
- **PR #69** (merged, `b8e329a`): آزمایش رابط واقعی Tauri/WebView2 شامل دوره مالی، کدینگ، فعال‌سازی خرده‌فروشی، خرید، فروش با پرداخت جزئی، گردش انبار، مانده دفتر، بازیابی بخشی از Snapshot، رد دستکاری فاکتور قطعی و تنظیمات RTL چاپ. [آزمایشگاه موفق](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38921787116)، [CI/Windows موفق](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38921787047).
- Workflow `windows-vm-native-lab.yml` اکنون با تغییر کد برنامه در PRها نیز فعال می‌شود. مستند کامل و اجرای مجدد: [docs/WINDOWS_VM_NATIVE_TEST_LAB_FA.md](docs/WINDOWS_VM_NATIVE_TEST_LAB_FA.md).
- نقص واقعی شناسایی‌شده: رابط فایل عمومی `v2.0.3` هنوز نسخه `1.1.1` نشان می‌دهد؛ در کاندید جدید از `package.json` خوانده می‌شود.
- **مرز پذیرش:** چاپ فیزیکی، نصب روی سیستم مشتری و همه نسخه‌های قدیمی، بازیابی داده واقعی/رمزگذاری‌شده، تطبیق حسابدار مستقل و کلید امضای تجاری هنوز تأیید نشده‌اند. انتشار عمومی جدید هنوز انجام نشده است.


## آزمون بازیابی واقعی snapshot نسخه قبلی — 2026-10-16

- **PR #70** (ادغام‌شده در `main`): [اجرای کامل موفق Windows VM #38922551919](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38922551919) و [CI Node/Windows #38922551916](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38922551916). فایل backup کامل با ساختار واقعی `StorageService.exportAll` از برنامه **نصب‌شده** نسخه عمومی `v2.0.3` (schema v6) تولید شد؛ پس از ارتقای NSIS به کاندید موقت `2.0.4`، حذف کنترل‌شده کالا/پیش‌فاکتور ساختگی و اجرای واقعی `StorageService.importAll`، نام کالا و مبلغ فاکتور دقیقاً بازیابی شدند.
- رد بکاپ متعلق به برنامه دیگر، و rollback اتمیِ تمام تغییرات در برابر تلاش برای تغییر audit event در همان WebView2 واقعی آزمایش شد. پس از **بستن و اجرای مجدد** فایل نصب‌شده، داده‌های بازیابی‌شده و audit event بدون تغییر باقی ماندند. نصب تازه و DPAPI نیز موفق بود. شواهد در artifact همین workflow ثبت شده‌اند؛ هیچ فایل مشتری واقعی استفاده نشد.
- **PR #72** [ادغام‌شده](https://github.com/davoodmehraban89/Factor-easyPro/pull/72): آزمون بومی `.fbackup` رمزگذاری‌شده در رابط واقعی تنظیمات با رد رمز نادرست، بازیابی هم‌شرکتی و ثبت Audit در [Windows VM #38939141475](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38939141475) موفق شد. پذیرش کامل A04 همچنان باز است.
- این شواهد **بخشی از A04 و A07** هستند و تمام گیت‌های مالی، مجوز تولیدی، چاپ فیزیکی و بازبینی مستقل را نمی‌بندند. Manifest انتشار همچنان fail-closed است.

## پذیرش رابط نصب‌شده و بازپخش پشتیبان در آزمایشگاه — 2026-10-16

- **PR #73** (ادغام‌شده، `ecb52f8`): آزمایشگاه ویندوز، آزمون مالی موجود (دوره، کدینگ، خرید، فروش با تسویه جزئی، انبار، snapshot و چاپ RTL در سطح تنظیمات) را با بازدید واقعی **هر ۱۰ مسیر برنامه نصب‌شده** یکپارچه کرد. ساخت شخص/کالای مصنوعی، `StorageService.exportAll/importAll` بدون افشای hash/password و بدون تکرار رکورد، و تولید اسکرین‌شات واقعی از WebView2 موفق شدند.
- [اجرای native NSIS/WebView2 موفق #38924043704](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38924043704)؛ [CI/Windows package موفق #38924043470](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38924043470). شواهد JSON و PNG در artifact همین اجرا موجود است.
- [راهنمای بازتولید آزمایشگاه](docs/WINDOWS_NATIVE_VM_LAB_FA.md) مراحل اجرای دستی workflow، مرز پوشش آزمون و نحوه خواندن شواهد را ثبت می‌کند.
- **موارد بررسی‌نشده:** صحت بصری چاپ روی کاغذ واقعی، همه مسیرهای خطای فرم، بازیابی فایل حقیقی مشتری، تست برق/خرابی دیسک، و تأیید حقوقی/مالی مستقل. هیچ نسخه عمومی جدید منتشر نشده؛ فاز ۱ هنوز مطابق مانفیست پذیرش به‌صورت خودکار تکمیل‌شده اعلام نمی‌شود.


## تأیید مبدأ محلی WebView2 در Windows VM — 2026-10-16

- **PR #75** [ادغام‌شده](https://github.com/davoodmehraban89/Factor-easyPro/pull/75) با [آزمون کامل نصب واقعی/ارتقا #38925949798](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38925949798) و [CI Node/بسته ویندوز #38925949769](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38925949769). محل بارگذاری UI در WebView2 نصب‌شده با `URL` بررسی شد و هر چهار سناریوی seed/upgrade/reopen/fresh از مبدأ واقعی **`http://tauri.localhost`** بار شدند؛ اجرای UI از دامنه خارجی یا URL فریبنده اکنون خطای تست است.
- **۱۸۵/۱۸۵ آزمون Node** در همین CI موفق شدند. آزمایش بومی شامل نصب NSIS، ارتقای 2.0.3→کاندید محلی، حفظ داده، بازیابی Snapshot، گردش مالی ساختگی و ۱۰ صفحه برنامه موفق است. نسخه آزمایشی **عمومی منتشر نشده** است.
- مستند پذیرش `docs/PHASE_A_RELEASE_ACCEPTANCE.json` اکنون به شواهد جدید ارجاع دارد؛ **A07 همچنان پذیرفته نشده** چون چاپ فیزیکی، محیط‌های واقعی مشتری، تأیید عملکرد کاملاً آفلاینِ چندمسیره و سایر سناریوهای بحرانی باقی است.
- PR #72 با CI و آزمایشگاه NSIS/WebView2 سبز شد و ادغام گردید؛ جزئیات و حدود اعتبار در مدخل تازه زیر آمده است. این موفقیت تمام گیت A04 یا Release عمومی را نمی‌بندد.


## بازیابی رمزگذاری‌شده A04 و ناوبری پس از Restore — 2026-10-16

- **PR #72** [merged](https://github.com/davoodmehraban89/Factor-easyPro/pull/72), squash در `main` با commit [`58f4d1bc1a0446fec5811e23ca70a6ec6de41286`](https://github.com/davoodmehraban89/Factor-easyPro/commit/58f4d1bc1a0446fec5811e23ca70a6ec6de41286). اجرای [Quality Gates #38939141399](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38939141399): **۱۸۵/۱۸۵ آزمون Node، build وب، npm audit بدون آسیب‌پذیری Production و ساخت بسته Windows موفق**.
- آزمایش بومی [Windows VM #38939141475](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38939141475) **success**: نصب عمومی 2.0.3، ارتقا به کاندید **غیرعمومی** 2.0.4، حفظ داده v6→v7/ورود/DPAPI، عملیات مالی/انبار مصنوعی و حفظ داده پس از بازگشایی، تهیه `.fbackup` AES-GCM/PBKDF2 از Settings UI، رد رمز نادرست با نمایش واقعی Toast، بازیابی موفق شرکت مجاز و رویداد `backup_restored`. پس از سناریوی رمز نادرست، فقط Toast مورد انتظار و Modal همان سناریو با کنترل واقعی بسته شدند؛ رصد Toastهای خطای غیرمنتظره خاموش نشده است.
- بازدید مجدد تمام **۱۰ مسیر رابط نصب‌شده** پس از Restore، همراه با مبدأ محلی واقعی `http://tauri.localhost`، **PASSED**. اسکرین‌شات `fresh-native-dashboard.png` و فایل‌های JSON در [Artifact #12062462005](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38939141475/artifacts/12062462005) موجودند. خطای پیشین [run شکست‌خورده #38926293995](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38926293995) به‌خاطر باقی‌ماندن Toast منفیِ مورد انتظار و پنجره بازیابی ناموفق در تست/همگام‌نبودن شاخه با آزمون ده‌مسیره main بود؛ بدون تغییر سیاست Toast نرم‌افزار رفع شد.
- **محدودیت و مانع باز:** داده فقط ساختگی Windows VM است. بازیابی فایل واقعی و قدیمی مشتری، سناریوهای فایل خراب/قطع وسط Restore و Crash/Power loss، سنجش چاپگر فیزیکی، ممیزی مالی مستقل و کلید مجوز تولیدی هنوز شواهد پذیرش کافی ندارند. **A04 و سایر گیت‌های manifest همگی `accepted: false` باقی‌اند؛ هیچ Release جدید منتشر نشده است.**


## رد فایل پشتیبان رمزگذاری‌شده خراب در Windows VM — 2026-10-16

- **PR #76** [ادغام‌شده](https://github.com/davoodmehraban89/Factor-easyPro/pull/76)، commit [`458c31e3bc6e3b30d04c8e2d5b6c71817c291d85`](https://github.com/davoodmehraban89/Factor-easyPro/commit/458c31e3bc6e3b30d04c8e2d5b6c71817c291d85): یک آزمون منفی تازه در **همان Windows NSIS/Tauri/WebView2 نصب‌شده** افزوده شد. این آزمون فایل `.fbackup` واقعیِ تولیدشده در رابط برنامه با داده ساختگی را با تغییر یک بیت از تگ احراز اصالت AES-GCM خراب می‌کند، بازگردانی آن را با رمز صحیح از داخل Settings UI اجرا می‌کند، ردشدن عملیات و Toast خطای مورد انتظار را می‌سنجد و ثابت می‌کند شخص حذف‌شده و `backup_restored` ناخواسته ایجاد نشده‌اند. سپس فایل سالم را بازیابی کرده و ده مسیر UI دوباره آزمون می‌شوند.
- **شواهد مستقل GitHub Actions:** [PR Quality #38942948237](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38942948237) موفق (۱۸۵ آزمون Node + build + audit + Windows preview) و [آزمایشگاه Native Windows #38942948274](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38942948274) موفق (نصب/ارتقای NSIS، ورود، DPAPI، گردش مالی، بازیابی رمزنگاری‌شده، ناوبری ۱۰ مسیر و PNG/JSON). [Artifact شواهد](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38942948274/artifacts/12063549979).
- این فقط **گسترش پوشش A04** است. سناریوی قطع برق/Crash حین نوشتن، بازیابی از داده واقعی مشتری، نسخه‌های قدیمی دیگر، انطباق خروجی چاپ واقعی و پذیرش حسابداری مستقل همچنان بازند. **همه گیت‌های Release شامل A04 `accepted:false` هستند**؛ نسخه جدید منتشر نشده است.


## پیشرفت تکمیلی فاز A — آزمون‌های native و سنجش ویندوز (2026-10-16)

- **A04 / PR #77** [ادغام‌شده](https://github.com/davoodmehraban89/Factor-easyPro/pull/77)، [Native Windows #38945374347](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38945374347) و [Quality #38945374362](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38945374362) موفق شدند. هنگام Restore در رابط واقعی Settings، تماس مصنوعی و فاکتور قطعی فاقد دفتر کل در همان تراکنش stage شدند؛ رد اعتبارسنجی دیرهنگام کل تراکنش را برگرداند و هیچ تماس/فاکتور/Audit موفقیت کاذب نماند. **شبیه‌سازی قطع فیزیکی برق نیست**.
- **A08 / PR #78** [ادغام‌شده](https://github.com/davoodmehraban89/Factor-easyPro/pull/78)، [Windows benchmark #38945788170](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38945788170) و [Quality #38945787995](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38945787995) موفق‌اند. Node 22/fake-indexeddb ویندوز برای داده **مصنوعی ۱۰هزار کالا، ۵۰هزار فاکتور، پنج شرکت**: seed کالای ~192.57ms، فاکتور ~2916.37ms، query p95 ~338.40ms، export ~356.13ms و RSS ~298.88 MiB در یک اجرای CI. این ارقام ضمانت عملکرد نصب Tauri یا دیسک واقعی نیستند؛ بودجه عملکرد بعد از baseline نصب واقعی تعیین شود.
- **A05 / PR #79** [ادغام‌شده](https://github.com/davoodmehraban89/Factor-easyPro/pull/79)، [Native Windows #38946201604](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38946201604) و [Quality #38946201310](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38946201310) موفق‌اند. ایجاد دوره ۱۴۰۴ ساختگی، توقف بستن آن با انبارگردانی باز، تأیید عدم تغییر دوره/Audit، سپس بستن پس از حذف مانع و ثبت یک Audit با actor در **رابط واقعی AccountingView نصب‌شده** آزموده شد.
- **A07 / PR #80** [ادغام‌شده](https://github.com/davoodmehraban89/Factor-easyPro/pull/80)، [Native Windows #38947068034](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38947068034) و [Quality #38947068027](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38947068027) موفق‌اند. پس از نصب NSIS و آزمون مالی/بکاپ، موتور واقعی WebView2 با CDP به حالت **offline emulation** برده شد؛ هر ده مسیر بدون خطا بار شدند، سپس شبکه به حالت اول برگشت. این **جایگزین خاموش‌کردن کارت شبکه مشتری یا چاپ فیزیکی نیست**.
- **A01 / PR #81** [ادغام‌شده](https://github.com/davoodmehraban89/Factor-easyPro/pull/81)، [Native Windows #38947474640](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38947474640) و [Quality #38947474622](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38947474622) موفق‌اند. در رابط نصب‌شده فروش ۶۰۰ ریالی با دریافت ۲۰۰ ریال ساخته شد، برگشت جداگانه ۲۰۰ ریالی ثبت شد؛ دفتر کل تراز و ورود کالا به انبار تأیید شد، سند اصلی تغییر نکرد، پول نقد خودکار برگشت نخورد، و مرجوعی بیشتر از تعداد اصلی بدون درج سند/انبار/Audit رد شد. **این فقط بخشی از A01** و نه پذیرش کامل پرداخت/چک/مرجوعی خرید/QA است.
- **گیت‌های Release** در `docs/PHASE_A_RELEASE_ACCEPTANCE.json` همچنان `accepted:false` هستند. خروج از فاز به حسابدار مستقل، سیاست کلید عمومی تجاری تولیدی، آزمایش سخت‌افزار چاپ، مجموعه داده قدیمیِ مجاز و سناریوهای crash/power در محیط disposable نیاز دارد. [Runbook خروج](docs/PHASE_A_EXIT_RUNBOOK_FA.md) مرز شواهد را توضیح می‌دهد. انتشار عمومی جدید انجام نشده است.


## شواهد آزمون‌های A01/A04/A05/A07/A08 — 2026-10-16

- **A01 / PR #81** [merged](https://github.com/davoodmehraban89/Factor-easyPro/pull/81) در commit [`8f49d5f`](https://github.com/davoodmehraban89/Factor-easyPro/commit/8f49d5ff9f40226de0207899ab243340d6ebcdf9): اجرای موفق [Windows VM #38947474640](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38947474640) و [Quality #38947474622](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38947474622) شامل برگشت فروش واقعی در رابط نصب‌شده، سند دفتر کل تراز و مرتبط، ورود مجدد کالا، عدم اصلاح فاکتور اصلی، عدم استرداد وجه خودکار، و رد مرجوعی بیش از تعداد با rollback.
- **A04 / PR #77** [merged](https://github.com/davoodmehraban89/Factor-easyPro/pull/77): [Windows VM #38945374347](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38945374347) آزمون failure late-validation در بازیابی را بعد از staging داده اجرا کرد؛ بازگشت تمام رکوردها و عدم ایجاد audit موفقیت کاذب را تأیید نمود. معادل قطع برق/خرابی فیزیکی نیست.
- **A05 / PR #79** [merged](https://github.com/davoodmehraban89/Factor-easyPro/pull/79): [Windows VM #38946201604](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38946201604) کنترل بستن دوره در حضور انبارگردانی باز را در رابط واقعی، عدم تغییر داده و audit در شکست و ثبت فقط یک audit هنگام بستن مجاز را تأیید کرد.
- **A07 / PR #80** [merged](https://github.com/davoodmehraban89/Factor-easyPro/pull/80): [Windows VM #38947068034](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38947068034) با WebView2 CDP network-emulation حالت آفلاین را برای **ده مسیر داخلی** بررسی کرد. این شبیه‌سازی معادل قطع فیزیکی Wi-Fi مشتری، چاپگر و شبکه محلی نیست.
- **A08 / PR #78** [merged](https://github.com/davoodmehraban89/Factor-easyPro/pull/78): [Windows synthetic baseline #38945788170](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38945788170) با ۱۰٬۰۰۰ کالا و ۵۰٬۰۰۰ فاکتور مصنوعی روی Node/fake-indexeddb در Windows Runner موفق بود؛ مدت seed به‌ترتیب 192.57ms و 2916.37ms، خواندن ده‌هزار فاکتور یک شرکت p95=338.4ms و export=356.13ms اندازه‌گیری شد. **این سنجه سرعت EXE واقعی نیست** و هنوز SLA/P95 انتشار تعیین نشده است.
- **گیت پذیرش:** A01 تا A08 و INDEPENDENT_QA/DATA_BACKUP همگی `accepted:false` می‌مانند. آزمایش‌های تکمیلی، فرمت/مهاجرت نسخه‌های قدیمی بیشتر، بررسی حسابدار مستقل، چاپ فیزیکی و کلید امضای واقعی/معتبر تجاری همچنان بازند. آخرین Release عمومی `v2.0.3` است؛ هیچ نسخه تولیدی جدید از این PRها منتشر نشده است.


## A02 — آزمون افتتاحیه مسدود با داده مالی قبلی در Windows VM — 2026-10-16

- [PR #82](https://github.com/davoodmehraban89/Factor-easyPro/pull/82) با [CI Quality #38948802003](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38948802003) و [آزمایشگاه نصب واقعی Windows #38948801630](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38948801630) موفق و در main ادغام شد؛ commit [`ebb6fc10`](https://github.com/davoodmehraban89/Factor-easyPro/commit/ebb6fc10f666890941c10d783d87edf2a3b36a50).
- در WebView2 نصب‌شده و رابط واقعی AccountingView، فایل JSON مصنوعی افتتاحیه روی شرکتی با اسناد مالی قطعی موجود بررسی شد. `EXISTING_POSTED_JOURNALS` و `MISSING_OPENING_JOURNAL_LINES` در preview به‌صورت مسدود نمایش داده شد؛ دکمه ثبت قطعی disabled و تغییر شمار رکوردهای دفتر کل، سطرها، تنظیمات و audit صفر بود.
- این پوشش **مسیر منفی/عدم خراب‌کردن داده** است؛ اثبات ثبت افتتاحیه تاریخی صحیح، انتقال و تطبیق موجودی/بدهی واقعی، سازگاری چند نسخه قدیمی و QA مستقل نیست. گیت A02 هنوز `accepted:false` و انتشار تولیدی همچنان ممنوع است.


## A03 و A06 — مقاوم‌سازی عملیاتی سرویس داده و لایسنس — 2026-10-16

- **A06 / [PR #83](https://github.com/davoodmehraban89/Factor-easyPro/pull/83)** با [CI #38949288384](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38949288384) (۱۸۷/۱۸۷ Node + preview) و [Windows native #38949288708](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38949288708) سبز و در [commit `d1d0ec7`](https://github.com/davoodmehraban89/Factor-easyPro/commit/d1d0ec7405779bc81749e2a9c6d9b3cd4c3d2356) ادغام شد. تاریخ آغاز Trial یا شمارنده خراب/مفقودِ **ذخیره‌شده** دیگر به بازنشانی و صدور Trial جدید منجر نمی‌شود؛ داده باقی می‌ماند و مجوز fail-closed است. تاریخ غیرقابل‌خواندن یا آینده برای lease آفلاین هم مانع نوشتن است. **کلید عمومی صادرکننده تولیدی، صدور توکن و آزمون مالک/دستگاه واقعی هنوز لازم است.**
- **A03 / [PR #84](https://github.com/davoodmehraban89/Factor-easyPro/pull/84)** با [CI #38949950415](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38949950415)، [Windows native #38949950396](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38949950396) و [A08 Windows benchmark #38949950445](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38949950445) موفق و در [commit `3b689b3`](https://github.com/davoodmehraban89/Factor-easyPro/commit/3b689b3ac6f3474eabfeb648de1d9a1eeedb2ac4) ادغام شد. مسیرهای معمول `StorageService.put` و `transaction.put/putRaw` برای `audit_events` و `document_corrections` فقط رکورد جدید اضافه می‌کنند؛ `delete` معمول برای آنها رد می‌شود. بازیابی مطمئن و audit قبلی با آزمون نصب‌شده بازآزمایی شد. **دستکاری مستقیم فایل IndexedDB و پاک‌کردن عمدی تمام اطلاعات با `clearAll` در این PR حل نشده‌اند.**
- نتیجه فقط شواهد قسمتی برای A03/A06 است؛ **گیت هر دو `accepted:false`** و Release عمومی همچنان v2.0.3 باقی می‌ماند.


## A08 — benchmark نصب واقعی EXE با ۶۰هزار رکورد در WebView2 — 2026-10-16

- **[PR #85](https://github.com/davoodmehraban89/Factor-easyPro/pull/85)** ادغام‌شده در main: commit [`e3c5898`](https://github.com/davoodmehraban89/Factor-easyPro/commit/e3c58982cfc2a947a3c16f4669d4335a86bd4b4a). [PR Quality #38950537639](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38950537639) و [Native Windows VM #38950537874](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38950537874) هر دو success؛ [Artifact #12068227334](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38950537874/artifacts/12068227334).
- در **نصب واقعی NSIS/EXE** با Tauri/WebView2 و IndexedDB واقعی، یک پروفایل ویندوزی موقت و مستقل برای benchmark ساخته شد. ۱۰٬۰۰۰ کالای مصنوعی و ۵۰٬۰۰۰ فاکتور مصنوعی *ثبت‌قطعی‌نشده* وارد شدند. شمار رکوردها و خروجی exportAll بدون افشای credential کنترل شدند.
- اندازه‌گیری Windows Runner (یک اجرا؛ عدم ادعای SLA): seed کالا `1003.1ms`، seed فاکتور `7080.5ms`، ده بار خواندن ۵۰٬۰۰۰ فاکتور شرکت فعال `p50=342.3ms` و `p95=351.7ms`، خروجی کامل `426.3ms`. پروفایل بومی benchmark جدا از آزمون ارتقا، بکاپ، اسناد مالی و کنترل مسیرها بود.
- **مرز اعتبار:** این نخستین سنجه واقعی EXE نصب‌شده است، اما آزمون چاپ فیزیکی، پایگاه داده مشتری، همزمانی چندکاربره، قطع برق/خرابی دیسک یا پاسخ‌گویی UI با داده کامل ثبت‌قطعی‌شده را اثبات نمی‌کند. **A08.accepted=false** و انتشار عمومی هنوز `v2.0.3` است.


## A02 ثبت افتتاحیه کنترل‌شده و A07 چاپ PDF چندصفحه‌ای روی EXE — 2026-10-16

- **A02 [PR #87](https://github.com/davoodmehraban89/Factor-easyPro/pull/87)** با [Quality #38955574659](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38955574659) و [Windows NSIS/WebView2 #38955574896](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38955574896) موفق و در [commit `2906c144`](https://github.com/davoodmehraban89/Factor-easyPro/commit/2906c144a1d7f723bd9efbfc36b573f64ed8f9b9) ادغام شد. فرم واقعی AccountingView فایل JSON کاملاً مصنوعی مانده افتتاحیه طلب شخص/حقوق مالکانه را ابتدا بدون نوشتن بررسی و سپس با تأیید مدیر یک سند قطعی ترازِ ۲سطره همراه تنها یک `opening_posted` ایجاد کرد؛ تلاش دوم برای همان افتتاحیه مسدود شد. هنوز اثبات‌کننده مهاجرت تاریخی واقعی اشخاص و موجودی نیست.
- **A07 [PR #86](https://github.com/davoodmehraban89/Factor-easyPro/pull/86)** با [Quality #38955075675](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38955075675) و [Windows NSIS/WebView2 #38955075618](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38955075618) موفق و در [commit `3108ddd0`](https://github.com/davoodmehraban89/Factor-easyPro/commit/3108ddd0a6e3f023222815024ef23796e13b0599) ادغام شد. رندرکننده واقعی فاکتور رسمی فارسی با ۱۱۰ ردیف ساختگی و CSS صفحه‌بندی متناظر قالب چاپ، خروجی `Page.printToPDF` **دوصفحه‌ای** با ۴۲۰۰۴۷ بایت تولید کرد. [Artifact PDF/JSON #12070653040](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38955075618/artifacts/12070653040).
- چاپ واقعی با پرینتر فیزیکی، تأیید بصری انسانی حروف/حاشیه RTL، گردش چاپ از پنجره چاپ کاربر و انطباق واقعی فرم مالیاتی **بررسی نشده‌اند**. پذیرش A02/A07 و همه سایر بخش‌ها همچنان `accepted:false` و انتشار عمومی `v2.0.3` باقی می‌ماند.


## A04 — قطع واقعی فرایند در میانه importAll و بازیابی پروفایل ویندوز — 2026-10-16

- [PR #88](https://github.com/davoodmehraban89/Factor-easyPro/pull/88) پس از سبزشدن [PR Quality #38956382672](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38956382672) و [Windows NSIS/Tauri/WebView2 #38956382667](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38956382667) ادغام شد؛ commit [`dc8dc434`](https://github.com/davoodmehraban89/Factor-easyPro/commit/dc8dc43416d8e7d53c52030bb8c01621107efc48)، [Artifact #12071096362](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38956382667/artifacts/12071096362).
- در پروفایل مستقل و آزمایشیِ ویندوز، `StorageService.importAll` واقعیِ ۵۰هزار Contact ساختگی اجرا شد. بعد از اینکه حداقل ۲۰ درخواست `putRaw` در تراکنش یکپارچه طی شده ولی commit هنوز کامل نشده بود، runner با `taskkill /T /F` **پردازه واقعی EXE و فرزندان WebView2** را از میان برد. همان نصب با همان پروفایل راه‌اندازی شد؛ ورود کاربر آزمایشی حفظ شده و شمار `vm-a04-crash-contact-*` **صفر** بود.
- این صرفاً شبیه‌سازی throw داخل تراکنش نیست؛ **قطع واقعی پردازه** حین Restore را آزمایش کرده است. بااین‌حال این نتیجه جای قطع برق/Kernel crash/disk fault واقعی، فایل رمزگذاری‌شده مشتری، بررسی مستقل، یا مهاجرت تمام نسخه‌های قدیمی را نمی‌گیرد. `A04.accepted=false`، `DATA_BACKUP.accepted=false` و انتشار نسخه عمومی همچنان ممنوع هستند.


## A01 — برگشت از خرید در نصب واقعی Windows — 2026-10-16

- [PR #89](https://github.com/davoodmehraban89/Factor-easyPro/pull/89) با [CI #38956709911](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38956709911) و [Windows NSIS/Tauri/WebView2 #38956709934](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38956709934) موفق، در [commit `15c318d`](https://github.com/davoodmehraban89/Factor-easyPro/commit/15c318d688d81c176db6ebadea0467331949315b) ادغام شد.
- در فرم واقعی ویندوز، برگشت از خریدِ مرجع‌دار با داده کاملاً ساختگی اجرا شد؛ دفتر کل مستقل و تراز ایجاد، کالا از موجودی خارج، سند خرید اولیه تغییر نکرد، اصلاح سند به منبع مرتبط شد و بدون دستور خزانه، هیچ دریافت/پرداخت خودکار ثبت نشد. درخواست برگشت تعداد بیش‌ازمقدار اولیه، حتی با مبلغ کمتر از سقف مالی، همراه Toast خطا رد شد و تعداد فاکتورها، گردش انبار و Audit تغییر نکرد.
- این پوشش مثبت/منفی A01 را توسعه می‌دهد ولی جای ارزیابی مستقل حسابدار، چرخه وصول/برگشت چک و تسویه چندمرحله‌ای واقعی را نمی‌گیرد؛ `A01.accepted=false` و سایر گیت‌های انتشار همچنان بسته‌اند.


## ادغام یکپارچه فاز A روی Windows NSIS واقعی — 2026-10-16

- **[PR #90](https://github.com/davoodmehraban89/Factor-easyPro/pull/90)** با [PR Quality #38957782443](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38957782443) و [Windows Native Integrated #38957782413](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38957782413) `success` روی SHA یکسان و پس از کنترل فایل‌های تغییرکرده، در [commit `d609413f`](https://github.com/davoodmehraban89/Factor-easyPro/commit/d609413f4671e8531eeafae04d5c05e62cc0fb96) به main ادغام شد.
- `scripts/windows-vm-native-lab.ps1` اکنون در یک اجرای واحدِ **EXE واقعیِ NSIS/Tauri/WebView2** وجود خروجی همه **۱۰ سناریوی مالی/افتتاحیه/فاکتور/مرجوعی/بکاپ و بستن دوره**، **۱۰ مسیر آفلاین**، PDF رسمی فارسی با ۱۱۰ قلم و دست‌کم ۲ صفحه، اندازه‌گیری native IndexedDB با ۱۰هزار کالا و ۵۰هزار فاکتور، و **قطع فرایند واقعی Windows حین `importAll` و صفر رکورد ناقص پس از راه‌اندازی مجدد همان پروفایل** را الزام‌آور می‌کند. نبود هر سناریو باعث failure کل Windows VM خواهد شد.
- **مرز اعتبار**: تمام داده‌ها مصنوعی و مخصوص CI هستند. آزمایش پرینتر فیزیکی، فایل مشتری واقعی با رضایت، قطع برق/دیسک واقعی، صدور و پشتیبانی امضای مجوز تجاری و امضای حسابدار مستقل هنوز شواهد موردنیاز ندارند. بنابراین هیچ یک از A01..A08 یا INDEPENDENT_QA / DATA_BACKUP به حالت `accepted:true` نرسیده‌اند و آخرین نسخه عمومی همچنان `v2.0.3` است. هیچ انتشار تولیدی جدیدی انجام نشد.


## A03 — حفاظت در برابر پاک‌سازی گروهی تاریخچه و آزمون Windows VM — 2026-10-16

- [PR #91](https://github.com/davoodmehraban89/Factor-easyPro/pull/91) پس از [PR Quality #38959511822](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38959511822) (۱۹۰/۱۹۰ تست Node، بسته ویندوز، build و audit موفق)، [Native Windows #38959512012](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38959512012) و [Windows baseline #38959511988](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38959511988) موفق در [commit `b16448b9`](https://github.com/davoodmehraban89/Factor-easyPro/commit/b16448b955d3c380e5c2d4f6df4b89970e6d589d) ادغام شد؛ [Artifact #12072562002](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38959512012/artifacts/12072562002).
- رخنه API معمول `StorageService.transaction().clear` برای `audit_events` و `document_corrections` بسته شد. آزمون نصب واقعی EXE نشان داد عملیات حذف گروهی رد شده، سایر نوشته‌های همان تراکنش rollback می‌شوند و تاریخچه اصلی بدون تغییر می‌ماند. `clearAll` به عنوان **بازنشانی عمدی کل پایگاه داده** از API عادی جدا شد اما با تراکنش اتمی و انتظار برای `oncomplete` همچنان کار می‌کند.
- آزمایشگاه اکنون **۱۱** سناریوی الزامی مالی را در نصب واقعی Windows/Tauri/WebView2 همراه با سناریوهای کامل قبلی اجرا می‌کند. این حفاظت به معنی tamper-proof بودن فایل خام IndexedDB، مدیریت ماندگاری/retention اطلاعات حسابرسی یا تأیید مستقل امنیتی نیست. `A03.accepted=false` و همه گیت‌های Release همچنان بسته هستند.


## A05 — کنترل پیش‌نویس و بستن تکراری دوره در Windows NSIS — 2026-10-16

- [PR #92](https://github.com/davoodmehraban89/Factor-easyPro/pull/92) بعد از [PR Quality #38960775857](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38960775857) (۱۹۲/۱۹۲ آزمون Node، build/audit و نصب‌کننده ویندوز سبز) و [Windows Native #38960775828](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38960775828) موفق، در [commit `245dacc5`](https://github.com/davoodmehraban89/Factor-easyPro/commit/245dacc572b24090ef0cc1bfb29733f1c67b4165) ادغام شد؛ [Artifact #12073575050](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38960775828/artifacts/12073575050).
- در رابط واقعی AccountingView نسخه نصب‌شده، پس از بررسی انبارگردانی باز، **سند مالی پیش‌نویس** عمداً در دوره ساختگی نگه داشته شد؛ درخواست بستن دوره با خطای واقعی رد شد و وضعیت دوره و Audit `period_closed` تغییر نکرد. پس از حذف پیش‌نویس فقط در fixture، دوره بسته شد و درخواست بستن مجدد از همان رابط با خطای «دوره مالی بسته است» و بدون رویداد دوم رد شد. دو آزمون واحد دیگر بستن با پیش‌نویس و درخواست هم‌زمان دو دستور Close را بررسی کردند.
- این پوشش فنیِ A05 است؛ مغایرت‌گیری نهایی حساب‌های خزانه، چک‌های دریافتی/پرداختی، تأیید حسابدار مستقل و داده واقعی مشتری هنوز ارائه نشده‌اند. `A05.accepted=false` و هیچ نسخه تولیدی جدیدی منتشر نشده است.


## A05 — مسدودسازی انتقال و وصول چک از حساب غیرفعال — 2026-10-16

- [PR #93](https://github.com/davoodmehraban89/Factor-easyPro/pull/93) در [commit `ede489cc`](https://github.com/davoodmehraban89/Factor-easyPro/commit/ede489ccdc892d58817e7cde88269d0559bd87e5) پس از موفقیت [CI #38963640313](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38963640313) (۱۹۳/۱۹۳ آزمون Node، build/audit و نصب‌کننده ویندوز) و [Windows NSIS/Tauri/WebView2 #38963640187](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38963640187) ادغام شد؛ [Artifact #12074411460](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38963640187/artifacts/12074411460).
- **اصلاح تولیدی A05:** `RetailPostingService.transferCash` از انتقال از/به صندوق یا بانک غیرفعال جلوگیری می‌کند؛ `postExpense` فقط حساب‌های فعال را انتخاب می‌کند؛ `changeChequeStatus` حساب مقصد وصول چک را فقط از حساب‌های فعال مجاز می‌داند (از جمله `accountId` صریح).
- **شاهد رابط نصب‌شده:** حساب دوم با فرم واقعی TreasuryView در ماشین مجازی ایجاد و غیرفعال شد؛ تلاش انتقال از فرم واقعی خطا داد و دفتر کل و تراکنش‌ها تغییر نکردند. همه حساب‌ها موقتاً با داده ساختگی غیرفعال شدند؛ وصول چک از ChequesView رد شد، وضعیت چک در انتظار باقی ماند و سند/دریافت جدید ایجاد نشد. پس از فعال‌کردن صندوق معتبر، چک دقیقاً یک‌بار وصول شد. ماتریس یکپارچه به **۱۲ سناریوی مالی اجباری** ارتقا یافت؛ تست‌های بازیابی، چاپ RTL، عملکرد ۶۰هزار رکوردی، آفلاین و توقف اجباری فرایند همچنان موفق بودند.
- این شواهد فنی جای تطبیق مستقل خزانه، سناریوهای مشتری یا آزمون فیزیکی را نمی‌گیرند. `A05.accepted=false` و `INDEPENDENT_QA.accepted=false` باقی می‌مانند؛ نسخه عمومی جدیدی منتشر نشده است.


## A05 — مغایرت‌گیری خزانه و چک در EXE نصب‌شده — 2026-10-16

- [PR #94](https://github.com/davoodmehraban89/Factor-easyPro/pull/94) در commit [`693b6e84`](https://github.com/davoodmehraban89/Factor-easyPro/commit/693b6e84b41f1b6bd7e1e831e998464906401b01) پس از [PR Quality #38966862057](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38966862057) (۱۹۵/۱۹۵ آزمون Node) و [Windows Native #38966862121](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38966862121) سبز ادغام شد؛ [Artifact #12075666586](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38966862121/artifacts/12075666586).
- گزارش **صرفاً خواندنی** AccountingView اکنون وضعیت چک‌های قطعی را با سند اولیه، سند تغییر وضعیت و دقیقاً یک دریافت/پرداخت مرتبط با چک وصول‌شده تطبیق می‌دهد؛ ارجاع اشتباه مبلغ خزانه به تسویه، استفاده مجدد از یک تراکنش برای چند تسویه و مبلغ مغایر تشخیص داده می‌شود. آزمون واقعی EXE با افزودن **یک چک ناقص کاملاً مصنوعی** کدهای خطا را تأیید و عدم نوشتن گزارش را اثبات کرد؛ سپس fixture پاک شد. ماتریس یکپارچه اکنون **۱۳ سناریوی مالی اجباری** دارد.
- [PR #95](https://github.com/davoodmehraban89/Factor-easyPro/pull/95) نیز [بسته اجرایی پذیرش مستقل](docs/PHASE_A_EXTERNAL_SIGNOFF_PACKET_FA.md) را بدون هیچ امضا یا پذیرش ساختگی اضافه کرد. حسابدار مستقل، صاحب فایل پشتیبان واقعی، مالک کلید عمومی تجاری و آزمونگر چاپگر/سیستم فیزیکی هنوز باید شواهد معتبر خود را ارائه کنند. همه گیت‌های پذیرش `accepted:false` هستند و نسخه عمومی همچنان `v2.0.3` است.


## A01 و A08 — سقف خالص بازپرداخت/وصول و حافظه WebView2 — 2026-10-16

- **A01 [PR #96](https://github.com/davoodmehraban89/Factor-easyPro/pull/96)** با [Quality #38968458992](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38968458992) (۱۹۸/۱۹۸ آزمون Node + نصب‌کننده) و [Windows Native #38968458924](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38968458924) موفق و در [commit `4cb4d665`](https://github.com/davoodmehraban89/Factor-easyPro/commit/4cb4d665445c58f982b58b2a19a4f2ae51e9292c) ادغام شد؛ [Artifact #12076655008](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38968458924/artifacts/12076655008). شکاف مالی **بازپرداخت وجه از مرجوعی بدون وجه وصول‌شده قبلی** و **دریافت بیش از مانده خالص بعد از مرجوعی** با محاسبه اتمی بر اساس `original.grandTotal - returns`، وجه وصول‌شده قبلی و مبلغ استردادشده بسته شد. فرم‌های خزانه اکنون فاکتور اختیاری مرتبط را انتخاب می‌کنند و فاکتورها تنها هنگام بازکردن فرم، نه در بارگذاری اولیه مسیر خزانه، بارگذاری می‌شوند. آزمون EXE واقعی رد دو عملیات مالی نامعتبر، عدم side effect و ثبت دریافت خالص مجاز را تأیید کرد؛ ماتریس به **۱۴ سناریوی نصب واقعی** رسید. این جای بررسی مستقل اصلِ سیاست حسابداری/اسناد برگشتی یا مجوز واقعی بازپرداخت مشتری نیست.
- **A08 [PR #97](https://github.com/davoodmehraban89/Factor-easyPro/pull/97)** با [Quality #38968326883](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38968326883) و [Windows Native #38968326871](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38968326871) موفق و در [commit `3ea108e2`](https://github.com/davoodmehraban89/Factor-easyPro/commit/3ea108e21470dd4df9d07ffd3804577d56706f54) ادغام شد؛ [Artifact #12076455595](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38968326871/artifacts/12076455595). در EXE نصب‌شده با ۱۰٬۰۰۰ کالا و ۵۰٬۰۰۰ فاکتور کاملاً مصنوعی، `Runtime.getHeapUsage` واقعی CDP برای پردازشگر WebView2 حافظه **used** را قبل `1,719,788` بایت و بعد `37,891,316` بایت و حافظه allocated را `73,764,864` بایت ثبت کرد. **این حافظه JS Heap است، نه مجموع RAM ویندوز یا سنجش میدانی SLA.**
- هر دو تغییر روی داده‌های *کاملاً مصنوعی* بررسی شده‌اند؛ نسخه عمومی هنوز `v2.0.3` است. آزمون تجمیعی آخرین `main` به عنوان [PR #98](https://github.com/davoodmehraban89/Factor-easyPro/pull/98) شروع شد و نتیجه آن فقط پس از CI واقعی ثبت می‌شود. تمام گیت‌ها از جمله `INDEPENDENT_QA` و `DATA_BACKUP` همچنان `accepted:false` هستند.


## فاز A — تأیید تجمیعی ۱۴ سناریوی مالی و JS Heap در Windows Native — 2026-10-16

- **[PR #98](https://github.com/davoodmehraban89/Factor-easyPro/pull/98)** با [PR Quality #38969463814](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38969463814) و [Windows NSIS/Tauri/WebView2 #38969463728](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38969463728) موفق روی نسخه واحد و در [commit `0be58406`](https://github.com/davoodmehraban89/Factor-easyPro/commit/0be5840609293ee8221a75f1c7dcfa4b35749d3f) ادغام شد؛ [Artifact #12076093834](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38969463728/artifacts/12076093834).
- آزمایشگاه نسخه واقعی نصب‌شده، **۱۴ سناریوی اجباری** (از جمله سقف نقدی مرجوعی و گزارش مغایرت چک/تسویه)، ۱۰ مسیر آفلاین، PDF دوصفحه‌ای فارسی، ۱۰هزار کالا و ۵۰هزار فاکتور با زمان و **JS Heap** معتبر، ارتقا از NSIS v2.0.3، بازیابی فایل رمزگذاری‌شده ساختگی و توقف اجباری فرایند بازیابی همراه با rollback را در یک اجرای یکپارچه تأیید کرد. `nativeJsHeapAfterUsedBytes=37240492` صرفاً heap پردازشگر WebView2 در همان اجرای CI است، **نه RAM کل دستگاه**.
- مسئولیت‌های بیرونی در [بسته پذیرش مستقل](docs/PHASE_A_EXTERNAL_SIGNOFF_PACKET_FA.md) مستند شده‌اند: امضای حسابدار مستقل، تأیید سیاست ممیزی/نگهداری، پشتیبان واقعی و مجوز آن، کلید عمومی ناشر تجاری، پرینتر/سیستم فیزیکی نماینده و آزمون بلندمدت/قطع برق. نتیجه این موارد ارائه نشده و **تمام گیت‌های `docs/PHASE_A_RELEASE_ACCEPTANCE.json` هنوز `accepted:false`** هستند؛ **اعلام اتمام رسمی فاز A یا انتشار عمومی مجاز نیست**.


## A02 — قرارداد سازگاری هلو و پیش‌بررسی بدون مهاجرت — 2026-10-16

- [PR #99](https://github.com/davoodmehraban89/Factor-easyPro/pull/99) در [commit `30e7ac97`](https://github.com/davoodmehraban89/Factor-easyPro/commit/30e7ac9748fc7e8a93ff5e7e7a6aba1804a8bcad) پس از موفقیت [PR Quality #38974612752](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38974612752) (۲۰۴/۲۰۴ آزمون Node، ساخت Vite/Windows و audit) و [Windows Native #38974612700](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38974612700) ادغام شد؛ [Artifact #12078212399](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38974612700/artifacts/12078212399).
- **تصمیم معماری:** دیتابیس فینورا IndexedDB v7 مستقل می‌ماند؛ نسخه‌های شناخته‌شده هلو در آینده با آداپتورهای منبع جداگانه به یک مدل میانی ثابت و سپس مهاجرت کنترل‌شده تبدیل می‌شوند. [ADR-002](docs/adr/ADR-002-holoo-migration-compatibility-fa.md) سیاست حفاظت، تطبیق، افتراق انتقال صرفاً افتتاحیه از سوابق کامل، شناسه پایدار و مسئولیت تأیید حسابدار را مشخص می‌کند.
- پیش‌بررسی **کاملاً بدون نوشتن** `previewHolooExtract` روی داده‌های **جدولی استخراج‌شده و نگاشت صریح ستون‌ها**، شناسه منبع تکراری، مرجع مفقود، مبلغ غیرصحیح ریالی و پرداخت بیش‌ازکل را بدون افشای نام یا شناسه شخص در گزارش تشخیص می‌دهد. حتی خروجی بدون ایراد، `canCommit:false` دارد؛ فقط مرحله بررسی منبع است.
- **محدودیت واقعی:** هیچ فایل هلو دریافت/بازگشایی نشده؛ فرمت بکاپ اختصاصی، رمزگذاری، نسخه و نام جداول/ستون‌های واقعی هنوز نامعلوم‌اند. پس **هیچ واردکننده فعال یا ادعای تبدیل کامل/مستقیم فایل هلو وجود ندارد**. تکمیل A02 نیازمند بکاپ متعلق به مالک، استخراج مجاز و نمونه‌های مجهز به نقشه‌ستون و QA مالی مستقل است. `A02.accepted=false` و سایر گیت‌ها بدون تغییر باقی می‌مانند. نسخه عمومی `v2.0.3` است.


## A02 — ورودی CSV/TSV صریح و کنترل واحد پول با آزمون Windows Native — 2026-10-16

- [PR #100](https://github.com/davoodmehraban89/Factor-easyPro/pull/100) در [commit `18f434b9`](https://github.com/davoodmehraban89/Factor-easyPro/commit/18f434b9d78e8575a1432bcd51afa5acc520532d) پس از [Quality #38976459981](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38976459981) (۲۱۳/۲۱۳ آزمون Node، build/audit و ساخت بسته ویندوز موفق) و [Windows Native #38976459938](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38976459938) موفق ادغام شد؛ [Artifact #12079640741](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/38976459938/artifacts/12079640741).
- ماژول `HolooDelimitedExportPreflight.mjs` **فقط خروجی‌های متنی جدول‌بندی‌شده و از پیش استخراج‌شده** را با نگاشت صریح ستون‌ها بررسی می‌کند: CSV/TSV (BOM، کوتیشن و متن چندخطی)، سرستون تکراری/نامعتبر، تعداد ستون متناقض، حجم محدود، واحد پول `rial` یا `toman` با انتخاب الزامی، عدد صحیح/سرریز، شناسه تکراری و ارجاع یتیم. شکاف `HolooMigrationPreflight` که نبود جدول والد را بدون هشدار رد نمی‌کرد اصلاح شد. گزارش فقط کد ایراد، شاخص ردیف و تعداد دارد؛ متن خام و شناسه شخص یا حساب را نمایش نمی‌دهد؛ `canCommit:false` و `importPerformed:false` هستند.
- **واقعیت پذیرش:** هنوز بکاپ واقعی هلو دریافت نشده، نسخه و قالب واقعی هلو شناسایی نشده، ابزار خواندن فایل اختصاصی یا انتقال داده به فینورا ساخته نشده است؛ آزمون صرفاً با داده ساختگی انجام شده و **تأیید حسابدار مستقل موجود نیست**. `A02.accepted=false` و تمام گیت‌های Release باز هستند. آخرین نسخه عمومی `v2.0.3` است.
