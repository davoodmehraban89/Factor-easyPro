# Factor-easyPro V2 — Phase 1 delivery record
Date: 2026-10-10
Checkpoint: v2.0.0-alpha.1 accounting foundation (NOT a V2 production release)
Plan: V2_THREE_PHASE_PLAN.md

## Actual code delivered
- src/core/AccountingCore.mjs: hierarchy, type classification, Persian date including leap-year check, fiscal period validation, debit/credit safe-integer arithmetic, period/date/company checks, reversible journal lines, source identity.
- src/core/AccountingService.js: transaction-safe account creation and opt-in chart seeding; create/list/close fiscal periods; manual draft creation, editing, finalization, discarding; balanced posted journals, exactly-once source enforcement, immutable reversal and trial balance.
- src/core/StorageService.js: existing v5 schema, atomic transaction and new accounting stores retained; v4->v5 migration test.
- src/core/DataScope.js: four accounting tables explicitly scoped by company.
- src/core/CompanyBackupService.js: atomic company backup import, accounting foreign key checks, duplicate/cross-company checks and rollback.
- src/controllers/SettingsController.js: backup export includes V2 stores; a store read failure cannot be misrepresented as a complete backup; restore delegates to the atomic service.
- src/views/SettingsView.js: correct encrypted .fbackup file picker and precise restore wording.
- src/views/AccountingView.js: dedicated isolated route for chart, periods, draft/posted journals, reversal and trial balance, without changing legacy invoices.
- src/main.js and index.html: route/menu for phase-one accounting module.
- src/package.json: ESM boundary for direct source testing, root package.json: npm test and npm run test:phase1; fake-indexeddb as test-only dependency.

## Acceptance evidence
- Unit and isolated fake-IndexedDB integration tests cover chart, company boundary, closed periods, unbalanced drafts, durable posting, source deduplication, reversal, deactivation after posting, transaction rollback, backup import/export, migration from legacy DB v4 and licensing.
- Automated suite: 33/33 passed (last run 2026-10-10); includes protection against adding a child to an account with posted movements.
- Production frontend: npm run build succeeded.
- Headless Chrome on isolated test profile: created fiscal period, seeded chart, issued a 2-line balanced manual journal through UI, displayed trial balance; no error toast. This profile is NOT the user's production data.
- The packaged Tauri Windows app was launched in an isolated WebView2 temporary profile (not the user's production profile); CDP UI smoke passed: accounting route, new fiscal period, chart seed (13), two-line 12,000-rial journal, posted status and trial balance. Test app closed after verification.
- A Tauri NSIS Windows x64 installer was generated successfully: src-tauri/target/release/bundle/nsis/Factor-easyPro_2.0.0-alpha.1_x64-setup.exe (2,252,940 bytes, 2026-10-10 13:02:33 local time).
- Installer SHA256: B2059AF02BF5395B74DB059ADBAB39120C43131EAF6305E37C26FD8B575132B5.
- The installer is **not code signed** (Authenticode Status=NotSigned). NSIS installation itself was not run on the user's working PC, to avoid replacing their existing installation; production install/upgrade rehearsals remain Phase 3.
- No production database was wiped, no installed version replaced, and no prior changes were reset.
- The v2.0.0-alpha.1 installer is a local Phase-1 checkpoint; it has NOT been published as a stable release or uploaded to GitHub.

## Not done in Phase 1 (intentionally assigned later)
- Existing invoice/purchase/treasury actions do NOT automatically post to the new accounting ledger.
- Weighted-average stock valuation, stocktake, returns and invoice correction journal integration are for Phase 2.
- Full legal/financial validation of accounting treatment and tax compliance remains necessary.
- Financial statements and detailed ledger reports are Phase 3; trial balance here covers Phase-1 posted journal data only.
- Installer release labeled stable V2 must wait for Phase 3 acceptance.

## Important operating instructions
1. Before manipulating any real financial records, take an encrypted backup from the existing Settings page and verify restore on a disposable profile.
2. Accounting > periods: add a fiscal year, optionally seed the sample account chart, enter manual journal with balanced integer amounts in rial.
3. Posted journals are immutable; correction is by reversal. A period with drafts cannot be closed.
4. Existing invoices are still managed by legacy data flows until Phase-2 unified posting; do not interpret this Phase-1 trial balance as complete historic books.
5. Do not remove existing code/unfinished modifications from the repository. There were numerous preexisting uncommitted changes before this phase.

## Follow-on dependency contract
Phase 2 must consume AccountingService and Financial Period rather than writing directly to journal stores. It must establish a transaction encompassing invoice, stock, settlement and journal posting, and provide mappings and multi-company tests.
