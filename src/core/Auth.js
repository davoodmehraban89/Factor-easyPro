// ============================================================
// Auth — احراز هویت محلی
// - رمزها با PBKDF2-SHA256 هش می‌شوند (هرگز متن خام ذخیره نمی‌شود)
// - بدون ورود موفق، برنامه بارگذاری نمی‌شود (صفحه قفل)
// - نشست فقط شناسه کاربر را نگه می‌دارد، نه رمز و هش
// توجه: این لایه جلوی دسترسی معمولی را می‌گیرد؛ داده‌های IndexedDB
// رمزگذاری نمی‌شوند و کسی که به فایل‌های کامپیوتر دسترسی دارد می‌تواند آن‌ها را بخواند.
// ============================================================

import { StorageService, CREDENTIAL_FIELDS } from './StorageService.js';
import { EventBus } from './EventBus.js';

const PBKDF2_ITERATIONS = 600000;
const MIN_PASSWORD_LENGTH = 8;
const LEGACY_DEFAULT_PASSWORD = 'admin123';
const AUTH_ERROR = 'نام کاربری یا رمز عبور اشتباه است';

const encoder = new TextEncoder();
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return {
    pwAlgo: 'pbkdf2-sha256',
    pwIter: PBKDF2_ITERATIONS,
    pwSalt: toB64(salt),
    pwHash: toB64(hash)
  };
}

export async function verifyPassword(password, user) {
  if (!user || !user.pwHash || !user.pwSalt) return false;
  const hash = await derive(String(password ?? ''), fromB64(user.pwSalt), user.pwIter || PBKDF2_ITERATIONS);
  return timingSafeEqual(hash, fromB64(user.pwHash));
}

const needsPassword = (user) => !!user.mustSetPassword || !user.pwHash;

class AuthImpl {
  constructor() {
    this.currentUser = null;
    this.sessionKey = 'finora_pro_session';
    this._failures = 0;
  }

  // ---------- راه‌اندازی ----------

  async init() {
    await this._migrateLegacyPasswords();

    let users = await StorageService.getAll('users');
    if (users.length === 0) {
      // اولین اجرا: کاربر مدیر بدون رمز ساخته می‌شود و صفحه قفل از او رمز می‌گیرد
      const admin = await StorageService.put('users', {
        id: 'user_admin',
        username: 'admin',
        role: 'admin',
        displayName: 'مدیر سیستم',
        mustSetPassword: true,
        createdAt: new Date().toISOString()
      });
      users = [admin];
    }

    let user = this._restoreSession(users);
    if (!user) user = await this._showLockScreen(users);

    this._startSession(user);
    this._updateUI();
    EventBus.emit('auth:ready', this.currentUser);
    return this.currentUser;
  }

  // رمزهای متن خام نسخه‌های قبلی را هش می‌کند. رمز پیش‌فرض عمومی admin123 بی‌اعتبار
  // می‌شود و کاربر باید رمز جدید تعیین کند.
  async _migrateLegacyPasswords() {
    const users = await StorageService.getAll('users');
    for (const u of users) {
      if (u.pass === undefined) continue;
      const legacy = u.pass;
      const next = { ...u };
      delete next.pass;
      if (typeof legacy !== 'string' || legacy === '' || legacy === LEGACY_DEFAULT_PASSWORD) {
        next.mustSetPassword = true;
      } else {
        Object.assign(next, await hashPassword(legacy));
        delete next.mustSetPassword;
      }
      await StorageService.put('users', next);
    }
  }

  _restoreSession(users) {
    const raw = sessionStorage.getItem(this.sessionKey);
    if (!raw) return null;
    let id = raw;
    try {
      const parsed = JSON.parse(raw); // نشست قدیمی کل شیء کاربر بود
      if (parsed && typeof parsed === 'object' && parsed.id) id = parsed.id;
    } catch (_) { /* نشست جدید فقط شناسه است */ }
    const user = users.find(u => u.id === id);
    if (!user || needsPassword(user)) return null;
    return user;
  }

