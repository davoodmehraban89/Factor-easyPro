// Keep reports bounded in the DOM without dropping any financial totals.
export const REPORT_PAGE_SIZE = 100;

export function paginateReportRows(rows, requestedPage = 0, pageSize = REPORT_PAGE_SIZE) {
  if (!Array.isArray(rows)) throw new TypeError('Report rows must be an array');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 500)
    throw new RangeError('Report page size must be between 1 and 500');
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(pageCount - 1, Math.max(0, requestedPage))
    : 0;
  const start = page * pageSize;
  const end = Math.min(total, start + pageSize);
  return {
    rows: rows.slice(start, end),
    page, pageCount, total, start, end,
    hasPrevious: page > 0,
    hasNext: page + 1 < pageCount
  };
}
