import test from 'node:test';
import assert from 'node:assert/strict';
import { planIsolatedHolooRestore } from '../src/core/HolooIsolatedRestorePlan.mjs';

const token = '0123456789abcdef0123456789abcdef';
const sample = () => ({
  backupFile: 'D:\\MigrationStaging\\copy.bak',
  sqlDataDirectory: 'C:\\SqlMigrationData',
  restoreToken: token,
  files: [
    { logicalName: 'Data', type: 'D', sizeBytes: 33554432 },
    { logicalName: 'Log', type: 'L', sizeBytes: 8388608 }
  ]
});

test('isolated plan never executes, imports, replaces or destroys source data', () => {
  const p = planIsolatedHolooRestore(sample());
  assert.equal(p.databaseName, 'FinoraHoloo_' + token);
  assert.equal(p.moves.length, 2);
  assert.deepEqual(p.moves.map(f => f.targetPath), [
    'C:\\SqlMigrationData\\FinoraHoloo_' + token + '_file01.mdf',
    'C:\\SqlMigrationData\\FinoraHoloo_' + token + '_file02.ldf'
  ]);
  assert.match(p.restoreSql, /IF DB_ID\(N'FinoraHoloo_[0-9a-f]{32}'\) IS NOT NULL THROW/);
  assert.match(p.verifySql, /^RESTORE VERIFYONLY FROM DISK/);
  assert.match(p.restoreSql, /RESTORE DATABASE \[FinoraHoloo_[0-9a-f]{32}\]/);
  assert.doesNotMatch(p.restoreSql, /\bWITH\s+REPLACE\b/i);
  assert.doesNotMatch(p.restoreSql, /\bDROP\b|\bALTER DATABASE\b/i);
  assert.equal(p.restoreExecuted, false);
  assert.equal(p.databaseModified, false);
  assert.equal(p.canImport, false);
  assert.equal(p.estimatedSourceFileBytes, '41943040');
});

test('same isolated filenames for input order; every data/log item is moved', () => {
  const s = sample();
  s.files.splice(1, 0, { logicalName: 'Data2', type: 'D', sizeBytes: 1000 });
  const p = planIsolatedHolooRestore(s);
  assert.equal(p.moves.length, 3);
  assert.ok(p.moves[1].targetPath.endsWith('.ndf'));
  assert.ok(p.moves[2].targetPath.endsWith('.ldf'));
  assert.equal((p.restoreSql.match(/\bMOVE N'/g) ?? []).length, 3);
});

test('escapes apostrophes in backup filenames and logical SQL file names', () => {
  const s = sample();
  s.backupFile = "D:\\Backup\\O'Connor.bak";
  s.files[0].logicalName = "customer'; DROP DATABASE master;--";
  const p = planIsolatedHolooRestore(s);
  assert.ok(p.restoreSql.includes("O''Connor.bak'"));
  assert.ok(p.restoreSql.includes("customer''; DROP DATABASE master;--'"));
  assert.equal((p.restoreSql.match(/\bRESTORE DATABASE \[/g) ?? []).length, 1);
  assert.doesNotMatch(p.restoreSql, /WITH REPLACE/i);
});

test('rejects network, device, traversal, relative, ADS and ambiguous paths', () => {
  const bad = [
    '\\\\server\\share\\a.bak', '\\\\?\\C:\\temp\\a.bak',
    'relative\\a.bak', 'C:\\safe\\..\\a.bak', 'C:\\safe\\.\\a.bak',
    'C:\\safe\\a.bak:stream', 'C:/safe/a.bak', 'C:\\bad\\trailing.\\a.bak',
    'C:\\safe\\', 'C:\\bad\\a\nbak'
  ];
  for (const path of bad) {
    const s = sample(); s.backupFile = path;
    assert.throws(() => planIsolatedHolooRestore(s), /A02_UNSAFE_LOCAL_PATH/, path);
  }
});

test('rejects generated restore db without unambiguous collision-resistant token', () => {
  for (const t of ['', '../master', '123', 'G'.repeat(32), 'A'.repeat(32), null]) {
    const s = sample(); s.restoreToken = t;
    assert.throws(() => planIsolatedHolooRestore(s), /A02_RESTORE_DESTINATION_OR_TOKEN_INVALID/);
  }
});

test('rejects malformed/duplicate logical file list and unsafe record types', () => {
  const cases = [
    [],
    [{ logicalName:'Data',type:'D',sizeBytes:10 }],
    [
      { logicalName:'Data',type:'D',sizeBytes:10 },
      { logicalName:'data',type:'L',sizeBytes:10 }
    ],
    [
      { logicalName:'Data',type:'D',sizeBytes:10 },
      { logicalName:'Log',type:'S',sizeBytes:10 }
    ],
    [
      { logicalName:'Data',type:'D',sizeBytes:10 },
      { logicalName:'Log',type:'L',sizeBytes:Number.MAX_SAFE_INTEGER + 1 }
    ],
    [
      { logicalName:'Data',type:'D',sizeBytes:10 },
      { logicalName:'Log\nInjected',type:'L',sizeBytes:10 }
    ]
  ];
  for (const files of cases) {
    const s = sample(); s.files = files;
    assert.throws(() => planIsolatedHolooRestore(s), /A02_/);
  }
});

test('rejects nonexistent log, nonexistent data and backup-set ambiguity', () => {
  const s = sample(); s.files = [s.files[0], { logicalName:'Data2',type:'D',sizeBytes:15 }];
  assert.throws(() => planIsolatedHolooRestore(s), /A02_DATA_AND_LOG_REQUIRED/);
  s.files = sample().files; s.backupSetPosition = 2;
  assert.throws(() => planIsolatedHolooRestore(s), /A02_BACKUP_SET_UNSUPPORTED/);
});

test('restoration output is frozen and mandatory checks never claim completion', () => {
  const plan = planIsolatedHolooRestore(sample());
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.moves));
  assert.ok(plan.moves.every(Object.isFrozen));
  for (const key of [
    'requiresExclusiveDedicatedLocalInstance', 'requiresTargetFileNonexistenceCheck',
    'requiresFileSpaceAndVersionChecks', 'requiresExplicitOwnerConsent',
    'requiresAccountantReconciliation'
  ]) assert.equal(plan[key], true);
  assert.equal(plan.sourceDataRead, false);
});
