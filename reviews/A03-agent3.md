# A03 Edge cases and real-user testing — sequential pass 3 (not an independent agent)

Fresh-read evidence: src/core/AuditChain.js lines 31-65; SettingsController.js lines 165-203; CompanyBackupService.js lines 38-66; tests/a03-audit-chain.test.mjs.

Findings: no explicit tests for empty/single log, partial hash metadata, mixed legacy prefix and hashed suffix, corrupt JSON, wrong anchor, concurrent writes. Added tests and prepareAuditRows migration/validation helper. Await CI to establish behavior.

Review method: sequential pass, not an independent subagent.

Regression finding: import of a legacy-only snapshot into an existing chain failed; covered by pre-existing A02 rollback and A03 append-only tests. Fixed; CI rerun pending.

Installed Windows VM review finding: workflow 39376822375 on SHA f83b8e6 failed at tests/windows-vm-installed-tauri-cdp.cjs:276, because the native smoke fixture directly wrote to immutable audit_events via tx.put. Production guard correctly rejected it. Replaced only fixture seeding with the validated v6 backup import path; immutable conflict/rollback assertions unchanged. Pending real native VM rerun.

## Final sequential re-review — APPROVED (A03 edge and real-user scope; zero open issues)
- Re-read AuditChain.js, SettingsController.js, the A03 edge tests and tests/windows-vm-installed-tauri-cdp.cjs:271-289.
- Evidence: CI 39377639299 on 59dbc4beba2172cafdfd6c380adfa6c0aba6b445 passed 263/263 Linux and 263/263 Windows. Real installed NSIS/WebView2 native VM lab 39377639277 on same SHA completed SUCCESS, including migration and immutable-history rollback scenario.
- Covered: empty/single chain, malformed/partial hash fields, mixed legacy+hashed records, corrupt JSON, wrong anchor, four tamper types, concurrent writes, and native v6 backup recovery.
- Previously failing native fixture used direct audit tx.put; corrected to validated v6 import without weakening the immutable-store guard. No remaining A03 edge-case findings in tested scenarios.
- This was a sequential assistant review pass, NOT an independent subagent.
