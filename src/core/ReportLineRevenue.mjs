// Reports must distinguish a missing legacy field from a legitimate zero-rial
// invoice row (e.g. a fully discounted line). Never treat zero as missing.
export function reportLineRevenue(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item))
    throw new TypeError('ردیف فاکتور برای گزارش نامعتبر است');
  if (item.lineTotal !== null && item.lineTotal !== undefined) {
    const net = Number(item.lineTotal);
    if (!Number.isSafeInteger(net) || net < 0)
      throw new Error('مبلغ خالص ردیف فاکتور برای گزارش نامعتبر است');
    return net;
  }
  // Older imported invoice lines may lack lineTotal entirely. Preserve the
  // existing gross-price fallback only for those legacy records.
  const qty = Number(item.qty ?? 0);
  const price = Number(item.price ?? 0);
  const gross = Math.round(qty * price);
  if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(price) ||
      price < 0 || !Number.isSafeInteger(gross))
    throw new Error('مبلغ ردیف قدیمی فاکتور برای گزارش نامعتبر است');
  return gross;
}
