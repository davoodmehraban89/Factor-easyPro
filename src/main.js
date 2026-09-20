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
import { ReportsView } from './views/ReportsView.js';
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

// تنها منبع تعریف صفحات: نام مسیر، عنوان مسیر، عنوان هدر و ویو
const ROUTES = [
  { name: 'dashboard', title: 'داشبورد',            header: 'داشبورد مدیریتی',   view: DashboardView },
  { name: 'invoices',  title: 'فاکتورها',           header: 'فاکتورها',           view: InvoicesView },
  { name: 'products',  title: 'کالا و انبار',       header: 'کالا و انبار',       view: ProductsView },
  { name: 'contacts',  title: 'اشخاص',              header: 'اشخاص',              view: ContactsView },
  { name: 'treasury',  title: 'خزانه و بانک',       header: 'خزانه و بانک',       view: TreasuryView },
  { name: 'cheques',   title: 'چک‌ها',              header: 'چک‌ها',              view: ChequesView },
  { name: 'expenses',  title: 'هزینه و درآمد',      header: 'هزینه و درآمد',      view: ExpensesView },
  { name: 'reports',   title: 'گزارش سود و زیان',   header: 'گزارش سود و زیان',   view: ReportsView },
  { name: 'settings',  title: 'تنظیمات',            header: 'تنظیمات',            view: SettingsView }
];

const DEFAULT_ROUTE = 'dashboard';
const LAST_ROUTE_KEY = 'finora_pro_last_route';

function registerRoutes() {
  ROUTES.forEach(({ name, title, view }) => {
    Router.register(name, {
      title,
      render: () => view.render(),
      onMount: () => view.onMount()
    });
  });
}

function getStartRoute() {
  const saved = localStorage.getItem(LAST_ROUTE_KEY);
  return ROUTES.some(r => r.name === saved) ? saved : DEFAULT_ROUTE;
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
    const route = ROUTES.find(r => r.name === Router.current());
    titleEl.textContent = route ? route.header : 'فینورا پرو';
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

function showBootstrapError(err) {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.style.display = '';

  // با textContent ساخته می‌شود تا متن خطا هرگز به‌عنوان HTML تفسیر نشود
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:20px;text-align:center;color:#fff;max-width:400px';

  const icon = document.createElement('div');
  icon.style.cssText = 'font-size:40px;margin-bottom:12px';
  icon.textContent = '⚠️';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:16px;font-weight:700';
  title.textContent = 'خطا در بارگذاری';

  const detail = document.createElement('div');
  detail.style.cssText = 'font-size:12px;margin-top:8px;opacity:.85';
  detail.textContent = err && err.message ? err.message : String(err);

  wrap.append(icon, title, detail);
  splash.replaceChildren(wrap);
}

async function bootstrap() {
  try {
    console.log('🚀 Finora Pro v' + FINORA.version);

    Theme.init();
    NumberInput.init();
    KeyboardShortcuts.init();
    await StorageService.init();
    await Auth.init(); // تا ورود موفق (صفحه قفل) اینجا منتظر می‌ماند

    registerRoutes();
    Router.init('pageContent');
    setupSidebar();

    EventBus.on('route:changed', () => {
      updateHeader();
      updateStats();
    });

    await Router.go(getStartRoute());

    updateHeader();
    updateStats();
    setInterval(updateHeader, 60000);

    document.getElementById('splash').style.display = 'none';
  } catch (err) {
    console.error('Bootstrap failed:', err);
    showBootstrapError(err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
