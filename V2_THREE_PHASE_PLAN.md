# Factor-easyPro V2 — Three-phase implementation contract
Date: 2026-10-10 | Status: VERSION 2.0.0 RELEASE VALIDATED (63/63 tests, Windows build and isolated native-app UI smoke); GitHub publishing follows | Language: Persian product
Release candidate: 2.0.0; automated 63/63 tests passed; Windows WebView2 isolated acceptance passed. See V2_RELEASE_ACCEPTANCE.md for verified scope and limitations.

## Product definition
Keep the existing Tauri/Vite/IndexedDB desktop program and preexisting user data. Build an affordable offline-first Iranian retail accounting application. Public Holoo features serve only as a functional benchmark; do not copy proprietary source, protected account charts or UI assets. Maintain backward compatibility and avoid unrequested rewrites.

## Phase 1 — Accounting foundation and data integrity
**Owner:** Accounting architecture and implementation. **Reviewer:** independent quality/data-integrity verification.
- Accounting hierarchy: group, general, subsidiary, detail with parent/type/company validation.
- Optional idempotent seed chart, explicitly NOT a proprietary Holoo chart.
- Fiscal periods: open/closed, overlap detection, Jalali validation, admin-only close.
- Manual journals: draft (editable/discardable), posted balanced entries, posting source deduplication, ledger lines, reversal without destructive edits.
- Atomic IndexedDB multi-store financial transactions, company-scoped access, trial balance for posted journals.
- Real isolated UI route for phase-one accounting operations (no changes to existing invoice posting).
- Company-scoped encrypted backup export / atomic restore of Phase-1 records, reject foreign company collisions, test v4->v5 IndexedDB migration.
- Evidence: unit/integration tests, Chromium smoke test on disposable profile, production Vite build, Windows bundling validation.
**Exit:** all Phase-1 acceptance tests pass, no destructive changes to user records, limitations documented.
**Explicit exclusion:** No automatic posting from existing invoices/treasury until a unified Phase-2 transaction is implemented.

## Phase 2 — Complete integrated retail and financial flows
**Owner:** transactional backend/inventory lead. **Reviewer:** accounting and regression lead.
- Create event-to-ledger posting rules for sales, purchases, returns, expenses, receipts and payments, including tax/discount treatment.
- Associate account/detail mappings and financial period with each operation. Enforce exactly-once posting per event and revision; use reversal for corrections.
- Atomic item rows, stock movements, inventory valuation, receivable/payable ledgers and financial journal posting.
- Stock valuation using defined weighted-average policy; quantity precision distinct from integer IRR amounts; no silent negative stock.
- Stocktake count sessions, base snapshot, discrepancy review/approval, adjustment movements and balanced journal.
- Transactional cash/bank/cheque flows, partial settlement and multi-method payments.
- Keep existing forms working and improve keyboard, barcode and cashier workflows only where necessary.
- High-risk tests: partial failure rollback, duplicate event, returns, cross-company access, concurrent posting, finance/stock reconciliation.
**Exit:** from purchase to sale to settlement, all stock and financial totals reconcile against known sample scenarios.

## Phase 3 — V2 final release and acceptance
**Owner:** delivery/operations lead. **Reviewer:** independent quality/security lead.
- Accounting reports: journal/daybook, general/subsidiary ledger, trial balance, balance sheet and P&L, drilldown and exports.
- Role enforcement at service layer, operational audit trail and company isolation.
- Comprehensive print/layout QA (Arabic/Persian fonts, multipage documents), UI accessibility and relevant regression fixes.
- Full upgrade and restore rehearsals from 1.1.x with checksums/reconciliation, no data loss.
- Independent end-to-end validation on disposable and restored fixtures; security hardening, performance checks.
- Build final Windows x64 installer (version 2.0.0), verify installer/hash and publish GitHub Release download link after acceptance.
**Exit:** a Windows installer of the complete V2 product, docs and verified release link, not an unfinished prototype.

## Rules of engagement
- Never reset an uncommitted working tree or mutate actual user's accounting data for tests.
- Work only on authorized local source, avoid publishing partial V2 as stable.
- Keep development changes in the live source tree and update this plan/delivery notes after each phase.
- If an acceptance requirement cannot be demonstrated, mark it pending (not complete).
- User's next instruction "مرحله بعدی" advances exactly one phase.