  _publicUser(user) {
    const copy = { ...user };
    CREDENTIAL_FIELDS.forEach(f => delete copy[f]);
    delete copy.mustSetPassword;
    return copy;
  }

  _startSession(user) {
    this.currentUser = this._publicUser(user);
    sessionStorage.setItem(this.sessionKey, user.id);
  }

  async _setPassword(user, password) {
    const next = { ...user, ...(await hashPassword(password)), mustSetPassword: false };
    delete next.pass;
    return StorageService.put('users', next);
  }

  // ---------- صفحه قفل ----------

  _showLockScreen(users) {
    return new Promise((resolve) => {
      const splash = document.getElementById('splash');
      const splashDisplay = splash ? splash.style.display : '';
      if (splash) splash.style.display = 'none';

      const root = document.createElement('div');
      root.id = 'finoraAuthOverlay';
      root.setAttribute('dir', 'rtl');
      root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:#0f172a;font-family:inherit;';
      root.innerHTML = `
        <form id="finoraAuthForm" autocomplete="on" style="width:min(92vw,380px);background:#fff;color:#0f172a;border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column;gap:12px;">
          <div id="faTitle" style="font-size:20px;font-weight:700;"></div>
          <div id="faHint" style="font-size:13px;color:#475569;line-height:1.7;"></div>
          <input id="faUser" name="username" type="text" placeholder="نام کاربری" autocomplete="username" style="padding:12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;">
          <input id="faPass" name="password" type="password" placeholder="رمز عبور" autocomplete="current-password" style="padding:12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;">
          <input id="faPass2" name="password2" type="password" placeholder="تکرار رمز عبور" autocomplete="new-password" style="padding:12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;display:none;">
          <div id="faError" role="alert" style="min-height:20px;font-size:13px;color:#b91c1c;"></div>
          <button id="faSubmit" type="submit" style="padding:12px;border:0;border-radius:10px;background:#2563eb;color:#fff;font:inherit;font-weight:700;cursor:pointer;">ورود</button>
        </form>`;
      document.body.appendChild(root);

      const $ = (id) => root.querySelector('#' + id);
      const form = $('finoraAuthForm');
      const el = {
        title: $('faTitle'), hint: $('faHint'), user: $('faUser'),
        pass: $('faPass'), pass2: $('faPass2'), error: $('faError'), submit: $('faSubmit')
      };

      let mode = 'login';
      let busy = false;
      const showError = (msg) => { el.error.textContent = msg || ''; };

      const setMode = (next, user) => {
        mode = next;
        showError('');
        el.pass.value = '';
        el.pass2.value = '';
        if (next === 'setup') {
          el.title.textContent = 'تعیین رمز عبور';
          el.hint.textContent = `برای «${user.displayName || user.username}» یک رمز عبور حداقل ${MIN_PASSWORD_LENGTH} کاراکتری انتخاب کنید.`;
          el.user.value = user.username;
          el.user.readOnly = true;
          el.pass.placeholder = 'رمز عبور جدید';
          el.pass.autocomplete = 'new-password';
          el.pass2.style.display = '';
          el.submit.textContent = 'ذخیره و ورود';
          el.pass.focus();
        } else {
          el.title.textContent = 'ورود به فینورا پرو';
          el.hint.textContent = 'برای ادامه وارد شوید.';
          el.user.readOnly = false;
          el.pass.placeholder = 'رمز عبور';
          el.pass.autocomplete = 'current-password';
          el.pass2.style.display = 'none';
          el.submit.textContent = 'ورود';
          (el.user.value ? el.pass : el.user).focus();
        }
      };

      const finish = (user) => {
        root.remove();
        if (splash) splash.style.display = splashDisplay;
        this._failures = 0;
        resolve(user);
      };

      // اگر فقط یک کاربر هست، نام کاربری پر می‌شود؛ اگر او رمز ندارد مستقیم به تعیین رمز می‌رویم
      if (users.length === 1) {
        el.user.value = users[0].username;
        if (needsPassword(users[0])) setMode('setup', users[0]);
        else setMode('login');
      } else {
        setMode('login');
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (busy) return;
        busy = true;
        el.submit.disabled = true;
        showError('');
        try {
          const username = el.user.value.trim();
          const password = el.pass.value;
          const user = users.find(u => u.username === username);

          if (mode === 'setup') {
            if (password.length < MIN_PASSWORD_LENGTH) {
              showError(`رمز عبور باید حداقل ${MIN_PASSWORD_LENGTH} کاراکتر باشد`);
            } else if (password !== el.pass2.value) {
              showError('تکرار رمز عبور با رمز وارد‌شده یکسان نیست');
            } else if (password === LEGACY_DEFAULT_PASSWORD) {
              showError('این رمز پیش‌فرض و ناامن است؛ رمز دیگری انتخاب کنید');
            } else {
              finish(await this._setPassword(user, password));
            }
          } else if (user && needsPassword(user)) {
            setMode('setup', user);
          } else if (user && await verifyPassword(password, user)) {
            finish(user);
          } else {
            this._failures++;
            await sleep(Math.min(500 * 2 ** (this._failures - 1), 15000));
            showError(AUTH_ERROR);
          }
        } catch (err) {
          showError(err && err.message ? err.message : 'خطای ناشناخته');
        } finally {
          busy = false;
          el.submit.disabled = false;
        }
      });
    });
  }

  // ---------- رابط عمومی ----------

  _updateUI() {
    const u = this.currentUser;
    if (!u) return;
    const avatar = document.getElementById('userAvatar');
    const name = document.getElementById('userName');
    const role = document.getElementById('userRole');
    if (avatar) avatar.textContent = (u.displayName || u.username || 'م').charAt(0);
    if (name) name.textContent = u.displayName || u.username;
    if (role) role.textContent = u.role === 'admin' ? 'مدیر سیستم' : 'کاربر';
  }

  current() { return this.currentUser; }
  isAdmin() { return this.currentUser?.role === 'admin'; }

  async login(username, password) {
    await this._migrateLegacyPasswords();
    const users = await StorageService.getAll('users');
    const user = users.find(u => u.username === username);
    if (!user || needsPassword(user) || !(await verifyPassword(password, user))) {
      throw new Error(AUTH_ERROR);
    }
    this._startSession(user);
    this._updateUI();
    EventBus.emit('auth:login', this.currentUser);
    return this.currentUser;
  }

  logout() {
    if (!confirm('از حساب کاربری خارج می‌شوید؟')) return;
    this.currentUser = null;
    sessionStorage.removeItem(this.sessionKey);
    EventBus.emit('auth:logout');
    window.location.reload(); // پس از بارگذاری دوباره، صفحه قفل نمایش داده می‌شود
  }

  async changePassword(oldPassword, newPassword) {
    if (!this.currentUser) throw new Error('ابتدا وارد شوید');
    const user = await StorageService.get('users', this.currentUser.id);
    if (!(await verifyPassword(oldPassword, user))) throw new Error('رمز عبور فعلی اشتباه است');
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`رمز عبور باید حداقل ${MIN_PASSWORD_LENGTH} کاراکتر باشد`);
    }
    await this._setPassword(user, newPassword);
    return true;
  }

  async createUser({ username, password, displayName, role = 'user' } = {}) {
    if (!this.isAdmin()) throw new Error('فقط مدیر می‌تواند کاربر بسازد');
    const name = String(username ?? '').trim();
    if (!name) throw new Error('نام کاربری الزامی است');
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`رمز عبور باید حداقل ${MIN_PASSWORD_LENGTH} کاراکتر باشد`);
    }
    const users = await StorageService.getAll('users');
    if (users.some(u => u.username === name)) throw new Error('این نام کاربری قبلاً ثبت شده است');
    const created = await StorageService.put('users', {
      username: name,
      displayName: displayName || name,
      role: role === 'admin' ? 'admin' : 'user',
      ...(await hashPassword(password))
    });
    return this._publicUser(created);
  }
}

export const Auth = new AuthImpl();
