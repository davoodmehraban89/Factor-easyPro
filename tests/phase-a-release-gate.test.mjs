import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyPhaseARelease } from '../scripts/verify-phase-a-release.mjs';

const manifest = JSON.parse(readFileSync(new URL('../docs/PHASE_A_RELEASE_ACCEPTANCE.json', import.meta.url), 'utf8'));
const args = { acceptance: manifest, packageVersion: '2.0.3',
  desktopVersion: '2.0.3', tag: 'v2.0.3' };

test('release gate: current Phase A is blocked and no public release is authorized by CI', () => {
  assert.throws(() => verifyPhaseARelease(args), /unaccepted/);
});

test('release gate: only exact matching versions, all approvals and valid evidence allow a release', () => {
  const acceptance = structuredClone(manifest);
  for (const [index, req] of acceptance.requirements.entries()) {
    req.accepted = true;
    req.evidence = ['https://github.com/davoodmehraban89/Factor-easyPro/issues/' + (index + 1)];
  }
  const valid = { ...args, acceptance };
  assert.deepEqual(verifyPhaseARelease(valid), { ready: true, tag: 'v2.0.3', gates: 10 });
  assert.throws(() => verifyPhaseARelease({ ...valid, tag: 'v2.0.4' }), /mismatch/);
  assert.throws(() => verifyPhaseARelease({ ...valid, desktopVersion: '2.0.2' }), /mismatch/);
  acceptance.requirements[0].evidence = ['not-a-real-github-reference'];
  assert.throws(() => verifyPhaseARelease(valid), /unaccepted/);
  acceptance.requirements[0].evidence = [];
  assert.throws(() => verifyPhaseARelease(valid), /unaccepted/);
});

test('release gate: duplicate and missing acceptance entries fail closed', () => {
  const accepted = structuredClone(manifest);
  for (const req of accepted.requirements) {
    req.accepted = true;
    req.evidence = ['https://github.com/davoodmehraban89/Factor-easyPro/issues/2'];
  }
  accepted.requirements.push({ ...accepted.requirements[0] });
  assert.throws(() => verifyPhaseARelease({ ...args, acceptance: accepted }), /Duplicated/);
  accepted.requirements.pop();
  accepted.requirements.pop();
  assert.throws(() => verifyPhaseARelease({ ...args, acceptance: accepted }), /Unexpected/);
});

test('release gate: extra gate and malformed evidence suffixes fail closed', () => {
  const acceptance = structuredClone(manifest);
  for (const row of acceptance.requirements) {
    row.accepted = true;
    row.evidence = ['https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/123'];
  }
  acceptance.requirements.push({
    id: 'UNREVIEWED', accepted: true,
    evidence: ['https://github.com/davoodmehraban89/Factor-easyPro/issues/1']
  });
  assert.throws(() => verifyPhaseARelease({ ...args, acceptance }), /Unexpected/);
  acceptance.requirements.pop();
  for (const invalid of [
    'https://github.com/davoodmehraban89/Factor-easyPro/actions/runs/123/extra',
    'https://github.com/davoodmehraban89/Factor-easyPro/issues/123?fake=1',
    'https://github.com/davoodmehraban89/Factor-easyPro/pull/0'
  ]) {
    acceptance.requirements[0].evidence = [invalid];
    assert.throws(() => verifyPhaseARelease({ ...args, acceptance }), /unaccepted/);
  }
});
