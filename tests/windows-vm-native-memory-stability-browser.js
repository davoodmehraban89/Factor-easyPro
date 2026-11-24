'use strict';
// This script is evaluated by CDP inside the installed Tauri/WebView2 renderer.
// It does not seed data; the standard A08 benchmark must run first.
(async () => {
  const db = FINORA.Storage;
  const company = await FINORA.Company.current();
  if (!company?.id || !globalThis.__TAURI_INTERNALS__?.invoke)
    throw Error('Installed native administrator required');
  const products = await db.count('products');
  const invoices = await db.count('invoices');
  if (products !== 10000 || invoices !== 50000)
    throw Error('Stability test requires exact synthetic A08 dataset');
  const rounds = [];
  for (let i = 0; i < 1; i++) {
    const start = performance.now();
    const rows = await db.getByCompany('invoices', company.id);
    if (rows.length !== 50000) throw Error('Company invoice count changed during stability cycle');
    await FINORA.Router.go('reports');
    window.ReportsView._switchTab('products');
    for (const page of [1, 50, 100]) {
      window.ReportsView._setProductsPage(page);
      const region = document.getElementById('reports-content');
      if (region?.querySelectorAll('tbody tr').length !== 100)
        throw Error('Stability pagination failed at page ' + page);
    }
    rounds.push({cycle: i + 1, durationMs: Math.round((performance.now()-start)*10)/10});
    if (await db.count('products') !== 10000 || await db.count('invoices') !== 50000)
      throw Error('Synthetic record counts changed during stability cycle');
  }
  return {rounds, products, invoices, companyInvoices: 50000, synthetic: true};
})()
