// ============================================================
// Auth — احراز هویت ساده
// ============================================================

import { StorageService } from './StorageService.js';
import { EventBus } from './EventBus.js';

class AuthImpl {
  constructor() {
    this.currentUser = null;
    this.sessionKey = 'finora_pro_session';
  }

  async init() {
    const sessionUser = sessionStorage.getItem(this.sessionKey);
    if (sessionUser) {
      this.currentUser = JSON.parse(sessionUser);
    } else {
      const users = await StorageService.getAll('users');
      if (users.length === 0) {
        const admin = {
          id: 'user_admin',
          username: 'admin',
          pass: 'admin123',
          role: 'admin',
          displayName: 'مدیر سیستم',
          createdAt: new Date().toISOString()
        };
        await StorageService.put('users', admin);
        users.push(admin);
      }
      this.currentUser = users[0];
      sessionStorage.setItem(this.sessionKey, JSON.stringify(this.currentUser));
    }
    this._updateUI();
    EventBus.emit('auth:ready', this.currentUser);
    return this.currentUser;
  }

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
    const users = await StorageService.getAll('users');
    const user = users.find(u => u.username === username && u.pass === password);
    if (!user) throw new Error('نام کاربری یا رمز عبور اشتباه است');
    this.currentUser = user;
    sessionStorage.setItem(this.sessionKey, JSON.stringify(user));
    this._updateUI();
    EventBus.emit('auth:login', user);
    return user;
  }

  logout() {
    if (!confirm('از حساب کاربری خارج می‌شوید؟')) return;
    this.currentUser = null;
    sessionStorage.removeItem(this.sessionKey);
    EventBus.emit('auth:logout');
    window.location.reload();
  }
}

export const Auth = new AuthImpl();