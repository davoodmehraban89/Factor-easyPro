#requires -Version 5.1
<#
A02: optional read-only SQL Server BACKUP metadata preflight.
- Existing *local named* SQL Server instance only. No network/remote credentials.
- No CREATE DATABASE, RESTORE DATABASE, service controls, setup or import.
- Owner's source backup stays on their device. No source metadata is logged.
- This is a developer/diagnostic bridge, not the final user-facing wizard.
#>
[CmdletBinding()]
param(
    [string]$BackupPath = '',
    [ValidatePattern('^[A-Za-z][A-Za-z0-9_]{0,31}$')]
    [string]$InstanceName = 'FINORAMIG',
    [switch]$SelfTest
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertTo-SqlUnicodeLiteral([string]$Value) {
    # T-SQL RESTORE FROM DISK cannot bind a normal SQL parameter.
    # Quote the complete absolute filename as one unicode string literal.
    return "N'" + $Value.Replace("'", "''") + "'"
}

function New-SafeBackupCommands([string]$AbsolutePath) {
    $literal = ConvertTo-SqlUnicodeLiteral $AbsolutePath
    return @{
        Header = 'RESTORE HEADERONLY FROM DISK = ' + $literal
        FileList = 'RESTORE FILELISTONLY FROM DISK = ' + $literal
        Verify = 'RESTORE VERIFYONLY FROM DISK = ' + $literal
    }
}

function Assert-PrivateLocalBackupFile([string]$PathValue) {
    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        throw 'BACKUP_FILE_REQUIRED'
    }
    if (-not [System.IO.Path]::IsPathRooted($PathValue)) {
        throw 'BACKUP_ABSOLUTE_PATH_REQUIRED'
    }
    $fullPath = [System.IO.Path]::GetFullPath($PathValue)
    if ($fullPath.StartsWith('\\') -or $fullPath.StartsWith('//') -or
        $fullPath -match '^\\\\\?\\' -or $fullPath.Substring(2).Contains(':')) {
        throw 'BACKUP_NONLOCAL_OR_ALTERNATE_STREAM_BLOCKED'
    }
    $info = New-Object System.IO.FileInfo($fullPath)
    if (-not $info.Exists) {
        throw 'BACKUP_FILE_NOT_FOUND'
    }
    if (($info.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'BACKUP_REPARSE_POINT_BLOCKED'
    }
    if ($info.Length -le 0 -or $info.Length -gt 4GB) {
        throw 'BACKUP_SIZE_OUTSIDE_PREFLIGHT_LIMIT'
    }
    return $fullPath
}

function Invoke-SqlTable($Connection, [string]$Query) {
    $command = $Connection.CreateCommand()
    $command.CommandText = $Query
    $command.CommandTimeout = 300
    $table = New-Object System.Data.DataTable
    $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($command)
    try {
        [void]$adapter.Fill($table)
        return $table
    } finally {
        $adapter.Dispose()
        $command.Dispose()
    }
}

if ($SelfTest) {
    # Pure parser/quoting contract; no SQL connection or disk access.
    $testPath = "C:\Sample\copy'; DROP DATABASE master;--.bak"
    $commands = New-SafeBackupCommands $testPath
    if ($commands.Header -notlike "*copy''; DROP DATABASE master;--.bak'*") {
        throw 'SELFTEST_LITERAL_ESCAPE_FAILED'
    }
    if ($commands.Header -notlike 'RESTORE HEADERONLY FROM DISK = N*' -or
        $commands.FileList -notlike 'RESTORE FILELISTONLY FROM DISK = N*' -or
        $commands.Verify -notlike 'RESTORE VERIFYONLY FROM DISK = N*') {
        throw 'SELFTEST_COMMAND_SCOPE_FAILED'
    }
    if (($commands.Values | Where-Object {
        $_ -match '(?i)\b(CREATE|DROP|ALTER|REPLACE|ATTACH|DETACH)\s+(DATABASE|TABLE)\b'
    }).Count -gt 0) {
        # Synthetic injection string is inside a quoted SQL literal; this
        # test must instead establish proper doubled quote escape above.
        throw 'SELFTEST_UNEXPECTED_SQL'
    }
    @{ status = 'selftest-passed'; sourceRead = $false; connectionOpened = $false;
       databaseModified = $false; canImport = $false } |
        ConvertTo-Json -Compress
    return
}

try {
    $localFile = Assert-PrivateLocalBackupFile $BackupPath
} catch {
    # No path or other personal/source metadata in diagnostic output.
    Write-Error 'HOLOO_BACKUP_PREFLIGHT_INVALID_LOCAL_SOURCE'
    exit 2
}

$connection = $null
try {
    # Local shared-memory endpoint only, Windows authentication only.
    # Server version, actual backup format and permissions are checked live.
    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $builder.DataSource = 'lpc:.\' + $InstanceName
    $builder.IntegratedSecurity = $true
    $builder.Encrypt = $true
    $builder.TrustServerCertificate = $true
    $builder.Pooling = $false
    $builder.ConnectTimeout = 10
    $connection = New-Object System.Data.SqlClient.SqlConnection($builder.ToString())
    $connection.Open()
    $versionQuery = $connection.CreateCommand()
    $versionQuery.CommandText = "SELECT TRY_CAST(SERVERPROPERTY('ProductMajorVersion') AS int)"
    $versionQuery.CommandTimeout = 10
    $serverMajor = [int]$versionQuery.ExecuteScalar()
    $versionQuery.Dispose()
    if ($serverMajor -lt 10) {
        throw 'SQL_VERSION_UNDETERMINED'
    }

    $sql = New-SafeBackupCommands $localFile
    $header = Invoke-SqlTable $connection $sql.Header
    if ($header.Rows.Count -ne 1) {
        # Multiple backup sets need explicit FILE number/version handling.
        throw 'BACKUP_SET_COUNT_UNSUPPORTED'
    }
    $sourceMajor = [int]$header.Rows[0]['SoftwareVersionMajor']
    if ($sourceMajor -lt 9 -or $sourceMajor -gt $serverMajor) {
        throw 'SQL_BACKUP_VERSION_INCOMPATIBLE'
    }
    $fileList = Invoke-SqlTable $connection $sql.FileList
    if ($fileList.Rows.Count -lt 1) {
        throw 'SQL_BACKUP_EMPTY_FILE_LIST'
    }
    $verify = $connection.CreateCommand()
    $verify.CommandText = $sql.Verify
    $verify.CommandTimeout = 1800
    [void]$verify.ExecuteNonQuery()
    $verify.Dispose()

    # Deliberately no database name, file path, logical file name,
    # instance name, account data, raw SQL errors or source hash in output.
    @{
        status = 'sql-backup-verifyonly-passed'
        backupSetCount = $header.Rows.Count
        fileCount = $fileList.Rows.Count
        sourceSqlMajor = $sourceMajor
        installedSqlMajor = $serverMajor
        verifyOnlyPassed = $true
        restoreAttempted = $false
        schemaVerified = $false
        financialReconciled = $false
        importPerformed = $false
        canImport = $false
    } | ConvertTo-Json -Compress
} catch {
    Write-Error 'HOLOO_SQL_BACKUP_METADATA_OR_VERIFY_FAILED'
    exit 3
} finally {
    if ($null -ne $connection) {
        $connection.Dispose()
    }
}
