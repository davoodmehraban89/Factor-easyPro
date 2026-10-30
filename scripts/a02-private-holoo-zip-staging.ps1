#requires -Version 5.1
<#
A02: owner-local private Holoo ZIP intake. This script never connects to SQL
Server, never imports accounting records, and never sends data to a network.
Mode Test uses a temporary SYNTHETIC archive only, then removes it.
Mode Probe reads only ZIP metadata. Mode Stage extracts one private .bak copy
into the current Windows user's LOCALAPPDATA after explicit consent.
#>
[CmdletBinding()]
param(
    [ValidateSet('Test','Probe','Stage')]
    [string]$Mode = 'Test',
    [string]$SourceZip = '',
    [string]$ConsentPhrase = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-PrivateLocalZip([string]$Source) {
    if ([string]::IsNullOrWhiteSpace($Source) -or
        $Source -notmatch '^[A-Za-z]:\\' -or
        $Source -match '[/\x00-\x1f<>"|?*]' -or
        $Source.Substring(2).Contains(':')) {
        throw 'A02_SOURCE_NOT_A_LOCAL_ABSOLUTE_PATH'
    }
    foreach ($component in $Source.Substring(3).Split('\')) {
        if ([string]::IsNullOrWhiteSpace($component) -or
            $component -eq '.' -or $component -eq '..' -or
            $component.EndsWith(' ') -or $component.EndsWith('.')) {
            throw 'A02_SOURCE_PATH_AMBIGUOUS'
        }
    }
    $info = [System.IO.FileInfo]::new($Source)
    if (-not $info.Exists -or $info.Length -le 0 -or $info.Length -gt 2GB) {
        throw 'A02_SOURCE_ZIP_FILE_OR_SIZE_INVALID'
    }
    $drive = [System.IO.DriveInfo]::new($info.FullName.Substring(0, 1))
    if ($drive.DriveType -ne [System.IO.DriveType]::Fixed -and
        $drive.DriveType -ne [System.IO.DriveType]::Removable) {
        throw 'A02_MAPPED_OR_NETWORK_DRIVE_DISALLOWED'
    }
    if (($info.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'A02_SOURCE_LINK_DISALLOWED'
    }
    $parent = $info.Directory
    while ($null -ne $parent) {
        if (($parent.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'A02_SOURCE_PARENT_LINK_DISALLOWED'
        }
        $parent = $parent.Parent
    }
    return $info.FullName
}

$sourceFile = $null
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'a02-private-holoo-zip-staging.cs') -ReferencedAssemblies @('System.IO.Compression', 'System.IO.Compression.FileSystem') -ErrorAction Stop

    if ($Mode -eq 'Test') {
        [Finora.Migration.SafeHolooZip]::SelfTest()
        [pscustomobject]@{
            status = 'synthetic-zip-staging-selftest-passed'
            ownerBackupUsed = $false
            sqlConnected = $false
            financialDataImported = $false
            canImport = $false
        } | ConvertTo-Json -Compress
        return
    }

    $sourceFile = Assert-PrivateLocalZip $SourceZip
    $report = [Finora.Migration.SafeHolooZip]::Probe($sourceFile)
    if ($Mode -eq 'Probe') {
        [pscustomobject]@{
            status = 'zip-envelope-identified'
            archiveBytes = $report.ArchiveBytes
            backupBytes = $report.BackupBytes
            crcVerified = $false
            sqlBackupVerified = $false
            canImport = $false
            databaseModified = $false
        } | ConvertTo-Json -Compress
        return
    }

    if ($ConsentPhrase -cne 'I_AUTHORIZE_PRIVATE_HOLOO_STAGING') {
        throw 'A02_STAGING_EXPLICIT_CONSENT_REQUIRED'
    }
    $root = [System.Environment]::GetFolderPath(
        [System.Environment+SpecialFolder]::LocalApplicationData)
    if ([string]::IsNullOrWhiteSpace($root) -or
        $root -notmatch '^[A-Za-z]:\\') {
        throw 'A02_USER_PRIVATE_STAGING_ROOT_UNAVAILABLE'
    }
    $rootDrive = [System.IO.DriveInfo]::new($root.Substring(0, 1))
    if (-not $rootDrive.IsReady -or
        $rootDrive.DriveType -ne [System.IO.DriveType]::Fixed -or
        $rootDrive.AvailableFreeSpace -lt ($report.BackupBytes + 2GB)) {
        throw 'A02_STAGING_SPACE_INSUFFICIENT'
    }

    # Staging is under this user's profile. SQL Server service permissions
    # require a separate explicitly authorized step in a future release.
    $privateRoot = [System.IO.Path]::Combine(
        $root, 'FactorEasyPro', 'HolooMigrationStaging')
    $current = [System.IO.DirectoryInfo]::new($root)
    while ($null -ne $current) {
        if (($current.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'A02_PRIVATE_ROOT_LINK_DISALLOWED'
        }
        $current = $current.Parent
    }
    $null = [System.IO.Directory]::CreateDirectory($privateRoot)
    # A preexisting junction at our application/staging subfolder must not
    # redirect extracted private backup bytes outside the user's profile.
    $stagingParent = [System.IO.DirectoryInfo]::new($privateRoot)
    while ($null -ne $stagingParent) {
        if (($stagingParent.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'A02_STAGING_ROOT_LINK_DISALLOWED'
        }
        $stagingParent = $stagingParent.Parent
    }
    $uniqueName = 'stage_' + [System.Guid]::NewGuid().ToString('N')
    $newDirectory = [System.IO.Path]::Combine($privateRoot, $uniqueName)
    $null = [System.IO.Directory]::CreateDirectory($newDirectory)
    $output = [System.IO.Path]::Combine($newDirectory, 'HolooBackupCopy.bak')
    try {
        $staged = [Finora.Migration.SafeHolooZip]::Stage($sourceFile, $output)
    } catch {
        # Only delete our newly created staging directory (never source).
        try { [System.IO.Directory]::Delete($newDirectory, $true) } catch {}
        throw
    }

    [pscustomobject]@{
        status = 'private-local-zip-staged-crc-and-tape-verified'
        stagedBackupPath = $output
        backupBytes = $staged.BackupBytes
        crcVerified = $staged.CrcVerified
        sqlTapeHeaderVerified = $staged.SqlTapeHeaderVerified
        sqlBackupVerified = $false
        sqlConnected = $false
        databaseModified = $false
        financialDataImported = $false
        canImport = $false
    } | ConvertTo-Json -Compress
} catch {
    # Avoid publishing owner paths, ZIP entry names or raw exception strings.
    Write-Error 'A02_ZIP_STAGING_FAILED_CHECK_PRIVATE_LOCAL_DIAGNOSTICS'
    exit 2
}
