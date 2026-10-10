// ============================================================
// Toast Notifications
// ============================================================

const ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
const DURATIONS = { success: 3000, info: 3500, warning: 5000, error: 6000 };

class ToastManager {
  constructor() { this.container = null; }

  _ensure() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      this.container.id = 'toastContainer';
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  show(message, type = 'info', title = '') {
    const c = this._ensure();
    // Keep the notification host last in the body so it paints above dialogs.
    if (c.parentElement === document.body) document.body.appendChild(c);
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <div class="toast-icon">${ICONS[type]}</div>
      <div class="toast-content">
        ${title ? `<strong>${this._esc(title)}</strong>` : ''}
        <p>${this._esc(message)}</p>
      </div>
      <button class="toast-close" aria-label="بستن">×</button>`;
    el.querySelector('.toast-close').onclick = () => el.remove();
    c.appendChild(el);
    // Errors stay visible until dismissed so users can read and report them.
    if (type !== 'error') setTimeout(() => {
      if (!el.isConnected) return;
      el.style.animation = 'slideOut .3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, DURATIONS[type] || 4000);
  }

  success(m, t) { this.show(m, 'success', t); }
  error(m, t) { this.show(m, 'error', t); }
  warning(m, t) { this.show(m, 'warning', t); }
  info(m, t) { this.show(m, 'info', t); }

  _esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

export const Toast = new ToastManager();