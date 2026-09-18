// ============================================================
// NumberInput — جداکننده‌ی هزارگان زنده برای input ها
// ============================================================

export const NumberInput = {
  // فرمت کردن عدد → "1,234,567"
  format(n) {
    if (n === '' || n === null || n === undefined) return '';
    const num = Math.round(Number(n));
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US');
  },

  // تبدیل رشته یا element → عدد خالص
  parse(input) {
    if (input === null || input === undefined) return 0;
    const s = typeof input === 'string' ? input : (input.value || '');
    const cleaned = String(s).replace(/[^\d.-]/g, '');
    return Number(cleaned) || 0;
  },

  // خواندن مقدار عددی از element
  value(el) {
    return this.parse(el);
  },

  // فرمت‌دهی زنده با حفظ موقعیت cursor
  _formatLive(el) {
    const cursorStart = el.selectionStart;
    const oldValue = el.value;

    let raw = oldValue.replace(/[^\d]/g, '');
    if (raw.length > 1) raw = raw.replace(/^0+/, '');

    const formatted = raw ? Number(raw).toLocaleString('en-US') : '';
    if (formatted === oldValue) return;

    const digitsBefore = oldValue.slice(0, cursorStart).replace(/\D/g, '').length;

    el.value = formatted;

    if (digitsBefore === 0) {
      el.setSelectionRange(0, 0);
    } else if (digitsBefore >= raw.length) {
      el.setSelectionRange(formatted.length, formatted.length);
    } else {
      let pos = 0, count = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) count++;
        if (count === digitsBefore) { pos = i + 1; break; }
      }
      el.setSelectionRange(pos, pos);
    }
  },

  // بررسی اینکه آیا این input باید فرمت بشه؟
  _shouldFormat(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    if (el.type === 'number') return true;
    if (el.dataset.money === '1') return true;
    if (el.getAttribute('inputmode') === 'numeric') return true;
    return false;
  },

  // تبدیل و علامت‌گذاری input ها
  _markAndFormat(el) {
    if (!this._shouldFormat(el)) return;

    // تبدیل number به text
    if (el.type === 'number') {
      el.type = 'text';
    }

    // علامت‌گذاری
    el.setAttribute('data-money', '1');
    el.setAttribute('inputmode', 'numeric');
    el.setAttribute('autocomplete', 'off');

    // فرمت کردن مقدار اولیه اگه خالص عددی بود
    const raw = (el.value || '').replace(/,/g, '').trim();
    if (raw && /^-?\d+$/.test(raw) && raw !== '0') {
      el.value = this.format(raw);
    } else if (raw === '0') {
      // 0 رو نگه‌دار بدون فرمت اضافی
      el.value = '0';
    }
  },

  // اسکن کل DOM
  _convertAll() {
    document.querySelectorAll('input').forEach(el => {
      if (this._shouldFormat(el)) {
        this._markAndFormat(el);
      }
    });
  },

  init() {
    // تبدیل اولیه
    this._convertAll();

    // ناظر برای ورودی‌های جدید (مودال‌ها، ردیف‌های جدید و...)
    const observer = new MutationObserver(() => {
      this._convertAll();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // فرمت‌دهی زنده در هنگام تایپ
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (!el || !el.matches || !el.matches('input')) return;
      if (el.getAttribute('data-money') !== '1') return;
      this._formatLive(el);
    });

    // پاک کردن مقدار صفر در ورودی اگه کاربر کلیک کرد و تایپ کرد
    document.addEventListener('focus', (e) => {
      const el = e.target;
      if (!el || !el.matches || !el.matches('input')) return;
      if (el.getAttribute('data-money') !== '1') return;
      if (el.value === '0') {
        el.value = '';
      }
    }, true);
  }
};