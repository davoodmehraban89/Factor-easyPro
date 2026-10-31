'use strict';
// Pure converter for installed-WebView2 synthetic action audit evidence.
// Does not inspect the owner's machine or call an external service.
const fs=require('node:fs');

const routeName={
  dashboard:'داشبورد',invoices:'فاکتورها',products:'کالا و انبار',
  contacts:'اشخاص',treasury:'خزانه و بانک',cheques:'چک‌ها',
  expenses:'هزینه و درآمد',reports:'گزارش‌ها',
  accounting:'حسابداری دوبل',settings:'تنظیمات'
};
function cell(value){
  return String(value??'').replace(/\|/g,'\\|').replace(/[\r\n\t]+/g,' ')
    .replace(/[\u0000-\u001f]/g,' ').slice(0,260);
}
function buildReport(audit){
  if(!audit||audit.environment!=='installed-Windows-Tauri-WebView2-synthetic-VM'||
    !Array.isArray(audit.uniqueActions)||!Array.isArray(audit.controls)||
    audit.everyActionVerified!==false||audit.customerDataUsed!==false){
    throw Error('Q01_NATIVE_AUDIT_UNVERIFIED_INPUT');
  }
  if(audit.uniqueActionCount!==audit.uniqueActions.length||
    audit.inventoryCount!==audit.controls.length){
    throw Error('Q01_NATIVE_AUDIT_COUNT_MISMATCH');
  }
  const actions=audit.uniqueActions;
  const pending=actions.filter(x=>x.status!=='clicked');
  const errors=(audit.problems||[]).filter(x=>x);
  const lines=[
    '# Q01 — کنترل‌های رابط کاربری هنوز نیازمند تأیید',
    '',
    '**این فهرست، گزارش آزمون نصب‌شده ویندوز با داده ساختگی است، نه گواهی صحت تمام عملیات مالی.**',
    '',
    '| شاخص | مقدار |',
    '|---|---:|',
    '| موارد نمایش کنترل (شامل تکرار در تب‌ها) | '+audit.inventoryCount+' |',
    '| امضاهای کنترلی متمایز | '+audit.uniqueActionCount+' |',
    '| امضاهای کلیک‌شده حداقل یک بار | '+audit.uniqueActionClicked+' |',
    '| امضاهای کلیک‌نشده | '+audit.uniqueActionUnverified+' |',
    '| امضاهای غیرفعال | '+audit.uniqueActionDisabled+' |',
    '| امضاهای دارای شکست آزمون | '+audit.uniqueActionFailed+' |',
    '| موارد تکراری در تب‌ها | '+audit.duplicateInstanceCount+' |',
    '| هشدارهای مشاهده‌شده | '+errors.length+' |',
    '',
    'گروه‌بندی بر اساس امضای صفحه، نوع کنترل، متن و هندلر است؛',
    'چند نمونه یک کنترل در تب‌های مختلف با یک امضا شمرده می‌شوند.',
    'امضای مشابه در دو گفت‌وگوی مستقل نیز می‌تواند به یک گروه تبدیل شود؛',
    'بنابراین این شمارش جایگزین تست تک‌تک سناریوهای کسب‌وکار نیست.',
    ''
  ];
  for(const [route,label] of Object.entries(routeName)){
    const part=pending.filter(x=>x.route===route);
    if(!part.length)continue;
    lines.push('## '+label+' — '+part.length+' مورد باقی‌مانده','','| کنترل | وضعیت | علت / گام لازم | هندلر |','|---|---|---|---|');
    for(const row of part){
      lines.push('| '+cell(row.label||'(بدون نام)')+' | '+cell(row.status)+
        ' | '+cell(row.whyNotVerified||'به آزمون مستقل نیاز دارد')+
        ' | '+cell(row.handler||'(listener پویا)')+' |');
    }
    lines.push('');
  }
  lines.push('## هشدارهای مشاهده‌شده','','| صفحه | نوع | جزئیات |','|---|---|---|');
  if(!errors.length)lines.push('| — | — | هشدار قابل ثبت در این اجرا دیده نشد؛ صفر هشدار به معنی تأیید تمام عملیات نیست. |');
  for(const item of errors){
    lines.push('| '+cell(routeName[item.route]||item.route)+
      ' | '+cell(item.kind)+' | '+cell(item.label||item.handler||item.error)+' |');
  }
  lines.push('','## معیار خاتمه ممیزی','',
    '- هر عمل مالی حساس باید با fixture ساختگی، مجوز کاربر و کنترل قبل/بعد آزمایش شود.',
    '- دکمه‌های بدون listener درون‌خطی باید با ردگیری واقعی رویداد بررسی شوند.',
    '- عکس‌های ۱۰ صفحه در مقیاس و تم‌های مختلف بازبینی دیداری شوند.',
    '- نتیجه منفی یا هشدار هیچ‌گاه با کلیک موفق همان دکمه در تب دیگر پنهان نشود.',
    '- تا زمان تکمیل این موارد، PR باید Draft بماند و «همه دکمه‌ها سالم‌اند» ادعا نشود.',
    '');
  return lines.join('\n');
}
module.exports={buildReport};
if(require.main===module){
  const [, ,input,output]=process.argv;
  if(!input||!output)throw Error('USAGE: node q01-native-action-gap-report.cjs audit.json report.md');
  const report=buildReport(JSON.parse(fs.readFileSync(input,'utf8')));
  fs.writeFileSync(output,report,{flag:'wx'});
  process.stdout.write(JSON.stringify({output:'native-ux-gaps.md',status:'generated',fullCoverage:false})+'\n');
}
