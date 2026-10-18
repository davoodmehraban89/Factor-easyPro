// A02: read-only, explicit CSV/TSV source adapter for *already exported*
// Holoo tables. This DOES NOT decode Holoo proprietary binary backups.
// No file-system, IndexedDB, ledger or network access.
import { previewHolooExtract } from './HolooMigrationPreflight.mjs';

const COLUMNS = Object.freeze({
  contacts: ['receivable', 'payable'],
  products: [],
  invoices: ['grandTotal', 'paidAmount'],
  invoiceLines: [],
  cheques: ['amount']
});
const MAX_TEXT_LENGTH = 12 * 1024 * 1024;
const MAX_DATA_ROWS = 100000;
const MAX_FIELDS = 200;
const MAX_CELL_LENGTH = 256 * 1024;
const SEPARATORS = new Set([',', ';', '\t']);

const reject = code => { throw new Error(code); };
const validMap = value => value && typeof value === 'object' &&
  !Array.isArray(value);
const parseMoney = (value, unit) => {
  // Never infer rial vs toman or decimal separators; source version must
  // explicitly provide a mapping and integer currency-unit policy.
  const valueText = typeof value === 'string' ? value.trim() : '';
  if (!/^[0-9]+$/.test(valueText)) return NaN;
  const integer = Number(valueText);
  const multiplier = unit === 'toman' ? 10 : 1;
  return Number.isSafeInteger(integer) &&
    Number.isSafeInteger(integer * multiplier)
    ? integer * multiplier : NaN;
};

export function parseStrictDelimitedRows(text, { delimiter = ',' } = {}) {
  if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH)
    throw new RangeError('CSV_INVALID_SIZE');
  if (!SEPARATORS.has(delimiter)) reject('CSV_UNSUPPORTED_DELIMITER');
  if (!text.length) reject('CSV_EMPTY_SOURCE');
  const rows = [];
  let record = [], cell = '', quoted = false, afterQuote = false, begun = false;
  // Include the final sentinel newline to flush a possibly unterminated row.
  // Quoted multiline fields are preserved verbatim; raw data is never logged.
  const submitCell = () => {
    if (cell.length > MAX_CELL_LENGTH) reject('CSV_CELL_TOO_LARGE');
    record.push(cell); cell = ''; afterQuote = false; begun = false;
    if (record.length > MAX_FIELDS) reject('CSV_TOO_MANY_COLUMNS');
  };
  const submitRecord = () => {
    submitCell();
    // Silently skipping empty records would undercount source rows and hide
    // gaps in a migration extract. Only the terminal newline is implicit.
    if (record.length === 1 && record[0].trim() === '')
      reject('CSV_EMPTY_RECORD');
    rows.push(record);
    if (rows.length > MAX_DATA_ROWS + 1) reject('CSV_TOO_MANY_ROWS');
    record = [];
  };
  const input = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else cell += c;
    } else if (afterQuote) {
      if (c === delimiter) submitCell();
      else if (c === '\r' || c === '\n') {
        submitRecord();
        if (c === '\r' && input[i + 1] === '\n') i++;
      } else reject('CSV_CHARACTERS_AFTER_QUOTE');
    } else if (c === delimiter) {
      submitCell();
    } else if (c === '\r' || c === '\n') {
      submitRecord();
      if (c === '\r' && input[i + 1] === '\n') i++;
    } else if (c === '"') {
      if (begun || cell.length) reject('CSV_UNEXPECTED_QUOTE');
      quoted = true; begun = true;
    } else {
      cell += c; begun = true;
    }
    if (cell.length > MAX_CELL_LENGTH) reject('CSV_CELL_TOO_LARGE');
  }
  if (quoted) reject('CSV_UNTERMINATED_QUOTE');
  if (record.length || cell || afterQuote || begun) submitRecord();
  if (!rows.length) reject('CSV_NO_HEADER');
  const headers = rows.shift().map(x => x.trim());
  if (!headers.length || headers.some(x => !x) ||
      new Set(headers).size !== headers.length) reject('CSV_INVALID_HEADER');
  if (rows.some(row => row.length !== headers.length))
    reject('CSV_ROW_WIDTH_MISMATCH');
  // Null prototype prevents special header names (__proto__, constructor)
  // from modifying object prototypes in any downstream processing.
  const data = rows.map(row => Object.fromEntries(
    headers.map((header, j) => [header, row[j]])));
  return { headers, rows: data };
}

/**
 * Source-report control totals are *claims provided by the operator*,
 * NEVER external accountant signoff. This function cannot read Holoo data
 * directly and must never leak individual rows or financial amounts.
 *
 * All claims are denominated in RIAL after explicit source-unit conversion.
 * Supported claims: { [table]: { count, ...sumFields } }.
 */
