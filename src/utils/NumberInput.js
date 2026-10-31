// NumberInput — live thousands separators with opt-in fractional quantities.
// Financial amounts remain integer by default; quantity fields can declare
// data-decimals="3" to preserve the application's three decimal stock units.
const latinDigits = value => String(value)
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
  .replace(/٫/g, '.');

const fractionLimit = value => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(0, Math.min(3, parsed)) : 0;
};

export const NumberInput = {
  format(value, fractionDigits = 0) {
    if (value === '' || value === null || value === undefined) return '';
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const digits = fractionLimit(fractionDigits);
    return (digits ? number : Math.round(number)).toLocaleString('en-US', {
      maximumFractionDigits: digits
    });
  },

  parse(input) {
    if (input === null || input === undefined) return 0;
    const value = typeof input === 'string' || typeof input === 'number'
      ? input : (input.value ?? '');
    const cleaned = latinDigits(value).replace(/[,٬،\s]/g, '').replace(/[^\d.-]/g, '');
    return Number(cleaned) || 0;
  },

  // Strictly validate user-visible fields before writing. Unlike parse(),
  // malformed strings are never silently transformed into a different amount.
  parseStrict(input, { decimals = 0, optional = false } = {}) {
    const value = typeof input === 'string' || typeof input === 'number'
      ? input : (input?.value ?? '');
    const normalized = latinDigits(value).replace(/[٬،]/g, ',').trim();
    if (optional && normalized === '') return 0;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 3 ||
        !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(normalized))
      throw Error('ورودی عددی نامعتبر است');
    const point = normalized.indexOf('.');
    if (point >= 0 && normalized.length - point - 1 > decimals)
      throw Error('تعداد رقم اعشار بیش از حد مجاز است');
    const num = Number(normalized.replace(/,/g, ''));
    if (!Number.isFinite(num) || num < 0 ||
        (decimals === 0 && !Number.isSafeInteger(num)))
      throw Error('مقدار عددی خارج از محدوده مجاز است');
    return num;
  },

  value(el) {
    return this.parse(el);
  },

  _fractionDigits(el) {
    return fractionLimit(el.dataset.decimals);
  },

  // Format as decimal text, not Number(), so typing never changes a quantity
  // such as 2.5 to 25 and large integers cannot become exponential notation.
  _formatText(value, digits) {
    const normalized = latinDigits(value).replace(/[,٬،\s]/g, '');
    const negative = normalized.startsWith('-');
    const positive = negative ? normalized.slice(1) : normalized;
    const numeric = positive.replace(/[^\d.]/g, '');
    const point = numeric.indexOf('.');
    let integer = (point >= 0 ? numeric.slice(0, point) : numeric).replace(/^0+(?=\d)/, '');
    // Never silently truncate over-precision: finance validation must reject it.
    const fraction = point >= 0 ? numeric.slice(point + 1).replace(/\./g, '') : '';
    if (!integer && (point >= 0 || negative)) integer = '0';
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decimal = point >= 0 ? '.' + fraction : '';
    return (negative ? '-' : '') + grouped + decimal;
  },

  _formatLive(el) {
    const oldValue = el.value;
    const cursor = el.selectionStart ?? oldValue.length;
    const digits = this._fractionDigits(el);
    // Do not silently turn malformed pasted text (2x5, 1,23) into a
    // different amount. Leave it visible so strict save validation rejects it.
    const normalized = latinDigits(oldValue).replace(/[٬،]/g, ',');
    if (!/^-?[\d,]*(?:\.[\d]*)?$/.test(normalized)) return;
    const whole = normalized.split('.')[0].replace(/^-/, '');
    if (whole.includes(',') && !/^\d{1,3}(?:,\d{3})+$/.test(whole)) return;
    const formatted = this._formatText(oldValue, digits);
    if (formatted === oldValue) return;

    // Preserve the count of significant characters before the caret, while
    // ignoring inserted grouping commas and normalizing Persian/Arabic digits.
    const before = latinDigits(oldValue.slice(0, cursor))
      .replace(/[,٬،\s]/g, '')
      .replace(digits ? /[^\d.]/g : /[^\d]/g, '');
    el.value = formatted;
    let position = formatted.length;
    if (!before.length) {
      position = 0;
    } else {
      let seen = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (isDigitOrDot(formatted[i], digits) && ++seen === before.length) {
          position = i + 1;
          break;
        }
      }
    }
    if (typeof el.setSelectionRange === 'function') el.setSelectionRange(position, position);
  },

  _shouldFormat(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    return el.type === 'number' || el.dataset.money === '1' ||
      el.hasAttribute('data-decimals') || el.getAttribute('inputmode') === 'numeric';
  },

  _markAndFormat(el) {
    if (!this._shouldFormat(el)) return;
    if (el.type === 'number') {
      // A native number input with a fractional step must not lose its step.
      const step = el.getAttribute('step');
      if (!el.hasAttribute('data-decimals') && step && /^0\.\d+$/.test(step)) {
        el.dataset.decimals = String(fractionLimit(step.split('.')[1].length));
      }
      el.type = 'text';
    }
    el.setAttribute('data-money', '1');
    const digits = this._fractionDigits(el);
    el.setAttribute('inputmode', digits ? 'decimal' : 'numeric');
    el.setAttribute('autocomplete', 'off');
    const normalized = latinDigits(el.value || '').replace(/[,٬،\s]/g, '');
    if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
      el.value = this._formatText(normalized, digits);
    }
  },

  _convertAll() {
    document.querySelectorAll('input').forEach(el => {
      if (this._shouldFormat(el)) this._markAndFormat(el);
    });
  },

  init() {
    this._convertAll();
    const observer = new MutationObserver(() => this._convertAll());
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('input', event => {
      const el = event.target;
      if (el?.matches?.('input') && el.getAttribute('data-money') === '1') this._formatLive(el);
    });
    document.addEventListener('focus', event => {
      const el = event.target;
      if (el?.matches?.('input') && el.getAttribute('data-money') === '1' && el.value === '0') {
        el.value = '';
      }
    }, true);
  }
};

function isDigitOrDot(char, digits) {
  return /\d/.test(char) || Boolean(digits && char === '.');
}
