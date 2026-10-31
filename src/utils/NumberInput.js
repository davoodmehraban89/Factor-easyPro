// ============================================================
// NumberInput — locale-aware grouped numeric inputs
// Keep fractional stock quantities and Persian/Arabic digits intact.
// ============================================================

// Normalize numeric glyphs without converting the value to Number first:
// doing so would round fractional quantities and large integer strings.
function normalizeNumeric(value) {
  return String(value)
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/٫/g, '.')
    .replace(/−/g, '-')
    .replace(/[,،٬\s\u00a0\u202f]/g, '');
}

function groupInteger(value) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatNormalized(value) {
  const match = /^(-?)(\d+)(\.(\d*))?$/.exec(value);
  if (!match) return '';
  return match[1] + groupInteger(match[2]) + (match[3] ?? '');
}

export const NumberInput = {
  // Format without rounding valid decimal quantities (for example, 2.375).
  format(value) {
    if (value === '' || value === null || value === undefined) return '';
    const normalized = normalizeNumeric(value);
    const formatted = formatNormalized(normalized);
    if (formatted) return formatted;
    // Retain the historic empty-string behavior for malformed input.
    return '';
  },

  // Read an element or text with Persian and Arabic digit support.
  // Empty/invalid inputs retain the existing 0 fallback for compatibility.
  parse(input) {
    if (input === null || input === undefined) return 0;
    const raw = typeof input === 'string' || typeof input === 'number'
      ? input : (input.value ?? '');
    const normalized = normalizeNumeric(raw);
    if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return 0;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
  },

  value(el) {
    return this.parse(el);
  },

  // Format while typing; do not delete decimal separators or fractional digits.
  _formatLive(el) {
    const cursorStart = el.selectionStart ?? el.value.length;
    const oldValue = String(el.value);
    const normalized = normalizeNumeric(oldValue);
    const negative = normalized.startsWith('-');
    const numeric = normalized.replace(/[^\d.]/g, '');
    const dot = numeric.indexOf('.');
    const hasDecimal = dot !== -1;
    let whole = (hasDecimal ? numeric.slice(0, dot) : numeric).replace(/^0+(?=\d)/, '');
    if (!whole && hasDecimal) whole = '0';
    const fractional = hasDecimal ? numeric.slice(dot + 1).replace(/\./g, '') : '';
    const result = (negative ? '-' : '') + (whole ? groupInteger(whole) : '') +
      (hasDecimal ? '.' + fractional : '');
    if (result === oldValue) return;

    // Count meaningful tokens before the caret, ignoring thousands separators.
    const before = normalizeNumeric(oldValue.slice(0, cursorStart))
      .replace(/[^\d.\-]/g, '').length;
    let caret = 0;
    let seen = 0;
    for (; caret < result.length && seen < before; caret++) {
      if (/[\d.\-]/.test(result[caret])) seen++;
    }
    el.value = result;
    if (typeof el.setSelectionRange === 'function') {
      el.setSelectionRange(caret, caret);
    }
  },

  _shouldFormat(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    if (el.type === 'number') return true;
    if (el.dataset.money === '1') return true;
    if (el.getAttribute('inputmode') === 'numeric') return true;
    return false;
  },

  _markAndFormat(el) {
    if (!this._shouldFormat(el)) return;
    if (el.type === 'number') el.type = 'text';
    el.setAttribute('data-money', '1');
    el.setAttribute('inputmode', 'numeric');
    el.setAttribute('autocomplete', 'off');
    const normalized = normalizeNumeric(el.value || '');
    if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
      el.value = this.format(normalized);
    }
  },

  _convertAll() {
    document.querySelectorAll('input').forEach(el => {
      if (this._shouldFormat(el)) this._markAndFormat(el);
    });
  },

  init() {
    this._convertAll();
    const observer = new MutationObserver(() => { this._convertAll(); });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('input', e => {
      const el = e.target;
      if (!el || !el.matches || !el.matches('input')) return;
      if (el.getAttribute('data-money') !== '1') return;
      this._formatLive(el);
    });
    document.addEventListener('focus', e => {
      const el = e.target;
      if (!el || !el.matches || !el.matches('input')) return;
      if (el.getAttribute('data-money') !== '1') return;
      if (el.value === '0') el.value = '';
    }, true);
  }
};
