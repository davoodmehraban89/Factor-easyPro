// A02: pure SQL Server isolated restore plan generator. NO execution or I/O.
// Input must be obtained from a privately verified RESTORE FILELISTONLY result.
// Never send generated SQL/physical paths/logical names to public CI or logs.
const reject = code => { throw new Error(code); };
const safeWindowsPath = input => {
  if (typeof input !== 'string' || input.length > 240 ||
      !/^[A-Za-z]:\\/.test(input) || input.includes('/') ||
      /[<>"|?*\u0000-\u001f]/.test(input)) reject('A02_UNSAFE_LOCAL_PATH');
  const parts = input.slice(3).split('\\');
  if (parts.some(p => !p || p === '.' || p === '..' ||
      p.endsWith(' ') || p.endsWith('.') || p.includes(':'))) {
    reject('A02_UNSAFE_LOCAL_PATH');
  }
  return input;
};
const sqlString = text => {
  if (typeof text !== 'string' || text.length === 0 ||
      /[\u0000-\u001f]/.test(text)) reject('A02_SQL_LITERAL_INVALID');
  return "N'" + text.replaceAll("'", "''") + "'";
};

/**
 * Generate but NEVER execute a restore plan. The caller must later verify:
 * dedicated local SQL instance, backup/version/VERIFYONLY, target files absent,
 * adequate disk space, admin/user consent, and rollback policy.
 */
export function planIsolatedHolooRestore({
  backupFile, sqlDataDirectory, restoreToken, backupSetPosition = 1,
  files
} = {}) {
  const source = safeWindowsPath(backupFile);
  const directory = safeWindowsPath(sqlDataDirectory);
  if (source.toLowerCase() === directory.toLowerCase() ||
      !/^[0-9a-f]{32}$/.test(restoreToken ?? '')) {
    reject('A02_RESTORE_DESTINATION_OR_TOKEN_INVALID');
  }
  if (backupSetPosition !== 1) reject('A02_BACKUP_SET_UNSUPPORTED');
  if (!Array.isArray(files) || files.length < 2 || files.length > 16) {
    reject('A02_FILELIST_COUNT_INVALID');
  }
  const db = 'FinoraHoloo_' + restoreToken;
  const names = new Set();
  let data = 0, logs = 0;
  const moves = files.map((f, index) => {
    if (!f || typeof f !== 'object' || Array.isArray(f) ||
        !['D', 'L'].includes(f.type) ||
        typeof f.logicalName !== 'string' ||
        f.logicalName.length > 128 ||
        !f.logicalName.trim() ||
        /[\u0000-\u001f]/.test(f.logicalName) ||
        !Number.isSafeInteger(f.sizeBytes) || f.sizeBytes <= 0) {
      reject('A02_FILELIST_ENTRY_INVALID');
    }
    const canonical = f.logicalName.toLocaleLowerCase('en-US');
    if (names.has(canonical)) reject('A02_FILELIST_DUPLICATE_LOGICAL_NAME');
    names.add(canonical);
    if (f.type === 'D') data++; else logs++;
    const extension = f.type === 'L' ? 'ldf' : data === 1 ? 'mdf' : 'ndf';
    const target = directory + '\\' + db + '_file' +
      String(index + 1).padStart(2, '0') + '.' + extension;
    return Object.freeze({
      sourceLogicalName: f.logicalName,
      targetPath: target,
      type: f.type,
      sourceBytes: f.sizeBytes
    });
  });
  if (data < 1 || logs < 1) reject('A02_DATA_AND_LOG_REQUIRED');
  const clause = moves.map(f =>
    'MOVE ' + sqlString(f.sourceLogicalName) + ' TO ' + sqlString(f.targetPath)
  ).join(', ');
  const base = 'FROM DISK = ' + sqlString(source) +
    ' WITH FILE = 1, ' + clause;
  const verifySql = 'RESTORE VERIFYONLY ' + base + ';';
  const existsCheck =
    'IF DB_ID(' + sqlString(db) + ') IS NOT NULL ' +
    "THROW 51001, 'A02_ISOLATED_DATABASE_ALREADY_EXISTS', 1;";
  const restoreSql = existsCheck + '\nRESTORE DATABASE [' + db + '] ' +
    base + ', RECOVERY, STATS = 10;';
  const totalBytes = files.reduce((sum, f) => sum + BigInt(f.sizeBytes), 0n);
  return Object.freeze({
    databaseName: db,
    moves: Object.freeze(moves),
    estimatedSourceFileBytes: totalBytes.toString(10),
    verifySql, restoreSql,
    // A plan is NOT approval to run it; executor is intentionally absent.
    requiresExclusiveDedicatedLocalInstance: true,
    requiresTargetFileNonexistenceCheck: true,
    requiresFileSpaceAndVersionChecks: true,
    requiresExplicitOwnerConsent: true,
    requiresAccountantReconciliation: true,
    sourceDataRead: false,
    databaseModified: false,
    restoreExecuted: false,
    canImport: false
  });
}
