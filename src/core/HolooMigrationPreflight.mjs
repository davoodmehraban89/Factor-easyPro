// A02: format-independent, zero-write profiler for user-authorized Holoo exports.
// This does NOT decode proprietary backup files or migrate/post financial records.
const TABLES = Object.freeze({
  contacts: { keys: ['sourceId'], required: ['sourceId', 'name'], money: ['receivable', 'payable'] },
  products: { keys: ['sourceId'], required: ['sourceId', 'name'], money: [] },
  invoices: { keys: ['sourceId'], required: ['sourceId', 'grandTotal', 'paidAmount'], money: ['grandTotal', 'paidAmount'] },
  invoiceLines: { keys: [], required: ['invoiceId', 'productId'], money: [] },
  cheques: { keys: ['sourceId'], required: ['sourceId', 'amount'], money: ['amount'] }
});
const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
const nonempty = value => (typeof value === 'string' && value.trim().length > 0) ||
  (Number.isSafeInteger(value) && value >= 0);
const identity = value => nonempty(value) ? String(value).trim() : null;
const money = value => typeof value === 'number' &&
  Number.isSafeInteger(value) && value >= 0;
// Numeric parsing, currency scaling, identifier normalization and enum mapping
// belong to an explicit versioned source adapter, NOT this generic validator.

