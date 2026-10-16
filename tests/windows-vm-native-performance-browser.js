(async () => {
  // A08 measured in the real installed Tauri/WebView2 IndexedDB with a fresh
  // disposable Windows profile. Synthetic *unposted* records only.
  const db = FINORA.Storage;
  const company = await FINORA.Company.current();
  const user = FINORA.Auth.current();
  if (!company?.id || !user?.id || !FINORA.Auth.isAdmin() ||
      !globalThis.__TAURI_INTERNALS__?.invoke) {
    throw Error('Native A08 benchmark needs an installed desktop administrator');
  }
  const productCount = 10000;
  const invoiceCount = 50000;
  const t = fn => performance.now();
  const duration = async work => {
    const start = performance.now();
    const value = await work();
    return { ms: Math.round((performance.now() - start) * 100) / 100, value };
  };
  const batchWrite = async (name, count, generator) => {
    const start = performance.now();
    for (let i = 0; i < count; i += 200) {
      const batch = Array.from({ length: Math.min(200, count - i) },
        (_, offset) => generator(i + offset));
      await db.transaction(name, async tx => {
        await Promise.all(batch.map(item => tx.putRaw(name, item)));
      });
    }
    return Math.round((performance.now() - start) * 100) / 100;
  };
  const productMs = await batchWrite('products', productCount, i => ({
    id: 'vm-a08-product-' + i, companyId: company.id, ownerUserId: user.id,
    name: 'VM synthetic item ' + i, code: 'VM-A08-' + i,
    sellPrice: 1000 + i, trackInventory: false
  }));
  const invoiceMs = await batchWrite('invoices', invoiceCount, i => ({
    id: 'vm-a08-invoice-' + i, companyId: company.id, ownerUserId: user.id,
    number: String(i + 1), date: '1405/07/18', kind: 'sale',
    isPreInvoice: true, financePosted: false,
    grandTotal: 100000 + i, paidAmount: 0, remaining: 100000 + i
  }));
  const actualProducts = await db.count('products');
  const actualInvoices = await db.count('invoices');
  if (actualProducts !== productCount || actualInvoices !== invoiceCount) {
    throw Error('Installed WebView2 seed count differs from requested A08 scale');
  }
  const samples = [];
  for (let i = 0; i < 10; i++) {
    const x = await duration(() => db.getByCompany('invoices', company.id));
    if (x.value.length !== invoiceCount) {
      throw Error('Installed WebView2 company invoice filter dropped records');
    }
    samples.push(x.ms);
  }
  samples.sort((a, b) => a - b);
  const exported = await duration(() => db.exportAll());
  const snap = exported.value;
  if (snap.version !== 7 || snap.data.products.length !== productCount ||
      snap.data.invoices.length !== invoiceCount ||
      snap.data.users.some(x => x.pwHash || x.pwSalt || x.pass)) {
    throw Error('A08 native performance snapshot is incomplete or has credentials');
  }
  const safe = x => Math.round(x * 100) / 100;
  return {
    environment: 'installed-Tauri-WebView2-IndexedDB',
    products: productCount, invoices: invoiceCount,
    companyInvoices: invoiceCount, companiesMeasured: 1,
    unpostedSyntheticFixture: true,
    timingsMs: {
      seedProducts: productMs, seedInvoices: invoiceMs,
      companyInvoiceReadP50: samples[4],
      companyInvoiceReadP95: samples[9],
      snapshotExport: exported.ms
    },
    measuredAt: new Date().toISOString(),
    // No user/customer names, passwords, data payload or signing secrets.
    note: 'Disposable native WebView2 sample; not a customer SLA, printer test or disk crash benchmark'
  };
})()