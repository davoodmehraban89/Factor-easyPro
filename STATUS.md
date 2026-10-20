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

## A03 2026-10-19 continuation
- CompanyBackupService restore authorization was added at commit 9c0d438e21c11ba6c47561b80e3de7e270defcce.
- Fixed a WeakSet access defect in AuditService at commit 0056fd1748e9222603c7cd8ada89f41ba8ca6c2e.
- Added src/core/AuditChain.js at commit 567b9af1759df9448e01b9982bfe6208bcff545f (SHA-256 and a standalone chain verifier). This is NOT yet integrated into audit event writes or backup metadata; no end-to-end chain claims.
- Attempts to integrate hash code into AuditService and add chain regression tests were blocked by tool safety checks. No tests were run locally.
- Legacy audit migration, full company restore compatibility and trusted backup anchor remain unfinished.
- Client-side security boundary: the StorageService/AuditService checks defend normal application code paths, not a malicious user with IndexedDB/devtools or local file access. A backup-contained hash anchor is not independently trusted: an attacker who can rewrite the backup can rewrite its anchor. Signed or externally anchored checkpoints are needed for adversarial tamper evidence. A bare hash chain cannot detect tail deletion without an independently retained head.

## Independent A03 validation branch (2026-10-20)
- Branch: fix/a03-chain-validation-20261020; draft PR #116; not accepted or merged.
- Actual GitHub Actions npm test run 39373562237, commit 1d986c1b23f01eff562c2819a7f34153e7fc1fe6: 253 tests, 248 passed, 5 failed, exit code 1. Failures: A02 audit rollback, A03 company scope, A03 append-only protection (2), accounting backup round trip. This run predates current branch and does not verify current changes.
- No local npm test was executed: local repository absent in this runtime, GitHub DNS unavailable, remote desktop offline/quota exhausted. Later PR runs have been cancelled by subsequent pushes or are pending.
- Fixed missing Auth import in tests/a03-company-scope-immutable-stores.test.mjs on this branch; no passing run verified yet.
- No independent reviewer agents were launched; no three-agent approval claimed.

## A03 CI request 2026-10-20
- Implementation commit 293239951b6c15df766e891fd386b54c6f99ec51 adds anchored full backups, strict company backup order verification, deterministic v6 replay compatibility, and end-to-end tampering tests. No pass claim before CI.
- PR #116 temporarily targets main to activate the existing pull_request quality workflow; remains draft and unmerged. Remote Desktop excluded.

## A03 CI evidence: 2026-10-20, run 39374384074
- SHA 46f5dd613b543778e27c498a54c664f9edf01845; completed failure, npm test: 257 tests, 251 passed, 6 failed, exit 1.
- Failures: A02 audit rollback; A03 full restore rejects modified event (error message mismatch, integrity rejection correctly occurs); A03 v6 migration; A03 company scope; A03 append-only direct protection; A03 clear rollback.
- Root cause of five fixture failures: restoreHistorical validated legacy actorId/sourceId/commandKey before deterministic migration defaults were applied. Fix permits missing legacy metadata but rejects present invalid values. Sixth test now accepts earlier chain integrity rejection rather than requiring a later immutable-overwrite error. The rejection and rollback assertion remain mandatory.

## A03 completed CI evidence 2026-10-20 (pre-STATUS commit)
- PR quality workflow run 39374506277, SHA 9563296884b7131a97a265a296d99977d7522fce: completed SUCCESS. Linux npm test 257 passed / 0 failed; Windows npm test 257 passed / 0 failed. Frontend build, production npm audit, and Windows Tauri installer build all succeeded.
- This evidence verifies the application code at the stated SHA. A STATUS-only documentation commit will require its own final-head CI run before completion.
- Independent three-agent review remains NOT VERIFIED: this execution environment does not expose a multi-agent reviewer launch capability. No approval or merge is claimed.
- Local clone/npm test remains unavailable because container DNS cannot resolve github.com; GitHub Actions is the actual test runner.

## A03 three-pass review initiated (2026-10-20)
- Three sequential code-review passes were performed against PR #116 because no callable subagent/Task tool is exposed. These are NOT independent agents.
- Functional pass: previous completed CI run 39374969382, SHA 95f6c976a04a72e2ddaf27f20773994e871e0250, Linux 257/257, Windows 257/257. Edge coverage gaps found; new tests added, pending new CI.
- Security/quality pass: found malformed non-array input could throw from verifyChain; addressed with invalid result. Public authorizeRestore remains a client trust-boundary limitation, not a cryptographic authorization mechanism. O(n) audit-history read per append remains a scalability concern; no unverified performance claim.
- Edge-case pass: missing explicit tests for empty/single chains, mixed legacy+hashed history, corrupted JSON, wrong anchors and concurrent writes. Added regression tests; results pending CI.
- Final approval and merge remain withheld until CI and repeat review.

- GitHub Actions run 39376283188 on SHA 894e1f54409a7f12455ee27b6e3d8b80f4899a55: completed FAILURE, npm test 262 total / 260 passed / 2 failed. Failures A02 rollback and A03 direct append-only protection; root cause: eager genesis-based normalization of a legacy-only snapshot intended to append after existing audit history. Changed legacy-only imports to defer chain index/hash to the active restore transaction. Mixed legacy+hashed chains remain prevalidated. Await rerun.

- Security review found public AuditService.authorizeRestore permission mint. Replaced with scoped restoreFromBackup workflow, removed public mint and added negative regression test. CI pending; no pass claim for new code.
