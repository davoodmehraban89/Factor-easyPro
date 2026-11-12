import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../scripts/q01-native-action-gap-report.cjs';

test('Q01 gap report excludes disabled controls from the unclicked count', () => {
  const report = buildReport({
    environment: 'installed-Windows-Tauri-WebView2-synthetic-VM',
    uniqueActions: [
      { route: 'settings', label: 'غیرفعال', handler: 'disabled()', status: 'disabled' },
      { route: 'products', label: 'ذخیره', handler: 'save()', status: 'not-clicked' }
    ],
    controls: [{ route: 'settings' }, { route: 'products' }],
    everyActionVerified: false,
    customerDataUsed: false,
    uniqueActionCount: 2,
    inventoryCount: 2,
    uniqueActionClicked: 0,
    uniqueActionUnverified: 1,
    uniqueActionDisabled: 1,
    uniqueActionFailed: 0,
    duplicateInstanceCount: 0,
    problems: []
  });
  assert.match(report, /\| امضاهای کلیک‌نشده \| 1 \|/);
  assert.match(report, /\| امضاهای غیرفعال \(خارج از شمارش کلیک‌نشده\) \| 1 \|/);
  assert.doesNotMatch(report, /## تنظیمات/);
});
