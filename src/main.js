// ============================================================
// Finora Pro — Main Entry Point
// ============================================================

import { ProductsView } from './views/ProductsView.js';
import { StorageService } from './core/StorageService.js';
import { Theme } from './core/Theme.js';
import { Toast } from './core/Toast.js';
import { Router } from './core/Router.js';
import { Auth } from './core/Auth.js';
import { EventBus } from './core/EventBus.js';
import { Formatters } from './utils/Formatters.js';
import { Jalali } from './utils/Jalali.js';
import { numberToWords } from './utils/NumberToWords.js';

const FINORA = {
  version: '0.1.0',
  Storage: StorageService,
  Theme, Toast, Router, Auth, EventBus,
  Utils: { Formatters, Jalali, numberToWords }
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
    render: async () => {
      const user = Auth.current();
      const invoices = await StorageService.getByOwner('invoices', user.id);
      const contacts = await StorageService.getByOwner('contacts', user.id);
      const products = await StorageService.getByOwner('products', user.id);

      const totalSales = invoices.reduce((s, i) => s + (i.grandTotal || 0), 0);

      return `
        <div class="page-title">
          <h2>داشبورد مدیریتی</h2>
          <p>نمای کلی از وضعیت کسب‌وکار شما</p>
        </div>

        <div class="grid-kpi">
          <div class="card" style="margin:0">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">فروش کل</div>
            <div style="font-size:20px;font-weight:800;color:var(--primary);margin-bottom:4px">${Formatters.money(totalSales)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${Formatters.number(invoices.length)} فاکتور</div>
          </div>
          <div class="card" style="margin:0">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">اشخاص ثبت‌شده</div>
            <div style="font-size:20px;font-weight:800;color:var(--info);margin-bottom:4px">${Formatters.number(contacts.length)}</div>
            <div style="font-size:11px;color:var(--text-muted)">مشتری و تامین‌کننده</div>
          </div>
          <div class="card" style="margin:0">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">کالاها</div>
            <div style="font-size:20px;font-weight:800;color:var(--success);margin-bottom:4px">${Formatters.number(products.length)}</div>
            <div style="font-size:11px;color:var(--text-muted)">کالا و خدمات</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><span>🎉 خوش آمدید به فینورا پرو</span></div>
          <p style="font-size:13.5px;line-height:1.9;color:var(--text-muted)">
            این <strong>فاز ۱</strong> از پروژه است. زیرساخت آماده است:
          </p>
          <ul style="margin-top:12px;padding-right:20px;font-size:13px;line-height:2;color:var(--text-muted)">
            <li>✅ پایگاه‌داده IndexedDB</li>
            <li>✅ معماری ماژولار ES Modules</li>
            <li>✅ Router داخلی SPA</li>
            <li>✅ تم روشن/تاریک</li>
            <li>✅ Toast حرفه‌ای</li>
            <li>✅ تاریخ شمسی توکار</li>
            <li>✅ عدد به حروف فارسی</li>
            <li>✅ EventBus</li>
          </ul>
        </div>

        <div class="card">
          <div class="card-title"><span>🧪 تست سریع</span></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn" onclick="FINORA.Toast.success('این یک پیام موفقیت است')">تست Toast موفق</button>
            <button class="btn btn-danger" onclick="FINORA.Toast.error('این یک خطا است')">تست Toast خطا</button>
            <button class="btn btn-secondary" onclick="FINORA.Theme.toggle()">تغییر تم</button>
            <button class="btn btn-secondary" onclick="FINORA.Toast.info(FINORA.Utils.numberToWords(1234567890))">تست عدد به حروف</button>
            <button class="btn btn-secondary" onclick="FINORA.Toast.info(FINORA.Utils.Jalali.todayLong())">تاریخ امروز</button>
          </div>
        </div>
      `;
    }
  });

  Router.register('invoices', { title: 'فاکتورها', render: placeholder('فاکتورها', 4) });
  Router.register('products', {
  title: 'کالا و انبار',
  render: () => ProductsView.render(),
  onMount: () => ProductsView.onMount()
});
  Router.register('contacts', { title: 'اشخاص', render: placeholder('اشخاص', 3) });
  Router.register('treasury', { title: 'خزانه و بانک', render: placeholder('خزانه و بانک', 6) });
  Router.register('cheques', { title: 'چک‌ها', render: placeholder('چک‌ها', 6) });
  Router.register('expenses', { title: 'هزینه و درآمد', render: placeholder('هزینه و درآمد', 6) });
  Router.register('reports', { title: 'گزارش سود و زیان', render: placeholder('گزارش سود و زیان', 7) });
  Router.register('settings', { title: 'تنظیمات', render: placeholder('تنظیمات', 9) });
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

function setupKeyboard() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      Toast.info('میانبر ذخیره در فازهای بعدی فعال می‌شود');
    }
  });
}

async function bootstrap() {
  try {
    console.log('🚀 Finora Pro v' + FINORA.version);

    Theme.init();
    await StorageService.init();
    await Auth.init();

    registerRoutes();
    Router.init('pageContent');
    setupSidebar();
    setupKeyboard();

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