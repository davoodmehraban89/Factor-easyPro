/**
 * Pure monetary preview for a reference-linked sales return.
 *
 * No IndexedDB writes, cash transfers, journal postings, tax submissions,
 * permission decisions or fiscal-period mutations are performed here.
 *
 * All values are positive/zero integer rials. paidAmount is the cumulative
 * cash allocated to the original invoice, before any separate refund command.
 * priorReturns is the cumulative amount of already finalized sales returns.
 */
function rial(value, label, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new RangeError(`${label} باید ریال صحیح و غیرمنفی باشد`);
  }
  return value;
}

export function previewSaleReturnSettlement({
  invoiceTotal,
  paidAmount,
  priorReturns = 0,
  returnAmount
} = {}) {
  const gross = rial(invoiceTotal, 'مبلغ فاکتور', { positive: true });
  const paid = rial(paidAmount, 'دریافت تخصیص‌یافته');
  const alreadyReturned = rial(priorReturns, 'مرجوعی‌های پیشین');
  const requested = rial(returnAmount, 'مبلغ مرجوعی', { positive: true });

  if (paid > gross) {
    throw new RangeError('دریافت از مبلغ فاکتور بیشتر است؛ ابتدا مغایرت تسویه بررسی شود');
  }
  if (alreadyReturned > gross || requested > gross - alreadyReturned) {
    throw new RangeError('مجموع مرجوعی از مبلغ فاکتور مرجع بیشتر است');
  }

  const invoiceNetBefore = gross - alreadyReturned;
  const receivableBefore = Math.max(0, invoiceNetBefore - paid);
  const priorCustomerCredit = Math.max(0, paid - invoiceNetBefore);
  const allocatedToReceivable = Math.min(requested, receivableBefore);
  const newCustomerCredit = requested - allocatedToReceivable;
  const invoiceNetAfter = invoiceNetBefore - requested;
  const receivableAfter = Math.max(0, invoiceNetAfter - paid);
  const customerCreditAfter = priorCustomerCredit + newCustomerCredit;

  // No money moves: a separate authorized credit/refund command is mandatory.
  return Object.freeze({
    invoiceNetBefore,
    invoiceNetAfter,
    receivableBefore,
    receivableAfter,
    priorCustomerCredit,
    allocatedToReceivable,
    newCustomerCredit,
    customerCreditAfter,
    requiresCreditReview: customerCreditAfter > 0,
    autoRefundAllowed: false
  });
}
