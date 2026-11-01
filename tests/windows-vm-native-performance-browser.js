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
    buyPrice: 500 + (i % 500), sellPrice: 1000 + (i % 1000), trackInventory: false
  }));
  await db.put('contacts', {
    id: 'vm-a08-contact', companyId: company.id, ownerUserId: user.id,
    name: 'VM synthetic benchmark customer'
  });
  const invoiceMs = await batchWrite('invoices', invoiceCount, i => {
    const productIndex = i % productCount;
    const price = 1000 + (productIndex % 1000);
    const productId = 'vm-a08-product-' + productIndex;
    return {
      id: 'vm-a08-invoice-' + i, companyId: company.id, ownerUserId: user.id,
      number: String(i + 1), date: '1405/07/18', kind: 'sale',
      contactId: 'vm-a08-contact', contactName: 'VM synthetic benchmark customer',
      isPreInvoice: false, financePosted: false,
      subtotal: price, totalDiscount: 0, vatAmount: 0,
      grandTotal: price, paidAmount: 0, remaining: price,
      items: [{ productId, productName: 'VM synthetic item ' + productIndex,
        qty: 1, price, lineSubtotal: price, discount: 0, lineTotal: price }]
    };
  });
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
  // Exercise the actual installed reports route with the same 50k invoice
  // population. The report fixture remains unposted and synthetic.
  const reportStart = performance.now();
  await FINORA.Router.go('reports');
  const reportsReloadMs = Math.round((performance.now() - reportStart) * 100) / 100;
  const reportTabs = {};
  for (const tab of ['pl','sales','products','customers']) {
    const start = performance.now();
    window.ReportsView._switchTab(tab);
    const region = document.getElementById('reports-content');
    const rendered = region?.textContent?.trim() || '';
    const htmlLength = region?.innerHTML?.length || 0;
    if (rendered.length < 40 || htmlLength < 200)
      throw Error('Installed report tab rendered no usable result: ' + tab);
    let paginationVerified = null;
    if (tab === 'products') {
      // A08: a 10k-product report must never create a 10k-row DOM table.
      const currentRows = region.querySelectorAll('tbody tr');
      if (currentRows.length !== 100)
        throw Error('A08 product report did not limit its visible rows to 100');
      const firstProduct = currentRows[0].querySelector('td:nth-child(2)')?.textContent;
      const initialTotals = [...region.querySelectorAll('.grid-kpi .kpi-card')]
        .map(card => card.textContent.trim()).join('|');
      window.ReportsView._setReportPage('products', 1);
      const secondRows = region.querySelectorAll('tbody tr');
      const secondProduct = secondRows[0]?.querySelector('td:nth-child(2)')?.textContent;
      if (secondRows.length !== 100 || secondProduct === firstProduct ||
          !region.querySelector('nav[aria-label="صفحه‌بندی کالاها"]'))
        throw Error('A08 next-page product selection is empty or repeats the previous page');
      window.ReportsView._setReportPage('products', 999999);
      const lastRows = region.querySelectorAll('tbody tr');
      if (lastRows.length !== 100)
        throw Error('A08 last product report page contains an unexpected row count');
      window.ReportsView._setReportPage('products', 0);
      const restoredRows = region.querySelectorAll('tbody tr');
      const restoredTotals = [...region.querySelectorAll('.grid-kpi .kpi-card')]
        .map(card => card.textContent.trim()).join('|');
      if (restoredRows.length !== 100 ||
          restoredRows[0].querySelector('td:nth-child(2)')?.textContent !== firstProduct ||
          restoredTotals !== initialTotals)
        throw Error('A08 paging changed financial totals or failed to restore first report page');
      paginationVerified = {
        displayedRows: 100, totalRows: productCount,
        changedOnNextPage: true, lastPageBounded: true,
        firstPageRestored: true, financialTotalsUnchanged: true
      };
    }
    reportTabs[tab] = {
      renderMs: Math.round((performance.now() - start) * 100) / 100,
      textCharacters: rendered.length,
      htmlCharacters: htmlLength,
      tableRows: region.querySelectorAll('tbody tr').length,
      paginationVerified
    };
  }
  const exported = await duration(() => db.exportAll());
  const snap = exported.value;
  if (snap.version !== 7 || snap.data.products.length !== productCount ||
      snap.data.invoices.length !== invoiceCount ||
      snap.data.users.some(x => x.pwHash || x.pwSalt || x.pass)) {
    throw Error('A08 native performance snapshot is incomplete or has credentials');
  }
  // Measure a real encrypted .fbackup download through SettingsView using
  // only the disposable synthetic company. Decrypt the captured blob in-memory
  // to verify scale and schema without writing a file or exposing its contents.
  const original = {
    prompt: window.prompt, create: URL.createObjectURL, revoke: URL.revokeObjectURL,
    anchorClick: HTMLAnchorElement.prototype.click
  };
  let backupBlob = null, backupFilename = '';
  const passphrase = 'VM-ONLY-A08-ENCRYPTED-BACKUP-PASSPHRASE';
  let encryptedBackupMs = 0;
  let backupSummary;
  try {
    window.prompt = () => passphrase;
    URL.createObjectURL = blob => { backupBlob = blob; return 'blob:vm-a08-encrypted-backup'; };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () { backupFilename = this.download; };
    await FINORA.Router.go('settings');
    const backupStart = performance.now();
    await window.SettingsView.downloadBackup();
    encryptedBackupMs = Math.round((performance.now() - backupStart) * 100) / 100;
    if (!(backupBlob instanceof Blob) || !backupFilename.endsWith('.fbackup'))
      throw Error('Installed SettingsView did not create a real encrypted .fbackup blob');
    const envelope = JSON.parse(await backupBlob.text());
    if (envelope.format !== 'finora-encrypted-backup-v1' ||
        !envelope.salt || !envelope.iv || !envelope.ciphertext)
      throw Error('Installed SettingsView returned an invalid encrypted backup envelope');
    const fromB64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase),
      'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(envelope.salt),
      iterations: 600000, hash: 'SHA-256' }, material,
      { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(envelope.iv) },
      key, fromB64(envelope.ciphertext));
    const backup = JSON.parse(new TextDecoder().decode(clear));
    if (backup.schemaVersion !== 7 || backup.scope !== 'company' ||
        backup.data.products.length !== productCount ||
        backup.data.invoices.length !== invoiceCount ||
        (backup.data.users || []).length !== 0)
      throw Error('Large encrypted backup failed schema, company-scope or record-count verification');
    backupSummary = {
      durationMs: encryptedBackupMs, bytes: backupBlob.size,
      filenameSuffix: '.fbackup', schemaVersion: backup.schemaVersion,
      products: backup.data.products.length, invoices: backup.data.invoices.length,
      companyScoped: true, credentialsExcluded: true
    };
  } finally {
    window.prompt = original.prompt;
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    HTMLAnchorElement.prototype.click = original.anchorClick;
  }
  return {
    environment: 'installed-Tauri-WebView2-IndexedDB',
    products: productCount, invoices: invoiceCount,
    companyInvoices: invoiceCount, companiesMeasured: 1,
    unpostedSyntheticFixture: true,
    timingsMs: {
      seedProducts: productMs, seedInvoices: invoiceMs,
      companyInvoiceReadP50: samples[4],
      companyInvoiceReadP95: samples[9],
      snapshotExport: exported.ms,
      reportsReload: reportsReloadMs,
      encryptedBackup: encryptedBackupMs
    },
    reportTabs,
    encryptedBackup: backupSummary,
    measuredAt: new Date().toISOString(),
    // No user/customer names, passwords, data payload or signing secrets.
    note: 'Disposable native WebView2 sample; not a customer SLA, printer test or disk crash benchmark'
  };
})()