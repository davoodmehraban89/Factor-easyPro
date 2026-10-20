# Phase A — executed test evidence

Updated: 2026-10-20

## A03 audit / backup chain

- Environment: GitHub Actions Linux runner; not a local npm installation.
- Command executed by PR Quality Gates: `npm test`.
- Commit: `32d26c61913e7e95c08e52015751b5d829dd403f`.
- Workflow run: `39373827240`.
- Test job: `118467388907`, conclusion: success.
- Node test summary from job logs: **255 tests, 255 pass, 0 fail**.
- Test suite includes SHA-256 vector, tamper detection, deletion and reordering, tail deletion with/without anchor, legacy backup migration, direct audit-write rejection and accounting regression tests.
- Earlier executed run `39373649718` on commit `c4daaa47`: **254 tests, 254 pass, 0 fail** (test job succeeded).
- No local `npm test` execution was possible because the working repository is not mounted and Remote Desktop is offline.
- Windows native build, external accountant approval and real target-machine backup restore are not included in these test results.
