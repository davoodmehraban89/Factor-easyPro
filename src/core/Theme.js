// ============================================================
// Theme — روشن/تاریک
// ============================================================

const THEMES = ['light', 'dark'];
const KEY = 'finora_pro_theme';

class ThemeManager {
  init() {
    const saved = localStorage.getItem(KEY) || 'light';
    this.apply(saved);
  }

  apply(theme) {
    if (!THEMES.includes(theme)) theme = 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(KEY, theme);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  toggle() {
    const next = this.current() === 'light' ? 'dark' : 'light';
    this.apply(next);
    return next;
  }

  current() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }
}

export const Theme = new ThemeManager();