// ============================================================
// Modal — سیستم پنجره‌ی شناور
// ============================================================

class ModalManager {
  constructor() {
    this.stack = [];
  }

  _create(options) {
    const { title, body, footer, size = 'md', onClose, closeOnBackdrop = true } = options;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    // Fix: کلیک فقط زمانی معنی داره که هم mousedown و هم mouseup روی خود backdrop باشه
    // (نه وقتی که کاربر داره داخل فرم متن select می‌کنه و موس به بیرون کشیده میشه)
    if (closeOnBackdrop) {
      let mouseDownTarget = null;
      backdrop.addEventListener('mousedown', (e) => {
        mouseDownTarget = e.target;
      });
      backdrop.addEventListener('mouseup', (e) => {
        if (e.target === backdrop && mouseDownTarget === backdrop) {
          this.close();
        }
        mouseDownTarget = null;
      });
    }

    const card = document.createElement('div');
    card.className = `modal-card modal-${size}`;
    card.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">${title}</div>
        <button class="modal-close" aria-label="بستن">×</button>
      </div>
      <div class="modal-body"></div>
      ${footer ? '<div class="modal-footer"></div>' : ''}
    `;

    const bodyEl = card.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body instanceof HTMLElement) bodyEl.appendChild(body);

    if (footer) {
      const footerEl = card.querySelector('.modal-footer');
      if (typeof footer === 'string') footerEl.innerHTML = footer;
      else if (footer instanceof HTMLElement) footerEl.appendChild(footer);
    }

    card.querySelector('.modal-close').onclick = () => this.close();
    backdrop.appendChild(card);
    return { backdrop, card, onClose };
  }

  open(options) {
    const modal = this._create(options);
    document.body.appendChild(modal.backdrop);
    document.body.style.overflow = 'hidden';
    this.stack.push(modal);
    return modal;
  }

  close() {
    const modal = this.stack.pop();
    if (!modal) return;
    modal.backdrop.remove();
    if (this.stack.length === 0) {
      document.body.style.overflow = '';
    }
    if (modal.onClose) modal.onClose();
  }

  closeAll() {
    while (this.stack.length) this.close();
  }

  confirm({ title, message, confirmText = 'تأیید', cancelText = 'انصراف', danger = false, onConfirm }) {
    const body = `<p style="font-size:13.5px;line-height:1.8">${message}</p>`;
    const footer = `
      <button class="btn btn-secondary" data-action="cancel">${cancelText}</button>
      <button class="btn ${danger ? 'btn-danger' : ''}" data-action="confirm">${confirmText}</button>
    `;
    const modal = this.open({ title, body, footer, size: 'sm' });
    const footerEl = modal.card.querySelector('.modal-footer');
    footerEl.querySelector('[data-action="cancel"]').onclick = () => this.close();
    footerEl.querySelector('[data-action="confirm"]').onclick = () => {
      this.close();
      if (onConfirm) onConfirm();
    };
  }
}

export const Modal = new ModalManager();