export function previewHolooExtract(input = {}, { maxIssues = 100 } = {}) {
  if (!Number.isSafeInteger(maxIssues) || maxIssues < 1 || maxIssues > 1000) {
    throw new RangeError('حداکثر مغایرت‌ها باید بین ۱ تا ۱۰۰۰ باشد');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      input.sourceSystem !== 'holoo') {
    throw new TypeError('فرمت منبع باید صراحتاً Holoo و توسط مالک تأیید شده باشد');
  }
  const datasets = input.datasets || {};
  const mappings = input.columns || {};
  if (!datasets || typeof datasets !== 'object' || Array.isArray(datasets) ||
      !mappings || typeof mappings !== 'object' || Array.isArray(mappings)) {
    throw new TypeError('ساختار جدول‌ها یا نگاشت ستون‌ها نامعتبر است');
  }

  const issues = [], counts = {};
  let issueCount = 0;
  const add = (code, table, rowIndex = null) => {
    issueCount++;
    if (issues.length < maxIssues) {
      // No names, account/cheque numbers, raw IDs, source values or PII.
      issues.push(Object.freeze({ code, table, rowIndex }));
    }
  };
  const field = (table, record, canonical) => {
    const key = mappings[table]?.[canonical];
    return typeof key === 'string' && key.length && own(record, key)
      ? record[key] : undefined;
  };
  const sets = {};
  let rowTotal = 0;
  for (const table of Object.keys(TABLES)) {
    const rows = datasets[table] ?? [];
    if (!Array.isArray(rows)) throw new TypeError('جدول ورودی باید آرایه باشد: ' + table);
    if (rows.length > 100000) throw new RangeError('اندازه جدول برای پیش‌بررسی محدود است: ' + table);
    sets[table] = new Set();
    counts[table] = rows.length;
    rowTotal += rows.length;
    if (!rows.length) continue;
    const rules = TABLES[table];
    const columns = mappings[table];
    if (!columns || typeof columns !== 'object' || Array.isArray(columns)) {
      add('MAPPING_REQUIRED', table);
      continue;
    }
    const requiredFields = [...new Set([...rules.required, ...rules.money])];
    const missing = requiredFields.filter(c => typeof columns[c] !== 'string' || !columns[c]);
    for (const ignored of missing) add('MAPPING_FIELD_REQUIRED', table);
    if (missing.length) continue;
    const ids = new Set();
    rows.forEach((record, i) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        add('INVALID_ROW', table, i);
        return;
      }
      for (const key of rules.required) {
        const value=field(table,record,key);
        // Names are human labels, not numeric identifiers: a numeric
        // value must not masquerade as a valid source master-data name.
        const valid=key==='name'
          ? typeof value==='string' && value.trim().length>0
          : nonempty(value);
        if (!valid) add('REQUIRED_FIELD_EMPTY', table, i);
      }
      for (const key of rules.money) {
        if (!money(field(table, record, key))) add('AMOUNT_NOT_INTEGER_RIAL', table, i);
      }
      if (table === 'cheques' &&
          money(field(table, record, 'amount')) &&
          field(table, record, 'amount') === 0) {
        add('ZERO_VALUE_CHEQUE', table, i);
      }
      if (table === 'invoices' &&
          money(field(table, record, 'paidAmount')) &&
          money(field(table, record, 'grandTotal')) &&
          field(table, record, 'paidAmount') > field(table, record, 'grandTotal')) {
        add('PAID_EXCEEDS_GROSS', table, i);
      }
      for (const key of rules.keys) {
        const id = identity(field(table, record, key));
        if (!id) continue;
        if (ids.has(id)) add('DUPLICATE_SOURCE_ID', table, i);
        else ids.add(id);
      }
    });
    sets[table] = ids;
  }
  if (rowTotal === 0) add('SOURCE_HAS_NO_MAPPED_ROWS', 'source');
  // A source invoice without its line-item extract is not a complete
  // accounting migration source, even if the invoice header totals look
  // plausible. Report this safely without inspecting personal data.
  if (counts.invoices > 0 && counts.invoiceLines === 0) {
    add('INVOICE_LINES_REQUIRED', 'invoiceLines');
  } else if (counts.invoices > 0 && counts.invoiceLines > 0 &&
      typeof mappings.invoices?.sourceId === 'string' &&
      typeof mappings.invoiceLines?.invoiceId === 'string') {
    // A nonempty line-item export can still omit whole invoices. Report
    // uncovered header row indexes, not source IDs, names or invoice values.
    // Invalid/unknown source references are checked separately below.
    const linked = new Set(datasets.invoiceLines
      .filter(row=>row && typeof row === 'object' && !Array.isArray(row))
      .map(row=>identity(field('invoiceLines',row,'invoiceId')))
      .filter(Boolean));
    datasets.invoices.forEach((row,i)=>{
      if (!row || typeof row !== 'object' || Array.isArray(row)) return;
      const invoiceId=identity(field('invoices',row,'sourceId'));
      if (invoiceId && !linked.has(invoiceId)) {
        add('INVOICE_WITHOUT_LINES','invoices',i);
      }
    });
  }

  // Referential checks run only when both involved key maps are present.
  // Missing datasets do not prove missing source objects; this is not a
  // completeness certificate.
  const references = [
    { table: 'invoices', key: 'contactId', parent: 'contacts' },
    { table: 'invoiceLines', key: 'invoiceId', parent: 'invoices' },
    { table: 'invoiceLines', key: 'productId', parent: 'products' },
    { table: 'cheques', key: 'contactId', parent: 'contacts' }
  ];
  for (const { table, key, parent } of references) {
    const rows = datasets[table] || [];
    const mapped = mappings[table]?.[key];
    if (!rows.length || !mapped) continue;
    // A missing parent table cannot silently be treated as a clean migration.
    // Real migrations require all referenced master-data exports to be present.
    if (!counts[parent] || !mappings[parent]?.sourceId) {
      if (rows.some(record => record && typeof record === 'object' &&
          identity(field(table, record, key)))) {
        add('REFERENCE_PARENT_DATASET_REQUIRED', table);
      }
      continue;
    }
    rows.forEach((record, i) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return;
      const id = identity(field(table, record, key));
      if (id && !sets[parent].has(id)) add('REFERENCE_NOT_FOUND', table, i);
    });
  }

  const details = Object.freeze({ ...counts });
  return Object.freeze({
    sourceSystem: 'holoo',
    inputType: 'explicitly-mapped-tabular-extract',
    status: issueCount ? 'blocked' : 'requires-source-and-accountant-review',
    counts: details, inspectedRows: rowTotal, issueCount,
    truncated: issueCount > issues.length, issues: Object.freeze(issues),
    writePerformed: false, importPerformed: false, canCommit: false
  });
}
