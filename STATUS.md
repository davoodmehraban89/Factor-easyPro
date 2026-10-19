# Phase A acceptance status

Updated: 2026-10-19

## Execution order
A03 → A04 → A01 → A05 → A06 → A07 → A08.

## Closed gates
None. The authoritative acceptance manifest `docs/PHASE_A_RELEASE_ACCEPTANCE.json` has all gates unaccepted.

## A03 — in progress (direct-write bypass hardening)
- Current implementation: AuditService brands authorized audit records; StorageService.transaction rejects unbranded audit rows through add/put/putRaw; raw helpers _exec/_tx and bulkPut reject direct audit writes.
- Restores: CompanyBackupService and StorageService.importAll route audit history through AuditService.restoreHistorical; fixture tests updated.
- Added protection tests before guard, plus negative direct add/put/putRaw rollback test.
- Security limitation: AuditService.restoreHistorical is exported for validated restore flows and is not yet restricted to a restore-only capability; direct IndexedDB access via StorageService.init() or browser developer tools remains outside service-layer protection.
- Latest CI must be checked before merge. No acceptance claim.
- Previous audited immutable-store hardening merged: PR #114, merge commit `3077d42d0061b05f8bf623f77ca18869a1581d1c`.
- Current branch: `gate/a03-audit-metadata-validation-20261019`.
- Current changes: reject invalid audit business dates and overlong metadata identifiers; add positive/negative atomic rollback tests.
- Acceptance criteria outstanding: full audit metadata and company/actor integrity; service-layer mutation bypass assessment; atomic failure cases; complete passing CI with evidence; independent gate review.
- CI status: original PR checks ran; a subsequent attempted history-only restriction was reverted because it would break legitimate transactional test/seed paths. Latest head requires fresh CI; do not mark accepted before successful checks.

## A04 — queued, not accepted
- Existing unmerged branch: `fix/a04-reject-mixed-company-backup-20261019`, commit `3a059b98c31a032a6725e07cb15999dce6461c2d`.
- Outstanding: positive/negative restore tests, corrupt/interrupted restore, two-version compatibility, company isolation, CI.

## Remaining gates
A01, A05, A06, A07, A08: not accepted; proceed in specified order after A03/A04.

## External verification, not simulated
- A02: independent accountant sign-off.
- DATA_BACKUP: restore of actual backup on actual target system.

## Next action
Review CI on latest A03 PR head, fix failing fixtures and ensure restore authorization cannot be invoked outside validated restore. Do not merge red CI. Once all A03 acceptance criteria have evidence, update manifest and this file, then proceed to A04.

## A03 continuation — restore authorization and hash chain
- Added transaction/company-scoped restore authorization in AuditService and negative direct-call regression test.
- Full restore now registers company-scoped grants before historical inserts.
- BLOCKER: CompanyBackupService has not yet been updated to register grants; company restore currently risks rejection. Attempts to update the file were blocked by tool safety checks. Do not merge or mark gate accepted.
- Existing legacy fixture rows lack some new metadata fields and must be updated with complete valid audit records.
- Hash chain (prevHash, eventHash, verifyChain) has NOT been implemented. Tamper, deletion and reordering tests are outstanding. A local unanchored hash chain cannot prove deletion of the final event; trusted head checkpoint required.
- CI on current head is not yet verified. Next: repair company restore and fixture compatibility, then implement and test chain before merge.
