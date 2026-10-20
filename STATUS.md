# Phase A — executed test evidence

Updated: 2026-10-20

## A03 audit / backup chain

- Environment: GitHub Actions Linux runner; not a local npm installation.
- Command executed by PR Quality Gates: `npm test`.
- Commit: `d4d06c70eea032abcf16443c51837f3338b9e10f`.
- Workflow run: `39373950339`.
- Test job: `118467859111`, conclusion: success.
- Node test summary from job logs: **256 tests, 256 pass, 0 fail**.
- Test suite includes SHA-256 vector, tamper detection, deletion and reordering, tail deletion with/without anchor, legacy backup migration, direct audit-write rejection and accounting regression tests.
- Earlier executed run `39373649718` on commit `c4daaa47`: **254 tests, 254 pass, 0 fail** (test job succeeded).
- No local `npm test` execution was possible because the working repository is not mounted and Remote Desktop is offline.
- Windows native build, external accountant approval and real target-machine backup restore are not included in these test results.
