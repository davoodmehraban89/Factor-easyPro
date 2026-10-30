#requires -Version 5.1
<#
A02: owner-approved, LOCAL-only, isolated SQL Server RESTORE. Not the public wizard.
No SQL install, data mapping/import, remote instance access, WITH REPLACE or DROP.
Use only on a dedicated disposable SQL instance named FINORAMIG.
No owner backup is ever used by public GitHub CI; -Mode Test uses synthetic rows.
#>
[CmdletBinding()]
param(
    [ValidateSet('Test', 'Inspect', 'Restore')]
    [string]$Mode = 'Test',
    [string]$BackupPath = '',
    [ValidatePattern('^FINORAMIG$')]
    [string]$InstanceName = 'FINORAMIG',
    [string]$ConsentPhrase = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Sql-Literal([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value.IndexOf([char]0) -ge 0) {
        throw 'A02_INVALID_SQL_LITERAL'
    }
    return "N'" + $Value.Replace("'", "''") + "'"
}

function Assert-LocalPathShape([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value) -or
        $Value -notmatch '^[A-Za-z]:\\' -or
        $Value -match '[/\x00-\x1f<>"|?*]' -or
        $Value.Substring(2).Contains(':')) {
        throw 'A02_UNSAFE_LOCAL_PATH'
    }
    foreach ($segment in $Value.Substring(3).Split('\')) {
        if ([string]::IsNullOrWhiteSpace($segment) -or
            $segment -eq '.' -or $segment -eq '..' -or
            $segment.EndsWith(' ') -or $segment.EndsWith('.')) {
            throw 'A02_AMBIGUOUS_PATH'
        }
    }
    return $Value
}

function Assert-LocalFilesystemSource([string]$Value) {
    $path = Assert-LocalPathShape $Value
    $drive = [System.IO.DriveInfo]::new($path.Substring(0, 1))
    if ($drive.DriveType -ne [System.IO.DriveType]::Fixed -and
        $drive.DriveType -ne [System.IO.DriveType]::Removable) {
        throw 'A02_SOURCE_NOT_LOCAL_DISK'
    }
    $file = New-Object System.IO.FileInfo($path)
    if (-not $file.Exists -or $file.Length -le 0 -or $file.Length -gt 4GB) {
        throw 'A02_SOURCE_FILE_OR_SIZE_INVALID'
    }
    if (($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'A02_SOURCE_LINK_DISALLOWED'
    }
    $parent = $file.Directory
    while ($null -ne $parent) {
        if (($parent.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'A02_SOURCE_PARENT_LINK_DISALLOWED'
        }
        $parent = $parent.Parent
    }
    return $file.FullName
}

function New-RandomDatabaseName {
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        [byte[]]$bytes = New-Object byte[] 16
        $rng.GetBytes($bytes)
        return 'FinoraHoloo_' + [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
    } finally { $rng.Dispose() }
}

function New-LocalRestorePlan(
    [string]$BackupFile, [string]$DataDirectory, [string]$LogDirectory,
    [string]$DatabaseName, [object[]]$Files
) {
    $null = Assert-LocalPathShape $BackupFile
    $null = Assert-LocalPathShape $DataDirectory
    $null = Assert-LocalPathShape $LogDirectory
    if ($DatabaseName -cnotmatch '^FinoraHoloo_[0-9a-f]{32}$') {
        throw 'A02_INVALID_DATABASE_NAME'
    }
    if ($null -eq $Files -or $Files.Count -lt 2 -or $Files.Count -gt 16) {
        throw 'A02_FILELIST_COUNT_UNSUPPORTED'
    }
    $seen = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::OrdinalIgnoreCase
    )
    $moves = @()
    $data = 0
    $logs = 0
    $totalBytes = [long]0
    foreach ($file in $Files) {
        $logical = [string]$file.LogicalName
        $type = [string]$file.Type
        [long]$size = $file.Size
        if ([string]::IsNullOrWhiteSpace($logical) -or $logical.Length -gt 128 -or
            $logical -match '[\x00-\x1f]' -or
            -not $seen.Add($logical) -or
            $size -le 0 -or $size -gt 2TB) {
            throw 'A02_FILELIST_UNSAFE_ENTRY'
        }
        if ($type -eq 'D') {
            $data++
            $ext = if ($data -eq 1) { '.mdf' } else { '.ndf' }
            $directory = $DataDirectory
        } elseif ($type -eq 'L') {
            $logs++
            $ext = '.ldf'
            $directory = $LogDirectory
        } else { throw 'A02_UNSUPPORTED_SQL_FILE_TYPE' }
        if ($totalBytes -gt [long]::MaxValue - $size) {
            throw 'A02_FILELIST_SIZE_OVERFLOW'
        }
        $totalBytes += $size
        $filename = $DatabaseName + '_file' + ($moves.Count + 1).ToString('00') + $ext
        $target = [System.IO.Path]::Combine($directory, $filename)
        $null = Assert-LocalPathShape $target
        $moves += [pscustomobject]@{
            Logical = $logical; Target = $target; Type = $type; Bytes = $size
        }
    }
    if ($data -eq 0 -or $logs -eq 0) {
        throw 'A02_DATA_AND_LOG_FILES_REQUIRED'
    }
    $clauses = @($moves | ForEach-Object {
        'MOVE ' + (Sql-Literal $_.Logical) + ' TO ' + (Sql-Literal $_.Target)
    })
    $sourceSql = 'FROM DISK = ' + (Sql-Literal $BackupFile) +
        ' WITH FILE = 1, ' + ($clauses -join ', ')
    $guard = 'IF DB_ID(' + (Sql-Literal $DatabaseName) +
        ") IS NOT NULL THROW 51001, 'A02_DATABASE_COLLISION', 1;"
    $verify = 'RESTORE VERIFYONLY ' + $sourceSql + ';'
    $restore = $guard + [Environment]::NewLine +
        'RESTORE DATABASE [' + $DatabaseName + '] ' +
        $sourceSql + ', RECOVERY, STATS = 10;'
    return [pscustomobject]@{
        DatabaseName = $DatabaseName
        Moves = @($moves)
        TotalBytes = $totalBytes
        VerifySql = $verify
        RestoreSql = $restore
        RestoreExecuted = $false
        CanImport = $false
    }
}

function Invoke-SqlRows($Connection, [string]$Sql) {
    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    $cmd.CommandTimeout = 300
    $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
    $rows = New-Object System.Data.DataTable
    try {
        [void]$adapter.Fill($rows)
        return ,$rows
    } finally {
        $adapter.Dispose()
        $cmd.Dispose()
    }
}

function Invoke-SqlCommand($Connection, [string]$Sql, [int]$Timeout = 1800) {
    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    $cmd.CommandTimeout = $Timeout
    try { [void]$cmd.ExecuteNonQuery() }
    finally { $cmd.Dispose() }
}

function Assert-PlanCollisionFree($Connection, $Plan) {
    # Only read system catalogs; no CREATE/DROP/ALTER.
    $catalog = Invoke-SqlRows $Connection 'SELECT physical_name FROM sys.master_files'
    $names = Invoke-SqlRows $Connection 'SELECT name FROM sys.databases'
    try {
        foreach ($r in $names.Rows) {
            if ([string]::Equals([string]$r['name'], $Plan.DatabaseName,
                [System.StringComparison]::OrdinalIgnoreCase)) {
                throw 'A02_DATABASE_COLLISION'
            }
        }
        foreach ($move in $Plan.Moves) {
            if ([System.IO.File]::Exists($move.Target) -or
                [System.IO.Directory]::Exists($move.Target)) {
                throw 'A02_DESTINATION_FILE_COLLISION'
            }
            foreach ($row in $catalog.Rows) {
                if ([string]::Equals([string]$row['physical_name'], $move.Target,
                    [System.StringComparison]::OrdinalIgnoreCase)) {
                    throw 'A02_EXISTING_SQL_FILE_COLLISION'
                }
            }
        }
    } finally {
        $catalog.Dispose()
        $names.Dispose()
    }
}

function Assert-DestinationDiskSpace($Plan) {
    # Require at least 2 GiB reserve beyond the logical file sizes per drive.
    $required = @{}
    foreach ($move in $Plan.Moves) {
        $drive = $move.Target.Substring(0, 1).ToUpperInvariant()
        if (-not $required.ContainsKey($drive)) { $required[$drive] = [long]0 }
        $required[$drive] += [long]$move.Bytes
    }
    foreach ($drive in $required.Keys) {
        $info = [System.IO.DriveInfo]::new($drive)
        if ($info.DriveType -ne [System.IO.DriveType]::Fixed -or
            -not $info.IsReady -or
            $info.AvailableFreeSpace -lt ($required[$drive] + 2GB)) {
            throw 'A02_DESTINATION_DISK_INSUFFICIENT'
        }
    }
}

function Invoke-SelfTest {
    $name = 'FinoraHoloo_0123456789abcdef0123456789abcdef'
    $files = @(
        [pscustomobject]@{ LogicalName = "Data';DROP DATABASE master;--"; Type = 'D'; Size = 1024 },
        [pscustomobject]@{ LogicalName = 'Log'; Type = 'L'; Size = 2048 }
    )
    $p = New-LocalRestorePlan "D:\Private\O'Connor.bak" 'C:\SqlData' 'C:\SqlLog' $name $files
    if (-not $p.VerifySql.Contains("O''Connor.bak") -or
        -not $p.RestoreSql.Contains("Data'';DROP DATABASE master;--") -or
        $p.RestoreSql -match '(?i)\bWITH\s+REPLACE\b' -or
        ($p.RestoreSql.Split([string[]]@('RESTORE DATABASE'), [System.StringSplitOptions]::None)).Count -ne 2 -or
        $p.Moves.Count -ne 2) { throw 'A02_SELFTEST_SQL_PLAN' }
    foreach ($bad in @('relative\file.bak', '\\server\share\a.bak',
        'C:\Private\..\file.bak', 'C:\Private\file.bak:ads', 'C:/Private/file.bak')) {
        $rejected = $false
        try { $null = Assert-LocalPathShape $bad }
        catch { $rejected = $true }
        if (-not $rejected) { throw 'A02_SELFTEST_UNSAFE_PATH' }
    }
    $badType = @(
        [pscustomobject]@{ LogicalName = 'Data'; Type = 'D'; Size = 1024 },
        [pscustomobject]@{ LogicalName = 'Fs'; Type = 'S'; Size = 1024 }
    )
    $rejected = $false
    try { $null = New-LocalRestorePlan 'D:\copy.bak' 'C:\Data' 'C:\Log' $name $badType }
    catch { $rejected = $true }
    if (-not $rejected) { throw 'A02_SELFTEST_FILE_TYPE' }
    [pscustomobject]@{
        status = 'selftest-passed'; sqlConnectionOpened = $false
        backupOpened = $false; databaseModified = $false; canImport = $false
    } | ConvertTo-Json -Compress
}

if ($Mode -eq 'Test') {
    Invoke-SelfTest
    return
}

# A02: explicit consent required before potentially creating a new database.
if ($Mode -eq 'Restore' -and
    $ConsentPhrase -cne 'I_AUTHORIZE_A_NEW_ISOLATED_SQL_DATABASE') {
    Write-Error 'A02_EXPLICIT_OWNER_CONSENT_REQUIRED'
    exit 2
}
$connection = $null
try {
    $localBackup = Assert-LocalFilesystemSource $BackupPath
    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $builder.DataSource = 'lpc:.\FINORAMIG'
    $builder.InitialCatalog = 'master'
    $builder.IntegratedSecurity = $true
    $builder.Encrypt = $true
    $builder.TrustServerCertificate = $true
    $builder.ConnectTimeout = 10
    $builder.Pooling = $false
    $connection = New-Object System.Data.SqlClient.SqlConnection($builder.ToString())
    $connection.Open()
    $version = Invoke-SqlRows $connection @"
SELECT TRY_CAST(SERVERPROPERTY('ProductMajorVersion') AS int) AS Major,
       CAST(SERVERPROPERTY('InstanceName') AS nvarchar(128)) AS InstanceName,
       CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS nvarchar(4000)) AS DataDir,
       CAST(SERVERPROPERTY('InstanceDefaultLogPath') AS nvarchar(4000)) AS LogDir;
"@
    if ($version.Rows.Count -ne 1 -or
        [string]$version.Rows[0]['InstanceName'] -ine 'FINORAMIG') {
        throw 'A02_SQL_INSTANCE_NOT_DEDICATED'
    }
    [int]$serverMajor = $version.Rows[0]['Major']
    if ($serverMajor -lt 11) { throw 'A02_SQL_INSTANCE_TOO_OLD' }
    $dataPath = [string]$version.Rows[0]['DataDir']
    $logPath = [string]$version.Rows[0]['LogDir']
    if ($dataPath.EndsWith('\')) { $dataPath = $dataPath.TrimEnd('\') }
    if ($logPath.EndsWith('\')) { $logPath = $logPath.TrimEnd('\') }
    $null = Assert-LocalPathShape $dataPath
    $null = Assert-LocalPathShape $logPath
    foreach ($folder in @($dataPath, $logPath)) {
        if (-not [System.IO.Directory]::Exists($folder)) {
            throw 'A02_SQL_DEFAULT_DIRECTORY_MISSING'
        }
    }
    $sourceLiteral = Sql-Literal $localBackup
    $header = Invoke-SqlRows $connection ('RESTORE HEADERONLY FROM DISK = ' + $sourceLiteral)
    if ($header.Rows.Count -ne 1 -or
        [int]$header.Rows[0]['BackupType'] -ne 1 -or
        [int]$header.Rows[0]['Position'] -ne 1) {
        throw 'A02_NOT_SINGLE_STANDALONE_FULL_BACKUP'
    }
    if ($header.Columns.Contains('IsDamaged') -and
        $header.Rows[0]['IsDamaged'] -ne [DBNull]::Value -and
        [bool]$header.Rows[0]['IsDamaged']) {
        throw 'A02_SOURCE_HEADER_DAMAGED'
    }
    [int]$sourceMajor = $header.Rows[0]['SoftwareVersionMajor']
    if ($sourceMajor -lt 9 -or $sourceMajor -gt $serverMajor) {
        throw 'A02_SOURCE_SQL_VERSION_INCOMPATIBLE'
    }
    $files = Invoke-SqlRows $connection ('RESTORE FILELISTONLY FROM DISK = ' + $sourceLiteral)
    $plan = New-LocalRestorePlan $localBackup $dataPath $logPath (
        New-RandomDatabaseName
    ) @($files.Rows)
    Assert-DestinationDiskSpace $plan
    Assert-PlanCollisionFree $connection $plan
    Invoke-SqlCommand $connection $plan.VerifySql 1800
    if ($Mode -eq 'Inspect') {
        [pscustomobject]@{
            status = 'backup-verifyonly-passed'
            sourceSqlMajor = $sourceMajor; engineSqlMajor = $serverMajor
            fileCount = $plan.Moves.Count; canImport = $false
            restoreExecuted = $false; financialReconciled = $false
        } | ConvertTo-Json -Compress
        return
    }
    # Recheck to narrow races; SQL itself also refuses existing database
    # without WITH REPLACE. This cannot prove true exclusive use of instance.
    Assert-PlanCollisionFree $connection $plan
    Invoke-SqlCommand $connection $plan.RestoreSql 3600
    $schema = Invoke-SqlRows $connection (
        'SELECT (SELECT COUNT(*) FROM [' + $plan.DatabaseName +
        '].sys.tables) AS TableCount, (SELECT COUNT(*) FROM [' +
        $plan.DatabaseName + '].sys.columns) AS ColumnCount'
    )
    [pscustomobject]@{
        status = 'isolated-restore-completed-needs-mapping-and-reconciliation'
        databaseName = $plan.DatabaseName
        tableCount = [int]$schema.Rows[0]['TableCount']
        columnCount = [int]$schema.Rows[0]['ColumnCount']
        canImport = $false; financialReconciled = $false
        importPerformed = $false
    } | ConvertTo-Json -Compress
} catch {
    # Do not leak source paths, company names, SQL logical names, credentials,
    # raw SQL errors or source financial data into logs/public CI.
    Write-Error 'A02_SQL_ISOLATED_RESTORE_OR_PREFLIGHT_FAILED_CHECK_PRIVATE_LOGS'
    exit 3
} finally {
    if ($null -ne $connection) { $connection.Dispose() }
}
