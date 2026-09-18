// ============================================================
// KeyboardShortcuts — میانبرهای صفحه‌کلید و کلیدهای ترکیبی
// ============================================================

import { Toast } from './Toast.js';

const STORAGE_KEY = 'finora_pro_shortcuts';

const DEFAULTS = {
  enabled: true,
  enterConfirms: true,
  escapeCloses: true,
  ctrlSaves: true,
  plusMinusZeros: true,
  plusZeros: 3,
  minusZeros: 2
};

class KeyboardShortcutsImpl {
  constructor() {
    this.settings = { ...DEFAULTS };
    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this.loadSettings();
    // capture: true یعنی قبل از هر listener دیگه‌ای این صدا زده می‌شه
    document.addEventListener('keydown', (e) => this._onKeyDown(e), true);
    // بعضی مرورگرها (مثل فایرفاکس) در مرحله‌ی keypress هم چک می‌کنن
    document.addEventListener('keypress', (e) => this._onKeyPress(e), true);
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(this.settings, parsed);
      }
    } catch (e) {
      console.warn('KeyboardShortcuts: load failed:', e);
    }
  }

  saveSettings(newSettings) {
    Object.assign(this.settings, newSettings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
  }

  resetSettings() {
    this.settings = { ...DEFAULTS };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
  }

  // چک می‌کنه که آیا Ctrl+S هست یا نه — مستقل از زبان کیبورد
  _isCtrlS(e) {
    const hasCtrl = e.ctrlKey || e.metaKey;
    if (!hasCtrl) return false;
    // چندین روش چک (چون زبان کیبورد ممکنه فرق کنه)
    if (e.code === 'KeyS') return true;               // مستقل از زبان — مطمئن‌ترین
    if (e.key === 's' || e.key === 'S') return true;  // انگلیسی
    if (e.keyCode === 83) return true;                // legacy
    return false;
  }

  _onKeyDown(e) {
    if (!this.settings.enabled) return;

    const modal = document.querySelector('.modal-backdrop.active') ||
                  document.querySelector('.modal-backdrop');

    // ────── Ctrl+S / Cmd+S ──────
    if (this._isCtrlS(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.returnValue = false;
      if (this.settings.ctrlSaves && modal) {
        this._clickPrimaryButton(modal);
      }
      return false;
    }

    // ────── Ctrl+Enter → تأیید از هر جا ──────
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (this.settings.enterConfirms && modal) {
        e.preventDefault();
        this._clickPrimaryButton(modal);
      }
      return;
    }

    // ────── Escape → بستن مودال ──────
    if (e.key === 'Escape' && this.settings.escapeCloses) {
      if (modal) {
        e.preventDefault();
        this._clickCloseButton(modal);
      }
      return;
    }

    // ────── Enter → تأیید (فقط داخل مودال، نه در textarea) ──────
    if (e.key === 'Enter' && !e.shiftKey && this.settings.enterConfirms) {
      const active = document.activeElement;
      if (active && active.tagName === 'TEXTAREA') return;
      if (modal) {
        e.preventDefault();
        this._clickPrimaryButton(modal);
      }
      return;
    }

    // ────── کلیدهای + و - توی فیلدهای مبلغ ──────
    if (this.settings.plusMinusZeros) {
      const active = document.activeElement;
      if (active && active.tagName === 'INPUT' && active.getAttribute('data-money') === '1') {
        if (e.key === '+') {
          e.preventDefault();
          this._applyMultiplier(active, this.settings.plusZeros);
          return;
        }
        if (e.key === '-' || e.key === '−') {
          e.preventDefault();
          this._applyMultiplier(active, this.settings.minusZeros);
          return;
        }
      }
    }
  }

  // برای فایرفاکس که در keypress event چک می‌کنه
  _onKeyPress(e) {
    if (!this.settings.enabled) return;
    if (this._isCtrlS(e)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }

  _applyMultiplier(input, zeros) {
    const currentRaw = String(input.value || '').replace(/[^\d]/g, '');
    if (!currentRaw) return;

    const current = Number(currentRaw);
    if (!isFinite(current) || current === 0) return;

    const multiplier = Math.pow(10, zeros);
    let newVal = current * multiplier;
    if (newVal > Number.MAX_SAFE_INTEGER) newVal = Number.MAX_SAFE_INTEGER;

    input.value = newVal.toLocaleString('en-US');
    input.dispatchEvent(new Event('input', { bubbles: true }));

    Toast.info(`× ${multiplier.toLocaleString('en-US')} → ${newVal.toLocaleString('fa-IR')}`, 'ضریب اعمال شد');
  }

  _clickPrimaryButton(modal) {
    const btns = modal.querySelectorAll('.modal-footer .btn, .modal-card .btn');
    for (let i = btns.length - 1; i >= 0; i--) {
      const b = btns[i];
      if (b.classList.contains('btn-secondary')) continue;
      if (b.classList.contains('btn-danger')) continue;
      if (b.disabled) continue;
      b.click();
      return;
    }
  }

  _clickCloseButton(modal) {
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) { closeBtn.click(); return; }
    const cancelBtn = modal.querySelector('.modal-footer .btn-secondary');
    if (cancelBtn) cancelBtn.click();
  }
}

export const KeyboardShortcuts = new KeyboardShortcutsImpl();
window.KeyboardShortcuts = KeyboardShortcuts;