const SUM_FIELDS = Object.freeze({
  contacts: ['receivable', 'payable'],
  products: [],
  invoices: ['grandTotal', 'paidAmount'],
  invoiceLines: [],
  cheques: ['amount']
});
function compareDeclaredControlTotals(datasets, mappings, declared, maxIssues) {
  if (declared === null || declared === undefined) {
    return { checks: 0, issueCount: 0, issues: [] };
  }
  if (!validMap(declared)) reject('CONTROL_TOTALS_INVALID');
  if (!Object.keys(declared).length) reject('CONTROL_TOTALS_SCHEMA_INVALID');
  let checks = 0, issueCount = 0;
  const issues = [];
  const add = (code, table) => {
    issueCount++;
    if (issues.length < maxIssues) issues.push(Object.freeze({ code, table, rowIndex: null }));
  };
  for (const [table, values] of Object.entries(declared)) {
    if (!Object.hasOwn(SUM_FIELDS, table) || !validMap(values) ||
        !Object.keys(values).length ||
        Object.keys(values).some(key => key !== 'count' && !SUM_FIELDS[table].includes(key))) {
      reject('CONTROL_TOTALS_SCHEMA_INVALID');
    }
    const rows = datasets[table];
    if (!rows) {
      add('CONTROL_SOURCE_DATASET_MISSING', table);
      continue;
    }
    for (const [key, expected] of Object.entries(values)) {
      if (!Number.isSafeInteger(expected) || expected < 0) reject('CONTROL_TOTAL_NOT_SAFE_RIAL');
      checks++;
      if (key === 'count') {
        if (rows.length !== expected) add('CONTROL_COUNT_MISMATCH', table);
        continue;
      }
      const sourceColumn = mappings[table]?.[key];
      if (typeof sourceColumn !== 'string' || !sourceColumn) {
        add('CONTROL_SOURCE_MAPPING_MISSING', table);
        continue;
      }
      let sum = 0n, invalid = false;
      for (const row of rows) {
        const value = row[sourceColumn];
        if (!Number.isSafeInteger(value) || value < 0) {
          invalid = true;
          break;
        }
        sum += BigInt(value);
      }
      if (invalid) add('CONTROL_SOURCE_AMOUNT_INVALID', table);
      else if (sum > BigInt(Number.MAX_SAFE_INTEGER)) add('CONTROL_SOURCE_SUM_OVERFLOW', table);
      else if (sum !== BigInt(expected)) add('CONTROL_AMOUNT_MISMATCH', table);
    }
  }
  return { checks, issueCount, issues };
}

export function previewHolooDelimitedExport({
  sourceSystem, moneyUnit, tables, mappings, declaredControlTotals = null
} = {}, { maxIssues = 100 } = {}) {
  if (sourceSystem !== 'holoo') reject('SOURCE_SYSTEM_NOT_HOLOO');
  if (!['rial', 'toman'].includes(moneyUnit)) reject('MONEY_UNIT_REQUIRED');
  if (!validMap(tables) || !validMap(mappings)) reject('SOURCE_MAPPING_REQUIRED');
  if (Object.keys(tables).some(name => !Object.hasOwn(COLUMNS, name)) ||
      Object.keys(mappings).some(name => !Object.hasOwn(COLUMNS, name))) {
    reject('SOURCE_UNSUPPORTED_TABLE');
  }
  const datasets = {};
  for (const [table, item] of Object.entries(tables)) {
    if (!validMap(item) || typeof item.text !== 'string' ||
        !validMap(mappings[table])) reject('CSV_TABLE_CONFIGURATION_REQUIRED');
    const parsed = parseStrictDelimitedRows(item.text, { delimiter: item.delimiter });
    const mapped = mappings[table];
    const allowedFields = new Set(['sourceId', 'name', 'contactId', 'invoiceId', 'productId', ...COLUMNS[table]]);
    if (Object.keys(mapped).some(field => !allowedFields.has(field)))
      reject('CSV_UNSUPPORTED_CANONICAL_FIELD');
    const mappedColumns = Object.values(mapped);
    // Mapping two canonical fields to one source column is ambiguous for
    // financial reconciliation, even when the source headers are unique.
    if (new Set(mappedColumns).size !== mappedColumns.length)
      reject('CSV_DUPLICATE_SOURCE_COLUMN_MAPPING');
    for (const column of mappedColumns) {
      if (typeof column !== 'string' || !parsed.headers.includes(column))
        reject('CSV_MAPPED_COLUMN_ABSENT');
    }
    for (const row of parsed.rows) {
      for (const field of COLUMNS[table]) {
        const name = mapped[field];
        if (name && Object.hasOwn(row, name)) {
          row[name] = parseMoney(row[name], moneyUnit);
        }
      }
    }
    datasets[table] = parsed.rows;
  }
  // The original strings are not mutated and never returned. Any result
  // contains only bounded diagnostic codes, row positions and counts.
  const report = previewHolooExtract({
    sourceSystem: 'holoo', datasets, columns: mappings
  }, { maxIssues });
  const controls = compareDeclaredControlTotals(
    datasets, mappings, declaredControlTotals, maxIssues
  );
  const totalIssues = report.issueCount + controls.issueCount;
  const mergedIssues = Object.freeze([
    ...report.issues,
    ...controls.issues.slice(0, Math.max(0, maxIssues - report.issues.length))
  ]);
  return Object.freeze({
    ...report,
    status: totalIssues ? 'blocked' : 'requires-source-and-accountant-review',
    issueCount: totalIssues,
    truncated: totalIssues > mergedIssues.length,
    issues: mergedIssues,
    declaredControlChecks: controls.checks,
    sourceControlClaimsPresent: declaredControlTotals !== null &&
      declaredControlTotals !== undefined,
    independentlyVerified: false,
    inputType: 'explicit-mapped-delimited-export',
    sourceCurrencyUnit: moneyUnit,
    // This parser is not an authenticity check for Holoo CSV exports.
    sourceVersionVerified: false,
    writePerformed: false,
    importPerformed: false,
    canCommit: false
  });
}
