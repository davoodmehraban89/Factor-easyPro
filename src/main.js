// ============================================================
// Finora Pro — Main Entry Point
// ============================================================

import { SettingsView } from './views/SettingsView.js';
import { ChequesView } from './views/ChequesView.js';
import { TreasuryView } from './views/TreasuryView.js';
import { InvoicesView } from './views/InvoicesView.js';
import { ContactsView } from './views/ContactsView.js';
import { ProductsView } from './views/ProductsView.js';
import { ExpensesView } from './views/ExpensesView.js';
import { DashboardView } from './views/DashboardView.js';
import { StorageService } from './core/StorageService.js';
import { Theme } from './core/Theme.js';
import { Toast } from './core/Toast.js';
import { Router } from './core/Router.js';
import { Auth } from './core/Auth.js';
import { EventBus } from './core/EventBus.js';
import { Modal } from './core/Modal.js';
import { KeyboardShortcuts } from './core/KeyboardShortcuts.js';
import { Formatters } from './utils/Formatters.js';
import { Jalali } from './utils/Jalali.js';
import { numberToWords } from './utils/NumberToWords.js';
import { NumberInput } from './utils/NumberInput.js';

const FINORA = {
  version: '0.1.0',
  Storage: StorageService,
  Theme, Toast, Router, Auth, EventBus, Modal, KeyboardShortcuts,
  Utils: { Formatters, Jalali, numberToWords, NumberInput }
};
window.FINORA = FINORA;

function registerRoutes() {
  const placeholder = (title, phase) => async () => `
    <div class="page-title">
      <h2>${title}</h2>
      <p>این ماژول در فاز ${phase} پیاده‌سازی می‌شود</p>
    </div>
    <div class="card" style="text-align:center;padding:60px 20px">
      <div style="font-size:60px;margin-bottom:16px">🚧</div>
      <h3 style="margin-bottom:8px">در حال توسعه</h3>
      <p class="text-muted">این بخش به‌زودی اضافه می‌شود</p>
    </div>
  `;

  Router.register('dashboard', {
    title: 'داشبورد',
    render: () => DashboardView.render(),
    onMount: () => DashboardView.onMount()
  });

  Router.register('invoices', {
    title: 'فاکتورها',
    render: () => InvoicesView.render(),
    onMount: () => InvoicesView.onMount()
  });

  Router.register('products', {
    title: 'کالا و انبار',
    render: () => ProductsView.render(),
    onMount: () => ProductsView.onMount()
  });

  Router.register('contacts', {
    title: 'اشخاص',
    render: () => ContactsView.render(),
    onMount: () => ContactsView.onMount()
  });

  Router.register('treasury', {
    title: 'خزانه و بانک',
    render: () => TreasuryView.render(),
    onMount: () => TreasuryView.onMount()
  });

  Router.register('cheques', {
    title: 'چک‌ها',
    render: () => ChequesView.render(),
    onMount: () => ChequesView.onMount()
  });

  Router.register('expenses', {
    title: 'هزینه و درآمد',
    render: () => ExpensesView.render(),
    onMount: () => ExpensesView.onMount()
  });

  Router.register('reports', {
    title: 'گزارش سود و زیان',
    render: placeholder('گزارش سود و زیان', 8)
  });

  Router.register('settings', {
    title: 'تنظیمات',
    render: () => SettingsView.render(),
    onMount: () => SettingsView.onMount()
  });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'صبح بخیر';
  if (h >= 12 && h < 17) return 'وقت بخیر';
  if (h >= 17 && h < 21) return 'عصر بخیر';
  return 'شب بخیر';
}

function updateHeader() {
  const greetEl = document.getElementById('greeting');
  if (greetEl) greetEl.textContent = `${getGreeting()} • ${Jalali.formatLong()}`;

  const titleEl = document.getElementById('pageTitle');
  if (titleEl) {
    const titles = {
      dashboard: 'داشبورد مدیریتی',
      invoices: 'فاکتورها',
      products: 'کالا و انبار',
      contacts: 'اشخاص',
      treasury: 'خزانه و بانک',
      cheques: 'چک‌ها',
      expenses: 'هزینه و درآمد',
      reports: 'گزارش سود و زیان',
      settings: 'تنظیمات'
    };
    titleEl.textContent = titles[Router.current()] || 'فینورا پرو';
  }
}

async function updateStats() {
  const user = Auth.current();
  if (!user) return;
  const [inv, con, pro] = await Promise.all([
    StorageService.count('invoices'),
    StorageService.count('contacts'),
    StorageService.count('products')
  ]);
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = Formatters.number(val); };
  set('statInvoices', inv);
  set('statContacts', con);
  set('statProducts', pro);
}

function setupSidebar() {
  document.querySelectorAll('[data-page]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      Router.go(a.dataset.page);
    });
  });

  if (localStorage.getItem('finora_pro_sidebar_collapsed') === 'true') {
    document.getElementById('sidebar').classList.add('collapsed');
    document.getElementById('main').classList.add('sidebar-collapsed');
  }
}

async function bootstrap() {
  try {
    console.log('🚀 Finora Pro v' + FINORA.version);

    Theme.init();
    NumberInput.init();
    KeyboardShortcuts.init();
    await StorageService.init();
    await Auth.init();

    registerRoutes();
    Router.init('pageContent');
    setupSidebar();

    EventBus.on('route:changed', () => {
      updateHeader();
      updateStats();
    });

    const lastRoute = localStorage.getItem('finora_pro_last_route') || 'dashboard';
    await Router.go(lastRoute);

    updateHeader();
    updateStats();
    setInterval(updateHeader, 60000);

    document.getElementById('splash').style.display = 'none';

    setTimeout(() => Toast.success('فینورا پرو با موفقیت بارگذاری شد', 'خوش آمدید'), 300);
  } catch (err) {
    console.error('Bootstrap failed:', err);
    const splash = document.getElementById('splash');
    if (splash) {
      splash.innerHTML = `
        <div style="padding:20px;text-align:center;color:#fff;max-width:400px">
          <div style="font-size:40px;margin-bottom:12px">⚠️</div>
          <div style="font-size:16px;font-weight:700">خطا در بارگذاری</div>
          <div style="font-size:12px;margin-top:8px;opacity:.85">${err.message}</div>
        </div>`;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}