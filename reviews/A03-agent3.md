# A03 Edge cases and real-user testing — sequential pass 3 (not an independent agent)

Fresh-read evidence: src/core/AuditChain.js lines 31-65; SettingsController.js lines 165-203; CompanyBackupService.js lines 38-66; tests/a03-audit-chain.test.mjs.

Findings: no explicit tests for empty/single log, partial hash metadata, mixed legacy prefix and hashed suffix, corrupt JSON, wrong anchor, concurrent writes. Added tests and prepareAuditRows migration/validation helper. Await CI to establish behavior.

Review method: sequential pass, not an independent subagent.

Regression finding: import of a legacy-only snapshot into an existing chain failed; covered by pre-existing A02 rollback and A03 append-only tests. Fixed; CI rerun pending.
