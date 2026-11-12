import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Q01: existing tags never leave the add-new-tag input unnamed', () => {
  const source=readFileSync(new URL('../src/views/ContactsView.js', import.meta.url),'utf8');
  assert.match(source, /<input[^>]+id="newTagInput"[^>]+aria-label="افزودن برچسب جدید"/);
  assert.match(source, /class="tagCheckbox"/);
});

test('Q01: failing native field-label checks expose only safe field identities', () => {
  const source=readFileSync(new URL('./windows-vm-installed-tauri-cdp.cjs', import.meta.url),'utf8');
  assert.match(source,/audit\.fieldsWithoutLabels/);
  assert.match(source,/route: field\.route, section: field\.section/);
  assert.match(source,/id: field\.id, tag: field\.tag, type: field\.type/);
});
