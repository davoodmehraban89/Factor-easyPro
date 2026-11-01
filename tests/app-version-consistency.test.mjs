import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const manifest = JSON.parse(read('package.json'));
const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
const entry = read('src/main.js');
const html = read('index.html');

test('A07: desktop and application version use a single package manifest', () => {
  assert.equal(manifest.version, tauri.version);
  assert.match(entry, /version: appPackage\.version/);
  assert.doesNotMatch(entry, /version:\s*['"]1\.1\.1['"]/);
  assert.match(html, /id="appVersionLabel"/);
  assert.match(entry, /visibleVersion\.textContent\s*=\s*'نسخه '\s*\+\s*FINORA\.version/);
});

test('A07: settings About card uses manifest version', () => {
  const settings = read('src/views/SettingsView.js');
  assert.match(settings, /import appPackage from/);
  assert.ok(settings.includes('نسخه '+ '$' + '{appPackage.version}'));
});
