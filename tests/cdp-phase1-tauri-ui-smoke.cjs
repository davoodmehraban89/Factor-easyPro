// UI smoke on a disposable browser profile, after a user has initialized test login.
// Run with a local Vite preview server and Chrome CDP on port 9242.
process.env.CDP_PORT = '9242';
process.env.CDP_EXPR = `(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (yes, reason) => { if (!yes) throw new Error(reason); };
  const results = {};
  assert(!document.getElementById('finoraAuthOverlay'), 'Test login is required');
  await window.FINORA.Router.go('dashboard');
  await wait(300);
  await window.FINORA.Router.go('accounting');
  for (let i = 0; i < 30 && !document.getElementById('pageContent')?.textContent.includes('Ø­Ø³Ø§Ø¨Ø¯Ø§Ø±ÛŒ Ø¯ÙˆØ¨Ù„'); i++) await wait(100);
  assert(window.AccountingView, 'Accounting view not mounted');
  assert(document.getElementById('pageContent')?.textContent.includes('Ø­Ø³Ø§Ø¨Ø¯Ø§Ø±ÛŒ Ø¯ÙˆØ¨Ù„'), 'Accounting route failed');
  await window.AccountingView.switchTab('periods');
  if (!window.AccountingView.periods.length) {
    window.AccountingView.openPeriodModal();
    assert(document.getElementById('acPeriodName'), 'Fiscal-period modal is missing');
    document.getElementById('acPeriodName').value = 'Ø¯ÙˆØ±Ù‡ ØªØ³Øª Û±Û´Û°Ûµ';
    document.getElementById('acPeriodStart').value = '1405/01/01';
    document.getElementById('acPeriodEnd').value = '1405/12/29';
    await window.AccountingView.savePeriod();
  }
  assert(window.AccountingView.periods.length > 0, 'Fiscal period not persisted');
  results.period = 'ok';
  await window.AccountingView.switchTab('accounts');
  window.AccountingView.seedChart();
  document.querySelector('.modal-footer [data-action="confirm"]').click();
  await wait(250);
  assert(window.AccountingView.accounts.some(a => a.code === '101'), 'Chart seed failed');
  results.chart = window.AccountingView.accounts.length;
  await window.AccountingView.switchTab('journals');
  await window.AccountingView.openJournalModal();
  assert(document.getElementById('acJournalLines'), 'Manual journal form did not open');
  const cash = window.AccountingView.accounts.find(a => a.code === '101');
  const sales = window.AccountingView.accounts.find(a => a.code === '401');
  const selects = document.querySelectorAll('.ac-line-account');
  const debit = document.querySelectorAll('.ac-line-debit');
  const credit = document.querySelectorAll('.ac-line-credit');
  assert(selects.length === 2, 'Expected two journal lines');
  selects[0].value = cash.id;
  selects[1].value = sales.id;
  debit[0].value = '12,000';
  credit[0].value = '0';
  debit[1].value = '0';
  credit[1].value = '12,000';
  document.getElementById('acJournalDate').value = '1405/07/18';
  document.getElementById('acJournalDescription').value = 'Ø³Ù†Ø¯ ØªØ³Øª Ù…Ø±ÙˆØ±Ú¯Ø±';
  await window.AccountingView.saveJournal('posted');
  assert(window.AccountingView.journals.length > 0, 'Journal did not persist');
  results.journal = window.AccountingView.journals[0].status;
  await window.AccountingView.switchTab('trial');
  assert(document.getElementById('accountingWorkbench').textContent.includes('Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ù†Ù‚Ø¯ Ùˆ Ø¨Ø§Ù†Ú©') && document.getElementById('accountingWorkbench').textContent.includes('ÙØ±ÙˆØ´ Ú©Ø§Ù„Ø§'), 'Trial balance missing accounts');
  results.trial = 'ok';
  const problems = [...document.querySelectorAll('.toast-error')].map(x => x.textContent);
  assert(problems.length === 0, 'Unexpected UI error: ' + problems.join('; '));
  return JSON.stringify(results);
})()`;
require('./cdp-smoke.cjs');
