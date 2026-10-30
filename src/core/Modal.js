// ============================================================
// Modal — accessible stacked dialogs and keyboard interaction
// ============================================================

class ModalManager {
  constructor() {
    this.stack = [];
    this.sequence = 0;
    this._onKeydown = this._onKeydown.bind(this);
  }

  _focusable(card) {
    return [...card.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), ' +
      'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(el => el.getClientRects().length > 0 &&
      window.getComputedStyle(el).visibility !== 'hidden');
  }

  _onKeydown(event) {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    if (event.key === 'Escape') {
      // Respect the user's keyboard setting. When enabled, this is the
      // single owner of Escape for stacked dialogs; close only the top one.
      const shortcuts = window.KeyboardShortcuts?.settings;
      if (shortcuts?.enabled && shortcuts.escapeCloses === false) return;
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = this._focusable(top.card);
    if (!focusables.length) {
      event.preventDefault();
      top.card.focus({ preventScroll: true });
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !top.card.contains(active)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
    } else if (active === last || !top.card.contains(active)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  _refreshStack() {
    for (let i = 0; i < this.stack.length; i++) {
      const top = i === this.stack.length - 1;
      if (top) this.stack[i].card.removeAttribute('aria-hidden');
      else this.stack[i].card.setAttribute('aria-hidden', 'true');
    }
  }

  // Pair an existing visual label with its field only when the association is
  // unambiguous. Multi-field groups and already-labelled controls are untouched.
  _associateFormLabels(card) {
    for (const group of card.querySelectorAll('.form-group')) {
      const fields = [...group.querySelectorAll('input, select, textarea')]
        .filter(field => field.closest('.form-group') === group && field.type !== 'hidden');
      if (fields.length !== 1) continue;
      const field = fields[0];
      if (field.hasAttribute('aria-label') || field.hasAttribute('aria-labelledby') || field.labels?.length) continue;
      const labels = [...group.querySelectorAll('label.form-label')]
        .filter(label => label.closest('.form-group') === group &&
          !label.hasAttribute('for') && !label.querySelector('input, select, textarea'));
      if (labels.length !== 1 || !labels[0].textContent.trim()) continue;
      if (field.id) {
        if (card.querySelectorAll('[id]').length &&
            [...card.querySelectorAll('[id]')].filter(el => el.id === field.id).length !== 1) continue;
        if (document.getElementById(field.id)) continue;
      } else {
        field.id = 'finora-modal-field-' + (++this.sequence);
      }
      labels[0].setAttribute('for', field.id);
    }
  }

  _create(options) {
    const { title, body, footer, size = 'md', onClose, closeOnBackdrop = true } = options;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    // Do not interpret a text selection ending over the backdrop as an intent to close.
    if (closeOnBackdrop) {
      let mouseDownTarget = null;
      backdrop.addEventListener('mousedown', e => { mouseDownTarget = e.target; });
      backdrop.addEventListener('mouseup', e => {
        if (e.target === backdrop && mouseDownTarget === backdrop) this.close();
        mouseDownTarget = null;
      });
    }

    const card = document.createElement('div');
    card.className = `modal-card modal-${size}`;
    const titleId = 'finora-dialog-title-' + (++this.sequence);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', titleId);
    card.setAttribute('tabindex', '-1');
    card.innerHTML = `
      <div class="modal-header">
        <div class="modal-title" id="${titleId}"></div>
        <button type="button" class="modal-close" aria-label="بستن پنجره">×</button>
      </div>
      <div class="modal-body"></div>
      ${footer ? '<div class="modal-footer"></div>' : ''}
    `;
    // Dialog title is text, never HTML from user-provided company/contact names.
    card.querySelector('.modal-title').textContent = String(title ?? '');

    const bodyEl = card.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body instanceof HTMLElement) bodyEl.appendChild(body);

    if (footer) {
      const footerEl = card.querySelector('.modal-footer');
      if (typeof footer === 'string') footerEl.innerHTML = footer;
      else if (footer instanceof HTMLElement) footerEl.appendChild(footer);
    }

    card.querySelector('.modal-close').onclick = () => this.close();
    this._associateFormLabels(card);
    backdrop.appendChild(card);
    return { backdrop, card, onClose, previousFocus: document.activeElement };
  }

  open(options) {
    const modal = this._create(options);
    document.body.appendChild(modal.backdrop);
    document.body.style.overflow = 'hidden';
    this.stack.push(modal);
    this._refreshStack();
    if (this.stack.length === 1) {
      document.addEventListener('keydown', this._onKeydown, true);
    }
    queueMicrotask(() => {
      if (this.stack[this.stack.length - 1] !== modal || !modal.card.isConnected) return;
      // Prefer a VISIBLE input. A hidden radio/record-ID input can be the
      // first field in financial forms; focusing it leaves the dialog unfocused.
      const focusables = this._focusable(modal.card);
      const focusTarget = focusables.find(el => el.hasAttribute('autofocus')) ||
        focusables.find(el => el.matches('input, select, textarea')) ||
        focusables[0] || modal.card;
      focusTarget.focus({ preventScroll: true });
    });
    return modal;
  }

  close() {
    const modal = this.stack.pop();
    if (!modal) return;
    modal.backdrop.remove();
    this._refreshStack();
    if (this.stack.length === 0) {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', this._onKeydown, true);
    }
    if (modal.previousFocus?.isConnected && typeof modal.previousFocus.focus === 'function') {
      modal.previousFocus.focus({ preventScroll: true });
    } else if (this.stack.length) {
      this.stack[this.stack.length - 1].card.focus({ preventScroll: true });
    }
    if (modal.onClose) modal.onClose();
  }

  closeAll() {
    while (this.stack.length) this.close();
  }

  confirm({ title, message, confirmText = 'تأیید', cancelText = 'انصراف', danger = false, onConfirm }) {
    // Confirmations always render their message as text; financial record names
    // and externally imported labels must never become executable markup.
    const body = '<p data-confirm-message style="font-size:13.5px;line-height:1.8"></p>';
    const footer = `
      <button type="button" class="btn btn-secondary" data-action="cancel"></button>
      <button type="button" class="btn ${danger ? 'btn-danger' : ''}" data-action="confirm"></button>
    `;
    const modal = this.open({ title, body, footer, size: 'sm' });
    modal.card.querySelector('[data-confirm-message]').textContent = String(message ?? '');
    const footerEl = modal.card.querySelector('.modal-footer');
    const cancelButton = footerEl.querySelector('[data-action="cancel"]');
    const confirmButton = footerEl.querySelector('[data-action="confirm"]');
    cancelButton.textContent = String(cancelText ?? '');
    confirmButton.textContent = String(confirmText ?? '');
    cancelButton.onclick = () => this.close();
    confirmButton.onclick = () => {
      this.close();
      if (onConfirm) onConfirm();
    };
  }
}

export const Modal = new ModalManager();
