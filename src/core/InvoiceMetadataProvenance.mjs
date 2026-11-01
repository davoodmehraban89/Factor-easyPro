// Read-only A01 historical invoice metadata provenance audit.
// Never infer a tax rate or the user's original discount input from totals.
// The result contains issue codes and line positions only; no customer data.
import { amount, lineGrossRials, percentOfRials } from './RetailFinanceCore.mjs';

const present = value => value !== undefined && value !== null && value !== '';
const safeMoney = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function auditStoredInvoiceProvenance(invoice) {
  if (!invoice || typeof invoice !== 'object' || Array.isArray(invoice))
    throw new TypeError('فاکتور برای بررسی منشأ ارقام نامعتبر است');

  const issues = [];
  const add = (code, lineIndex) => {
    const issue = { code };
    if (lineIndex !== undefined) issue.lineIndex = lineIndex;
    issues.push(issue);
  };

  const totalDiscount = invoice.totalDiscount;
  const subtotal = invoice.subtotal;
  const vat = invoice.vatAmount;
  if (!safeMoney(vat)) {
    add('VAT_AMOUNT_INVALID');
  } else {
    if (invoice.kind === 'non_formal' && vat > 0) {
      add('NON_FORMAL_VAT_CONFLICT');
    } else if (invoice.vatEnabled === false && vat > 0) {
      add('VAT_EXEMPT_CONFLICT');
    } else if (invoice.vatEnabled !== true && invoice.vatEnabled !== false && vat > 0) {
      add('VAT_TREATMENT_UNKNOWN');
    }
    if (invoice.vatEnabled === true && invoice.kind !== 'non_formal') {
      if (!present(invoice.vatRate)) {
        add('VAT_RATE_MISSING');
      } else if (!safeMoney(subtotal) || !safeMoney(totalDiscount) ||
                 totalDiscount > subtotal) {
        add('VAT_BASE_UNVERIFIABLE');
      } else {
        try {
          const expected = percentOfRials(subtotal - totalDiscount, invoice.vatRate, 'درصد مالیات');
          if (expected !== vat) add('VAT_AMOUNT_MISMATCH');
        } catch {
          add('VAT_RATE_INVALID');
        }
      }
    }
  }

  if (!safeMoney(totalDiscount)) {
    add('GLOBAL_DISCOUNT_AMOUNT_INVALID');
  } else if (totalDiscount > 0 || present(invoice.discountInput)) {
    if (!['fixed', 'percent'].includes(invoice.discountType)) {
      add('GLOBAL_DISCOUNT_TYPE_UNKNOWN');
    } else if (!present(invoice.discountInput)) {
      add('GLOBAL_DISCOUNT_INPUT_MISSING');
    } else if (!safeMoney(subtotal)) {
      add('GLOBAL_DISCOUNT_BASE_UNVERIFIABLE');
    } else {
      try {
        const calculated = invoice.discountType === 'percent'
          ? percentOfRials(subtotal, invoice.discountInput, 'درصد تخفیف کل')
          : Math.min(subtotal, amount(invoice.discountInput, 'تخفیف ثابت کل'));
        if (calculated !== totalDiscount) add('GLOBAL_DISCOUNT_AMOUNT_MISMATCH');
      } catch {
        add('GLOBAL_DISCOUNT_INPUT_INVALID');
      }
    }
  }

  const lines = Array.isArray(invoice.items) ? invoice.items : [];
  for (let index = 0; index < lines.length; index++) {
    const item = lines[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      add('LINE_METADATA_INVALID', index);
      continue;
    }
    const discount = item.discount;
    if (!safeMoney(discount)) {
      add('LINE_DISCOUNT_AMOUNT_INVALID', index);
      continue;
    }
    if (discount === 0 && !present(item.discountInput)) continue;
    const mode = item.discountType;
    if (!['fixed','percent'].includes(mode)) {
      add('LINE_DISCOUNT_TYPE_UNKNOWN', index);
      continue;
    }
    if (!present(item.discountInput)) {
      add('LINE_DISCOUNT_INPUT_MISSING', index);
      continue;
    }
    try {
      const gross = lineGrossRials(item.qty, item.price);
      const calculated = mode === 'percent'
        ? percentOfRials(gross, item.discountInput, 'درصد تخفیف ردیف')
        : Math.min(gross, amount(item.discountInput, 'تخفیف ثابت ردیف'));
      if (calculated !== discount) add('LINE_DISCOUNT_AMOUNT_MISMATCH', index);
    } catch {
      add('LINE_DISCOUNT_INPUT_OR_BASIS_INVALID', index);
    }
  }

  return issues;
}
