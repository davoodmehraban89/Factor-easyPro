# AGENTS.md — Factor-easyPro execution contract

> **Status:** Proposed in [Issue #142](https://github.com/davoodmehraban89/Factor-easyPro/issues/142) and ADR-003. This file documents the owner's requested operating model; PR creation does **not** prove independent review or acceptance. Follow repository policies and applicable tool permissions.

## Start here on every task

1. Read `PROJECT_STATUS.md` as the existing ongoing status log and `docs/PHASE_A_RELEASE_ACCEPTANCE.json` as the machine-readable phase-A gate authority. Also consult `docs/GITHUB_EXECUTION_PLAN_FA.md`, `docs/PHASE_A_EXIT_RUNBOOK_FA.md`, `docs/PHASE_A_BACKLOG_FA.md`, and relevant `docs/adr/` decisions.
2. Verify live `main` commit SHA, latest public Release, open PRs/issues, relevant GitHub Actions and check SHA; do not substitute a conversation's cached state.
3. Do not create parallel status ledgers; `STATUS.md` can contain historical notes conflicting with later acceptance facts. Resolve conflicts against the acceptance JSON and independently verifiable newer evidence.
4. Keep Phase B behind Phase A release entry criteria and Phase C behind Phase B. Research is allowed; premature production release is not.

## Roles: 1 PM + 5 execution roles + 3 **independent** controls

- **PM:** scope exactly one nonduplicate task and coordinate ownership/dependencies, tests, base/head SHAs, risks, rollback and handoff.
- **A1 — Financial Accounting & Treasury:** double entry, fiscal periods, immutable posted journals, cash/bank/cheques, settlements, reconciliations.
- **A2 — Sales & Inventory:** purchase/sale/returns, stock movements, weighted-average valuation, warehouse and domain integration.
- **A3 — Architecture & Data Integrity:** Tauri/Vite/IndexedDB, atomic transactions, audit, company isolation, migrations and reliable encrypted backup/restore.
- **A4 — Windows UX & Reporting:** Persian RTL, keyboard flows, reports, print, offline Windows/WebView2, installer and upgrades.
- **A5 — QA, Security & DevSecOps:** tests, threat modeling, access control, license controls, dependency/CI/Windows/performance audits.
- **C1 — independent technical/security review:** complete Diff, tests, permissions, architecture, migration and regression; `PASS/FAIL/BLOCKED`.
- **C2 — independent financial/business review:** entry balance, inventory/treasury invariants, period and company separation, independent calculations; `PASS/FAIL/BLOCKED`.
- **C3 — independent release governance:** requirements, reviewer independence, SHA-specific CI, native Windows evidence, hashes, rollback, merge/release authorization; `ACCEPT/REVISE/REJECT/BLOCKED`.

**Nine roles are not nine autonomous or independent agents.** Use real tools/reviewers only if available and verified. Sequential review passes by a single AI are **internal QA, not independent signoffs**. If an actual independent reviewer is unavailable, record `BLOCKED` for that signoff; never fabricate reviewer identities or count a self-review as acceptance. Accounting-sensitive final acceptance requires a qualified independent accountant where specified.

## Single-task lifecycle

- **Define:** Issue/phase, problem, accountable execution role, contributors, base SHA, allowed/prohibited paths, inputs/outputs, acceptance checks, positive/negative tests, financial/security risk and rollback. Avoid overlapping unmerged PR scope.
- **Implement:** separate branch, minimal changes, no unnecessary file rewrites. Document data/schema impact, including `none` where accurate.
- **Verify:** run relevant `npm ci`, `npm test`, `npm run build`, production dependency audit and `git diff --check` with actual runner and results. Inspect relevant Actions on **exact head SHA**, especially `pr-quality-gates.yml` and for native changes `windows-vm-native-lab.yml`. Mark unexecuted checks `NOT_RUN`; do not imply they passed.
- **Open PR:** reference Issue, specify actual base/head SHAs, changed files, CI run URLs, Windows native status, synthetic-versus-real data and unverified scenarios, rollback and risk. Do not auto-merge your own PR.
- **Audit and revise:** C1, C2 and C3 must be completed independently before final acceptance. A new substantive head SHA invalidates reviews/tests as appropriate and requires re-verification.
- **Merge:** only after independent acceptance and authorized branch-policy checks; then re-fetch `main`, CI, Issue and update `PROJECT_STATUS.md` and gate JSON **only with evidence**. No automatic public Release.
- **Report:** Issue/phase, objective, prior status, PM and execution role(s), base/head SHA, branch/PR, changed paths, actual tests/Actions, installed-Windows status, C1/C2/C3 and their independence, real-data status, unresolved risks, rollback, final state and one next action. Use `ACCEPTED`, `REVISION_REQUIRED`, `REJECTED`, `BLOCKED` or `UNVERIFIED`.

## Non-negotiable safety and truthfulness

- Never mutate real customer data, secrets, private keys or proprietary backups without separately verified authorization. Never publish customer data/secrets to source, CI logs or public artifacts.
- No destructive correction of finalized financial journals; create linked reversals under domain-approved, atomic and auditable workflows. Enforce service-boundary permissions, license checks and company scoping.
- Unsafe migrations require encrypted backup, isolated rehearsal, before/after reconciliation, version support and rollback. Holoo proprietary backup support is not established by CSV preflight alone.
- Unit tests, browser tests, Windows VM installation, physical printer tests, real-device testing and actual power-loss trials are **different evidence types**. Don't promote a result from one to another.
- Current local-first single-machine architecture must not be marketed as verified multiuser/networked accounting.
- A03 and A04 being marked accepted in the gate manifest does not accept the remaining eight gates. Do not change gate booleans merely because CI passed.
- Davood-AI-OS interoperability is a future integration goal unless authenticated integration/evidence is available. Don't assert that it is connected.

**Decision reference:** [ADR-003](docs/adr/ADR-003-project-governance-5-1-3-fa.md). **Tracking:** [#142](https://github.com/davoodmehraban89/Factor-easyPro/issues/142); main-branch protection dependency [#19](https://github.com/davoodmehraban89/Factor-easyPro/issues/19).
