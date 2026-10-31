#requires -Version 5.1
<#
A02: optional, local-only offline SQL Server setup preflight and execution gate.
This is an engineering helper, not yet the installed application wizard.
No download, SQL configuration changes to existing instances, backup opening,
database restore, file upload, or unattended EULA acceptance without consent.
Test mode is synthetic and performs no setup, no disk reads, no registry reads.
#>
[CmdletBinding()]
param(
    [ValidateSet('Test','Inspect','Install')]
    [string]$Mode = 'Test',
    [string]$SetupExePath = '',
    [string]$PublisherApprovedSha256 = '',
    [string]$ConsentPhrase = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-LocalSetupPath([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value) -or
        $Value -notmatch '^[A-Za-z]:\\' -or
        $Value -match '[/\x00-\x1f<>"|?*]' -or
        $Value.Substring(2).Contains(':') -or
        -not [string]::Equals([IO.Path]::GetFileName($Value),
            'setup.exe', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'A02_SQL_SETUP_LOCAL_OFFLINE_MEDIA_REQUIRED'
    }
    foreach ($part in $Value.Substring(3).Split('\')) {
        if ([string]::IsNullOrWhiteSpace($part) -or $part -eq '.' -or
            $part -eq '..' -or $part.EndsWith(' ') -or $part.EndsWith('.')) {
            throw 'A02_SQL_SETUP_UNSAFE_PATH'
        }
    }
    return $Value
}

function Test-ExistingMigrationInstance {
    # Query 64-bit SQL registry view explicitly, independent of shell bitness.
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
        [Microsoft.Win32.RegistryHive]::LocalMachine,
        [Microsoft.Win32.RegistryView]::Registry64)
    try {
        $key = $base.OpenSubKey('SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL', $false)
        if ($null -eq $key) { return $false }
        try {
            foreach ($name in $key.GetValueNames()) {
                if ($name -ieq 'FINORAMIG') { return $true }
            }
            return $false
        } finally { $key.Dispose() }
    } finally { $base.Dispose() }
}

function Assert-MachineEligible {
    if (-not [Environment]::Is64BitOperatingSystem -or
        [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or
        [Environment]::OSVersion.Version.Major -lt 10) {
        throw 'A02_SQL_WINDOWS_X64_10_OR_NEWER_REQUIRED'
    }
    $system = [IO.DriveInfo]::new($env:SystemDrive.Substring(0, 1))
    if (-not $system.IsReady -or $system.AvailableFreeSpace -lt 8GB) {
        throw 'A02_SQL_SYSTEM_DISK_SPACE_LOW'
    }
}

function Assert-MicrosoftOfflineMedia([string]$Path, [string]$ExpectedSha) {
    $path = Assert-LocalSetupPath $Path
    if ($ExpectedSha -cnotmatch '^[0-9a-fA-F]{64}$') {
        throw 'A02_SQL_PUBLISHER_PINNED_SHA256_REQUIRED'
    }
    $item = [IO.FileInfo]::new($path)
    if (-not $item.Exists -or $item.Length -lt 10000) {
        throw 'A02_SQL_OFFLINE_MEDIA_MISSING'
    }
    $drive = [IO.DriveInfo]::new($item.FullName.Substring(0, 1))
    if ($drive.DriveType -ne [IO.DriveType]::Fixed -and
        $drive.DriveType -ne [IO.DriveType]::Removable) {
        throw 'A02_SQL_REMOTE_MEDIA_DISALLOWED'
    }
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'A02_SQL_SETUP_SYMLINK_DISALLOWED'
    }
    $parent = $item.Directory
    while ($null -ne $parent) {
        if (($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'A02_SQL_SETUP_PARENT_LINK_DISALLOWED'
        }
        $parent = $parent.Parent
    }
    # Even genuine signed setup.exe is not proof that its sibling media files
    # or edition are trusted. A vetted, publisher-controlled offline image
    # manifest is required for the final one-click retail installer.
    $signature = Get-AuthenticodeSignature -LiteralPath $path -ErrorAction Stop
    if ($signature.Status -ne [Management.Automation.SignatureStatus]::Valid -or
        $null -eq $signature.SignerCertificate -or
        $signature.SignerCertificate.Subject -notmatch '(?i)(^|,\s*)O=Microsoft Corporation(,|$)') {
        throw 'A02_SQL_SETUP_MICROSOFT_SIGNATURE_INVALID'
    }
    $observed = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    if ($observed -ine $ExpectedSha) {
        throw 'A02_SQL_SETUP_PUBLISHER_HASH_MISMATCH'
    }
    return $observed
}

function Get-SetupArguments([string]$Principal) {
    if ([string]::IsNullOrWhiteSpace($Principal) -or
        $Principal -notmatch '^[^"=;\x00-\x1f]{1,128}\\[^"=;\x00-\x1f]{1,128}$') {
        throw 'A02_SQL_WINDOWS_ADMIN_IDENTITY_INVALID'
    }
    # Installer setup process runs only on explicit -Mode Install.
    # Does not enable TCP/Named Pipes, mixed-mode authentication or remote SQL.
    return @(
      '/Q', '/ACTION=Install', '/FEATURES=SQL',
      '/INSTANCENAME=FINORAMIG', '/INSTANCEID=FINORAMIG',
      '/SQLSVCSTARTUPTYPE=Manual', '/TCPENABLED=0', '/NPENABLED=0',
      '/UpdateEnabled=False', '/SUPPRESSPRIVACYSTATEMENTNOTICE',
      ('/SQLSYSADMINACCOUNTS="' + $Principal + '"'),
      '/IACCEPTSQLSERVERLICENSETERMS'
    )
}

function Invoke-SyntheticSelfTest {
    foreach ($bad in @(
      'relative\setup.exe', '\\server\share\setup.exe',
      'C:\safe\..\setup.exe', 'C:\safe\setup.exe:stream',
      'C:/safe/setup.exe', 'C:\safe\bad.exe'
    )) {
        $blocked = $false
        try { $null = Assert-LocalSetupPath $bad } catch { $blocked = $true }
        if (-not $blocked) { throw 'A02_SELFTEST_UNSAFE_MEDIA_PATH_ACCEPTED' }
    }
    $null = Assert-LocalSetupPath 'C:\VettedMedia\setup.exe'
    $a = @(Get-SetupArguments 'LAB\SyntheticAdmin')
    if ($a.Count -lt 10 -or
        @($a | Where-Object { $_ -eq '/TCPENABLED=0' }).Count -ne 1 -or
        @($a | Where-Object { $_ -eq '/NPENABLED=0' }).Count -ne 1 -or
        @($a | Where-Object { $_ -eq '/INSTANCENAME=FINORAMIG' }).Count -ne 1 -or
        @($a | Where-Object { $_ -like '*SECURITYMODE*' -or $_ -like '*SAPWD*' }).Count -ne 0) {
        throw 'A02_SELFTEST_UNSAFE_SQL_SETUP_ARGS'
    }
    [pscustomobject]@{
        status = 'synthetic-offline-sql-setup-preflight-passed'
        installerStarted = $false
        licenseAccepted = $false
        registryRead = $false
        backupOpened = $false
        databaseModified = $false
        canImport = $false
    } | ConvertTo-Json -Compress
}

if ($Mode -eq 'Test') {
    Invoke-SyntheticSelfTest
    return
}

try {
    Assert-MachineEligible
    if (Test-ExistingMigrationInstance) {
        # An existing *named* instance is not proof of compatibility or
        # isolation. Never automatically reinstall or reconfigure it.
        [pscustomobject]@{
            status = 'existing-migration-instance-requires-review'
            installerStarted = $false
            engineCompatibilityVerified = $false
            canImport = $false
        } | ConvertTo-Json -Compress
        return
    }
    $preflightHash = Assert-MicrosoftOfflineMedia $SetupExePath $PublisherApprovedSha256
    if ($Mode -eq 'Inspect') {
        [pscustomobject]@{
            status = 'microsoft-signed-setup-exe-checked'
            installerStarted = $false
            completeMediaSetVerified = $false
            editionVerified = $false
            sqlEngineInstalled = $false
            canImport = $false
        } | ConvertTo-Json -Compress
        return
    }
    # No media is automatically downloaded. The end-user packaging pipeline
    # must vet all bundled SQL Express installation media and license rights.
    # Refuse actual installation until a complete signed-media manifest,
    # edition validation and admin/UAC flow are implemented and tested.
    if ($ConsentPhrase -cne 'I_ACCEPT_MICROSOFT_SQL_TERMS_AND_APPROVE_INSTALL') {
        throw 'A02_SQL_EXPLICIT_LICENSE_AND_INSTALL_CONSENT_REQUIRED'
    }
    throw 'A02_SQL_MEDIA_EDITION_AND_COMPLETE_PAYLOAD_NOT_YET_VERIFIED'
} catch {
    Write-Error 'A02_SQL_OFFLINE_SETUP_PREFLIGHT_BLOCKED_NO_CHANGES'
    exit 2
}
