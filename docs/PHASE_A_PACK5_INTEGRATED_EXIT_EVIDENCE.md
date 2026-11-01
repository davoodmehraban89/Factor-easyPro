# Phase A package 5: integrated exit evidence (NO-GO)

## Scope, version and authorization

- Repository: `davoodmehraban89/Factor-easyPro`.
- Integration ancestry verified by `git merge-base --is-ancestor`: PR #183 head `3d2016749994f8df61d5df9937260522b2a98cd5` and PR #190 head `2933c9e5e0bd5509754f73a97a79c549452d656d` are both ancestors of PR #191 head `0a2f8ff5259f6fa535ae92eca85e2e9987cc8b30`.
- Pack 5 branch: `fix/phase-a-pack5-integrated-evidence-20261101` based on PR #191. Final head is the PR head; all acceptance evidence must be checked against that exact SHA after push.
- PRs #183/#190/#191 remain Draft. No merge into main, public release, private signing key, owner-data modification or independent sign-off is authorized.

## Technical remediation

- `InvoiceController._rebuildStockMovements` now performs movement removal and recreation inside a single IndexedDB transaction over `stock_movements` and `products`.
- It validates the active company and product company. A foreign product reference aborts the transaction, preserving existing stock movements.
- New regression cases assert rollback and rejection of a foreign-company invoice. Existing cross-company movement protection remains covered.
- Residual limitation: legacy invoice save and stock rebuild are separate transactions. Do not represent legacy invoice issuance as fully atomic; production finance-posted issuance uses a separate posting path. A migration/upgrade and finance sign-off must evaluate this legacy boundary.

## Reproducible checks on authorized Windows workstation

- `npm test`: **427 passed / 427 total / 0 failed** (including migration, backup/restore, accounting, security and stock regression test files).
- `npm run build`: **success**; non-blocking Vite warning for output chunks larger than 500 kB remains.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/a02-powershell-parse-gate.ps1`: **pass**, 8 scripts parsed; no SQL connection, no owner backup imported.
- `node scripts/a08-benchmark.mjs`: synthetic fake-indexeddb, 10,000 products, 50,000 invoices, 5 companies. Company invoice read p50 291.38 ms / p95 382.29 ms; full backup export 390.61 ms; Node RSS 407.3 MiB, heap used 253.05 MiB. **Not native WebView2 or customer performance.**
- `node scripts/verify-phase-a-release.mjs v2.0.3`: **exit code 1 (expected fail-closed)**; release notes still unpublished draft. This is not a passing release gate.
- GitHub CI exact-head results are documented in the draft PR description after verification. Windows local test success is not equivalent to production sign-off.

## Independent review perspectives (internal only, NOT independent external sign-off)

1. Financial correctness: payment overrun/concurrency tests and stock-movement cross-company rollback; actual journal, refunds, historic VAT and opening balances still need external reconciliation.
2. Security/data integrity: active-company guard, transaction abort, append-only and backup tests; actual licensing/signing, real backup restore and key custody remain unverified.
3. Windows quality: Vite build, PowerShell parser and GitHub native lab evidence; real destination printer, installed WebView2 soak and hardware power-loss tests remain unverified.

## Ten-gate acceptance decision

| Gate | Accepted in manifest | Missing acceptance evidence | Responsible party |
| --- | --- | --- | --- |
| A01 | No | Independent reconciliation of returns, refunds, VAT, inventory and journal against approved financial reference | Independent accountant |
| A02 | No | Authorized isolated Holoo migration and signed opening-balance/count reconciliation | Data owner and migration QA |
| A03 | Yes (previous) | Reconfirm unchanged audit/permission invariants on final integrated SHA; previous acceptance retained | Security QA |
| A04 | Yes (previous) | Reconfirm restore/immutable posting invariants on final integrated SHA; previous acceptance retained | Data integrity QA |
| A05 | No | Signed representative treasury, cheque, period-close and ledger reconciliation | Independent accountant |
| A06 | No | Valid production license/signing and security-owner evidence without exposing keys | Security/release owner |
| A07 | No | Real Windows target install/upgrade and Persian RTL physical printer sign-off | Windows QA / operator |
| A08 | No | Native WebView2 thresholds, extended soak and real failure/recovery evidence | Performance QA |
| INDEPENDENT_QA | No | Named, independent accountant/QA acceptance record and discrepancy resolution | Independent accountant/QA |
| DATA_BACKUP | No | Authorized owner-data encrypted pre-upgrade backup, SHA-256 and witnessed successful restore | Data owner / backup QA |

Manifest: `docs/PHASE_A_RELEASE_ACCEPTANCE.json` contains **2 accepted / 8 unaccepted**. Existing GitHub CI links for unaccepted gates are supporting engineering evidence, not sign-off. A03/A04 were accepted previously; do not treat their old CI runs as proof of this final SHA without rechecking.

**Decision: NO-GO.** No phase B production start, merge or public release is justified. All eight open gates require the specified external evidence and/or authorized environment access. Technical package completion is not equivalent to phase-A acceptance.