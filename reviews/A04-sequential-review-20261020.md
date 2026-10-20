# A04 three sequential review passes — 2026-10-20

**Method:** three sequential reads and assessments by the assistant, NOT three independent agents. No independent accountant/device owner signed off. **Scope:** A04 software gate (versioned, recoverable, company-scoped Windows backup/restore). No production customer files.

## Pass 1 — Functional / compatibility
- Inspected `src/controllers/SettingsController.js`, `src/core/StorageService.js`, `tests/backup-restore-integration.test.mjs`, `tests/backup-version-validation.test.mjs` and `tests/a04-windows-v6-v7-browser-migration.cjs`.
- Covered: admin-only export/import, company-scoped v7 round-trip, matching desktop/app/schema versions, legacy v6 snapshot import, unsupported and future schema rejection, app identity validation, checksum mismatch and malformed JSON rejection. Original v2.0.3 installed in VM generated a real-format synthetic v6 snapshot; it was replayed in the installed v7 candidate.
- Evidence: post-merge quality [39383484055](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/39383484055) and Windows native [39383483978](https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/39383483978), both SHA `2c88c4b35017a2cd0ff1d6181bba0311fbd299d4`, success.

## Pass 2 — Security / isolation / immutable history
- Inspected `CompanyBackupService.js` preflight/sourceCompanyId and transactional restore; `SettingsController.js` source envelope checks; `StorageService.js` immutable posted records; `tests/backup-company-isolation.test.mjs`, `tests/a04-full-restore-finalized-records.test.mjs`, `tests/a04-immutable-posted-restore.test.mjs`, and `tests/a04-company-restore-journal-references.test.mjs`.
- Finding resolved before acceptance: original A04 branch would have validated mixed ownership only at the Settings controller. PR #118 introduced source-envelope record validation, and PR #119 added direct restore service boundary checks. Regression tests reject mixed/ownerless records and prevent false success/audit or partial rows. All changed code is merged into main.
- Full-snapshot restore does not accept imported password credentials or silently overwrite posted financial history. Linked posted journals and source references are checked inside atomic transactions; bad references roll back staged records. Limit: source-company migration remains an explicit administrator-controlled client workflow; not proof of remote identity. Adversary with full IndexedDB/file control lies beyond this local threat boundary.

## Pass 3 — Windows/native/failure paths
- Inspected `scripts/windows-vm-native-lab.ps1`, `tests/windows-vm-installed-tauri-cdp.cjs`, `tests/windows-vm-encrypted-company-backup-browser.js`, `tests/windows-vm-native-crash-import-browser.js`, and `docs/PHASE_A_EXIT_RUNBOOK_FA.md`.
- Actual installed NSIS/Tauri/WebView2 uses synthetic `.fbackup` AES-GCM/PBKDF2 envelope; incorrect password and one-bit ciphertext damage are rejected with no writes, UI errors are asserted, healthy recovery succeeds with an audit receipt, and intentionally invalid late-stage posted-ledger references trigger rollback without partial contacts/invoices.
- Windows runner also kills the **real app/WebView2 process tree** with taskkill while a genuine 50,000-contact import is underway, reopens the same profile and confirms zero imported partial records. This is process-kill testing, **not** a physical loss-of-power/disk-failure guarantee.
- GitHub Actions main SHA `2c88c4b35017a2cd0ff1d6181bba0311fbd299d4`: `39383484055` Linux 266/266, Windows 266/266, dependency audit/frontend/Tauri package successful; native `39383483978` successful. Relevant preceding PR runs: 39380965617/39380965551 (#118), 39381883748/39381883781 (#119).

## Review disposition
A04 **software acceptance approved** within the stated local/client and synthetic-installed-Windows coverage. Remaining **external gates**: `DATA_BACKUP` (actual authorized customer-device backup/restore) and `INDEPENDENT_QA` (accountant signoff), neither claimed. No independent reviewer agents were launched. No new public Release or modification of real user data. The separate requested additional installed-UI mixed-company regression was not committed due to a tool write safety block; existing Node/company and native rollback tests are the cited acceptance evidence, not that uncommitted scenario.
