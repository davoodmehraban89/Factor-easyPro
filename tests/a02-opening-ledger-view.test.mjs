import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { AccountingView } from '../src/views/AccountingView.js';
import { Auth } from '../src/core/Auth.js';
import { OpeningBalanceService } from '../src/core/OpeningBalanceService.js';

test('A02: opening ledger controls are hidden from ordinary users', () => {
  const prev = Auth.currentUser;
  try {
    Auth.currentUser = { id: 'staff', role: 'user' };
    assert.doesNotMatch(AccountingView.renderOpening(), /type="file"/);
    Auth.currentUser = { id: 'admin', role: 'admin' };
    const html = AccountingView.renderOpening();
    assert.match(html, /type="file"/);
    assert.match(html, /کنترل مانده‌ها و دوره/);
    assert.match(html, /هیچ داده قدیمی را وارد نمی‌کند/);
    assert.doesNotMatch(html, /ثبت خودکار/);
  } finally {
    Auth.currentUser = prev;
  }
});

test('A02: JSON preview UI calls only readonly preflight, not commit', async () => {
  const originalUser = Auth.currentUser;
  const oldDocument = globalThis.document;
  const oldPreview = OpeningBalanceService.preview;
  const oldCommit = OpeningBalanceService.commit;
  const file = { size: 75, text: async () => '{"periodId":"period-example","lines":[]}' };
  const host = { innerHTML: '', textContent: '' };
  let preflightCount = 0, committedCount = 0;
  try {
    Auth.currentUser = { id: 'admin', role: 'admin' };
    globalThis.document = {
      getElementById(id) {
        if (id === 'openingFileInput') return { files: [file] };
        if (id === 'openingPreviewReport') return host;
        return null;
      }
    };
    OpeningBalanceService.preview = async draft => {
      preflightCount++;
      assert.equal(draft.periodId, 'period-example');
      return { readiness: 'blocked', journal: { debit: 100, credit: 99 },
        issues: ['UNBALANCED_OPENING_JOURNAL'] };
    };
    OpeningBalanceService.commit = async () => { committedCount++; };
    await AccountingView.previewOpeningFile();
    assert.equal(preflightCount, 1);
    assert.equal(committedCount, 0);
    assert.match(host.innerHTML, /UNBALANCED_OPENING_JOURNAL/);
    assert.match(host.innerHTML, /disabled/);
    assert.equal(AccountingView._openingReview.readiness, 'blocked');
  } finally {
    Auth.currentUser = originalUser;
    globalThis.document = oldDocument;
    OpeningBalanceService.preview = oldPreview;
    OpeningBalanceService.commit = oldCommit;
    AccountingView._openingCandidate = null;
    AccountingView._openingReview = null;
  }
});

test('A02: switching input files invalidates an earlier approval', () => {
  const originalDocument = globalThis.document;
  const reportNode = { textContent: '' };
  try {
    AccountingView._openingCandidate = { periodId: 'OLD_PERIOD' };
    AccountingView._openingReview = { readiness: 'ready-for-review' };
    globalThis.document = {
      getElementById(id) { return id === 'openingPreviewReport' ? reportNode : null; }
    };
    AccountingView.resetOpeningPreview();
    assert.equal(AccountingView._openingCandidate, null);
    assert.equal(AccountingView._openingReview, null);
    assert.match(reportNode.textContent, /دوباره بررسی/);
  } finally {
    globalThis.document = originalDocument;
  }
});
