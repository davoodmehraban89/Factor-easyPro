// Runs in an isolated Chrome profile; never point to a live user session.
process.env.CDP_PORT=process.env.CDP_PORT||'9252';
process.env.CDP_EXPR=`(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const assert=(yes,msg)=>{if(!yes)throw Error(msg)};
  assert(!document.getElementById('finoraAuthOverlay'),'test login missing');
  await FINORA.Router.go('accounting');await wait(200);
  const view=window.AccountingView;
  assert(view&&document.getElementById('pageContent')?.textContent.includes('حسابداری دوبل'),'accounting missing');
  await view.switchTab('periods');
  if(!view.periods.length){
    view.openPeriodModal();
    document.getElementById('acPeriodName').value='فاز دوم آزمایشی';
    document.getElementById('acPeriodStart').value='1405/01/01';
    document.getElementById('acPeriodEnd').value='1405/12/29';
    await view.savePeriod();
  }
  await view.switchTab('accounts');
  view.seedChart();
  document.querySelector('.modal-footer [data-action="confirm"]').click();
  await wait(200);
  assert(view.accounts.some(x=>x.code==='402'),'Phase2 chart missing');
  await view.switchTab('integration');
  assert(document.getElementById('accountingWorkbench')?.textContent.includes('فعال‌سازی'),'Activation UI missing');
  view.activateRetail();
  document.querySelector('.modal-footer [data-action="confirm"]').click();
  await wait(250);
  const status=document.getElementById('accountingWorkbench')?.textContent;
  assert(status.includes('یکپارچه فعال است'),'Activation failed: '+status.slice(0,180));
  view.openWarehouse();
  document.getElementById('acWhName').value='انبار آزمون';
  await view.saveWarehouse();
  assert((await view.renderIntegration()).includes('انبارگردانی جدید'),'Stocktake controls missing');
  return JSON.stringify({phase:'2',activation:true,warehouses:'ok',charts:view.accounts.length});
})()`;
require('./cdp-smoke.cjs');
