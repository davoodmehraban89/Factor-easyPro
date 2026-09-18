// ============================================================
// Router — SPA routing
// ============================================================

import { EventBus } from './EventBus.js';

class RouterImpl {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
    this.defaultRoute = 'dashboard';
    this.container = null;
  }

  init(containerId = 'pageContent') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error('Router: container not found:', containerId);
      return;
    }
    window.addEventListener('hashchange', () => this._handleHash());
  }

  register(name, config) {
    this.routes.set(name, {
      title: config.title || name,
      render: config.render || (() => '<div>صفحه یافت نشد</div>'),
      onMount: config.onMount || (() => {}),
      onUnmount: config.onUnmount || (() => {})
    });
  }

  async navigate(name, params = {}) {
    if (!this.routes.has(name)) {
      console.warn('Router: unknown route:', name);
      name = this.defaultRoute;
    }
    const route = this.routes.get(name);

    if (this.currentRoute && this.currentRoute.onUnmount) {
      try { this.currentRoute.onUnmount(); } catch (e) { console.error(e); }
    }

    this.currentRoute = route;
    this.currentRoute.name = name;

    if (window.location.hash !== `#${name}`) {
      window.location.hash = name;
    }

    if (this.container) {
      try {
        const html = await route.render(params);
        this.container.innerHTML = html;
        if (route.onMount) await route.onMount(params);
      } catch (err) {
        console.error('Router render error:', err);
        this.container.innerHTML = `
          <div class="card" style="text-align:center;padding:40px">
            <div style="font-size:40px;margin-bottom:12px">⚠️</div>
            <h3>خطا در بارگذاری صفحه</h3>
            <p style="color:var(--text-muted);margin-top:8px;font-size:13px">${err.message}</p>
          </div>`;
      }
    }

    document.querySelectorAll('[data-page]').forEach(a => {
      a.classList.toggle('active', a.dataset.page === name);
    });

    EventBus.emit('route:changed', { name, params, route });
    localStorage.setItem('finora_pro_last_route', name);
  }

  _handleHash() {
    const hash = window.location.hash.replace('#', '') || this.defaultRoute;
    if (this.routes.has(hash) && hash !== this.currentRoute?.name) {
      this.navigate(hash);
    }
  }

  current() { return this.currentRoute?.name || null; }
  go(name) { return this.navigate(name); }
}

export const Router = new RouterImpl();