import 'fake-indexeddb/auto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { StorageService } from '../src/core/StorageService.js';

// Synthetic, deterministic and devoid of real customer data.
export const COUNTS = Object.freeze({ products: 10_000, invoices: 50_000, companies: 5 });
export function syntheticRecord(store, i) {
  const companyId = 'benchmark-c' + (i % COUNTS.companies);
  if (store === 'products') return {
    id: 'bench-p-' + i, companyId, ownerUserId: 'bench-admin',
    name: 'Synthetic product ' + i, code: 'SKU-' + i, sellPrice: 1000 + i
  };
  if (store === 'invoices') return {
    id: 'bench-i-' + i, companyId, ownerUserId: 'bench-admin',
    date: '1405/07/18', kind: 'sale', number: String(i + 1),
    grandTotal: 100000 + i, paidAmount: 0, remaining: 100000 + i,
    isPreInvoice: false
  };
  throw new Error('Unsupported synthetic store');
}
const rounded = n => Math.round(n * 100) / 100;
const elapsed = async fn => {
  const start = performance.now();
  const result = await fn();
  return { ms: rounded(performance.now() - start), result };
};
const percentile = (values, q) => {
  const valuesSorted = [...values].sort((a, b) => a - b);
  return rounded(valuesSorted[Math.min(valuesSorted.length - 1, Math.ceil(q * valuesSorted.length) - 1)]);
};
async function seed(store, count, batchSize = 250) {
  const start = performance.now();
  for (let base = 0; base < count; base += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, count - base) },
      (_, index) => syntheticRecord(store, base + index));
    await StorageService.transaction(store, async tx => {
      await Promise.all(batch.map(row => tx.putRaw(store, row)));
    });
  }
  return rounded(performance.now() - start);
}
export async function benchmarkA08() {
  await StorageService.init();
  const seedProductsMs = await seed('products', COUNTS.products);
  const seedInvoicesMs = await seed('invoices', COUNTS.invoices);

  const checks = await Promise.all([
    StorageService.count('products'), StorageService.count('invoices')
  ]);
  if (checks[0] !== COUNTS.products || checks[1] !== COUNTS.invoices) {
    throw Error('Synthetic record counts do not match the target');
  }

  const queryTimes = [];
  let scopedCount = null;
  for (let i = 0; i < 10; i++) {
    const measured = await elapsed(() => StorageService.getByCompany('invoices', 'benchmark-c0'));
    queryTimes.push(measured.ms);
    scopedCount = measured.result.length;
    if (scopedCount !== 10_000) throw Error('Unexpected company filtering result');
  }
  const snapshot = await elapsed(() => StorageService.exportAll());
  const snapshotCounts = {
    products: snapshot.result.data.products.length,
    invoices: snapshot.result.data.invoices.length
  };
  if (snapshotCounts.products !== 10_000 || snapshotCounts.invoices !== 50_000) {
    throw Error('Backup snapshot counts do not match seed totals');
  }
  // No fixed millisecond budget until an actual machine baseline exists.
  const report = {
    benchmark: 'A08-synthetic-10000-products-50000-invoices-v1',
    timestamp: new Date().toISOString(),
    node: process.version,
    counts: { ...COUNTS, scopedInvoices: scopedCount },
    timingsMs: {
      seedProducts: seedProductsMs, seedInvoices: seedInvoicesMs,
      companyInvoiceRead: { p50: percentile(queryTimes, .5), p95: percentile(queryTimes, .95) },
      fullBackupExport: snapshot.ms
    },
    memoryMiB: {
      rss: rounded(process.memoryUsage().rss / 1024 / 1024),
      heapUsed: rounded(process.memoryUsage().heapUsed / 1024 / 1024)
    },
    note: 'Synthetic fake-indexeddb baseline; not a Windows disk crash or customer performance measurement.'
  };
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  benchmarkA08().then(report => {
    writeFileSync('a08-benchmark-results.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
