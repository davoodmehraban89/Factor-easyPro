#requires -Version 5.1
<#
A02 private local lab: owner-only operator workflow, NOT end-user wizard.
Test is synthetic only. No SQL install, remote connection, financial import,
automatic privilege elevation, ACL modification, or automatic DROP DATABASE.
#>
[CmdletBinding()]
param(
 [ValidateSet('Test','Stage','InspectStaged','RestoreAndInventory')]
 [string]$Mode='Test',
 [string]$SourceZip='',
 [string]$StagedBackupPath='',
 [string]$ManifestOutputPath='',
 [string]$StagingConsent='',
 [string]$RestoreConsent=''
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$script:Phase='validate'
$script:BackupPath=''
function Require([bool]$ok,[string]$code){if(-not $ok){throw $code}}
function Assert-ManifestDestination([string]$path){
  Require (-not [string]::IsNullOrWhiteSpace($path) -and
    $path -match '^[A-Za-z]:\\' -and
    $path -notmatch '[/\x00-\x1f<>"|?*]' -and
    -not $path.Substring(2).Contains(':')) 'A02_PRIVATE_MANIFEST_PATH_INVALID'
  foreach($part in $path.Substring(3).Split('\')){
    Require (-not [string]::IsNullOrWhiteSpace($part) -and
      $part -ne '.' -and $part -ne '..' -and
      -not $part.EndsWith(' ') -and -not $part.EndsWith('.')) 'A02_MANIFEST_PATH_AMBIGUOUS'
  }
  $dir=[IO.DirectoryInfo]::new([IO.Path]::GetDirectoryName($path))
  Require $dir.Exists 'A02_MANIFEST_PARENT_MISSING'
  while($null -ne $dir){
    Require (($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'A02_MANIFEST_PARENT_LINK'
    $dir=$dir.Parent
  }
  Require (-not [IO.File]::Exists($path) -and -not [IO.Directory]::Exists($path)) 'A02_MANIFEST_WOULD_OVERWRITE'
  $drive=[IO.DriveInfo]::new($path.Substring(0,1))
  Require ($drive.IsReady -and $drive.DriveType -eq [IO.DriveType]::Fixed -and
    $drive.AvailableFreeSpace -ge 100MB) 'A02_MANIFEST_DISK_INSUFFICIENT'
}
function Assert-StagedBackup([string]$value){
  Require (-not [string]::IsNullOrWhiteSpace($value) -and
    $value -match '^[A-Za-z]:\\' -and
    $value -notmatch '[/\x00-\x1f<>"|?*]' -and
    -not $value.Substring(2).Contains(':')) 'A02_STAGED_BACKUP_PATH_INVALID'
  foreach($part in $value.Substring(3).Split('\')){
    Require (-not [string]::IsNullOrWhiteSpace($part) -and
      $part -ne '.' -and $part -ne '..' -and
      -not $part.EndsWith(' ') -and -not $part.EndsWith('.')) 'A02_STAGED_BACKUP_AMBIGUOUS_PATH'
  }
  $full=[IO.Path]::GetFullPath($value)
  $root=[IO.Path]::Combine([Environment]::GetFolderPath(
    [Environment+SpecialFolder]::LocalApplicationData),
    'FactorEasyPro','HolooMigrationStaging')
  Require (-not [string]::IsNullOrWhiteSpace($root) -and
    $full.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)) 'A02_STAGED_BACKUP_NOT_IN_PRIVATE_STAGING'
  $relative=$full.Substring($root.Length+1)
  Require ($relative -cmatch '(?i)^stage_[0-9a-f]{32}\\HolooBackupCopy\.bak$') 'A02_STAGED_BACKUP_NOT_GENERATED_NAME'
  $file=[IO.FileInfo]::new($full)
  Require ($file.Exists -and $file.Length -gt 4 -and $file.Length -le 4GB) 'A02_STAGED_BACKUP_FILE_MISSING'
  Require (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'A02_STAGED_BACKUP_REPARSE_FILE'
  $drive=[IO.DriveInfo]::new($full.Substring(0,1))
  Require ($drive.IsReady -and $drive.DriveType -eq [IO.DriveType]::Fixed) 'A02_STAGED_BACKUP_DRIVE_UNSAFE'
  $parent=$file.Directory
  while($null -ne $parent){
    Require (($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'A02_STAGED_BACKUP_REPARSE_PARENT'
    $parent=$parent.Parent
  }
  return $full
}
function Invoke-JsonStep([string]$scriptName,[string[]]$stepArgs,[string]$expected){
  $file=Join-Path $PSScriptRoot $scriptName
  Require ([IO.File]::Exists($file)) 'A02_REQUIRED_HELPER_MISSING'
  # No raw error, SQL query or private source path is echoed by this wrapper.
  $output=@(& powershell.exe -NoProfile -NonInteractive -File $file @stepArgs 2>$null)
  Require ($LASTEXITCODE -eq 0 -and $output.Count -gt 0 -and $output.Count -le 5) 'A02_HELPER_FAILED'
  $json=$output -join [Environment]::NewLine
  Require ($json.Length -le 16384) 'A02_HELPER_OUTPUT_OVERSIZED'
  $r=$json | ConvertFrom-Json -ErrorAction Stop
  Require ($null -ne $r -and $r.status -ceq $expected -and
    $r.canImport -eq $false) 'A02_HELPER_CONTRACT_FAILED'
  return $r
}

if($Mode -eq 'Test'){
  Require ([string]::IsNullOrWhiteSpace($SourceZip) -and
    [string]::IsNullOrWhiteSpace($StagedBackupPath) -and
    [string]::IsNullOrWhiteSpace($ManifestOutputPath) -and
    [string]::IsNullOrWhiteSpace($StagingConsent) -and
    [string]::IsNullOrWhiteSpace($RestoreConsent)) 'A02_SELFTEST_REQUIRES_SYNTHETIC_ONLY'
  $tests=@(
    @{File='a02-private-holoo-zip-staging.ps1';Status='synthetic-zip-staging-selftest-passed'},
    @{File='a02-isolated-sql-restore.ps1';Status='selftest-passed'},
    @{File='a02-isolated-schema-inventory.ps1';Status='schema-fingerprint-selftest-passed'},
    @{File='a02-offline-sql-setup-preflight.ps1';Status='synthetic-offline-sql-setup-preflight-passed'}
  )
  foreach($test in $tests){
    $r=Invoke-JsonStep $test.File @('-Mode','Test') $test.Status
    Require ($r.canImport -eq $false) 'A02_SELFTEST_UNSAFE_IMPORT_CLAIM'
  }
  # Verify operator cannot redirect the staged backup to another path or an
  # existing database source. These test paths are synthetic and never opened.
  foreach($unsafe in @(
    '\\server\share\HolooBackupCopy.bak',
    'C:\Windows\Temp\HolooBackupCopy.bak',
    'C:\User\..\HolooBackupCopy.bak',
    'C:\Safe\HolooBackupCopy.bak:stream',
    'C:/Safe/HolooBackupCopy.bak',
    'relative\HolooBackupCopy.bak'
  )){
    $blocked=$false
    try{$null=Assert-StagedBackup $unsafe}catch{$blocked=$true}
    Require $blocked 'A02_SELFTEST_STAGED_PATH_ESCAPE_ACCEPTED'
  }
  foreach($unsafe in @(
    '\\server\share\schema.dpapi',
    'C:\Private\..\schema.dpapi',
    'relative\schema.dpapi',
    'C:\Private\schema.dpapi:stream',
    'C:/Private/schema.dpapi'
  )){
    $blocked=$false
    try{Assert-ManifestDestination $unsafe}catch{$blocked=$true}
    Require $blocked 'A02_SELFTEST_MANIFEST_PATH_ESCAPE_ACCEPTED'
  }
  [pscustomobject]@{
    status='private-lab-synthetic-orchestration-passed'
    checks=$tests.Count;ownerBackupUsed=$false;sqlServerInstalled=$false
    restoreExecuted=$false;financialMigrationPerformed=$false;canImport=$false
  } | ConvertTo-Json -Compress
  return
}

try{
  if($Mode -eq 'Stage'){
    Require ($StagingConsent -ceq 'I_AUTHORIZE_PRIVATE_HOLOO_STAGING' -and
      -not [string]::IsNullOrWhiteSpace($SourceZip)) 'A02_STAGING_CONSENT_AND_ZIP_REQUIRED'
    Require ([string]::IsNullOrWhiteSpace($StagedBackupPath) -and
      [string]::IsNullOrWhiteSpace($ManifestOutputPath) -and
      [string]::IsNullOrWhiteSpace($RestoreConsent)) 'A02_STAGE_FORBIDS_RESTORE_ARGUMENTS'
    $script:Phase='zip-envelope'
    $probe=Invoke-JsonStep 'a02-private-holoo-zip-staging.ps1' @(
      '-Mode','Probe','-SourceZip',$SourceZip
    ) 'zip-envelope-identified'
    Require ($probe.crcVerified -eq $false -and
      $probe.databaseModified -eq $false) 'A02_ZIP_PROBE_INVALID'
    $script:Phase='zip-stage-private'
    $staged=Invoke-JsonStep 'a02-private-holoo-zip-staging.ps1' @(
      '-Mode','Stage','-SourceZip',$SourceZip,'-ConsentPhrase',$StagingConsent
    ) 'private-local-zip-staged-crc-and-tape-verified'
    Require ($staged.crcVerified -eq $true -and
      $staged.sqlTapeHeaderVerified -eq $true -and
      $staged.sqlBackupVerified -eq $false -and
      $staged.databaseModified -eq $false) 'A02_ZIP_STAGE_INCOMPLETE'
    $script:BackupPath=Assert-StagedBackup ([string]$staged.stagedBackupPath)
    [pscustomobject]@{
      status='private-zip-staged-crc-verified'
      stagedBackupPath=$script:BackupPath
      archiveBytes=$probe.archiveBytes;backupBytes=$staged.backupBytes
      crcVerified=$true;sqlBackupVerified=$false;restoreExecuted=$false
      financialMigrationPerformed=$false;canImport=$false
    } | ConvertTo-Json -Compress
    return
  }
  # Never create a new ZIP/BAK copy at this stage. The operator can grant
  # the named SQL service only the minimum read access to THIS existing copy
  # in a private and approved environment before SQL preflight.
  Require ([string]::IsNullOrWhiteSpace($SourceZip) -and
    [string]::IsNullOrWhiteSpace($StagingConsent)) 'A02_RESTORED_STAGE_MUST_NOT_REEXTRACT'
  $script:Phase='validate-staged-file'
  $script:BackupPath=Assert-StagedBackup $StagedBackupPath
  if($Mode -eq 'RestoreAndInventory'){
    Require ($RestoreConsent -ceq 'I_AUTHORIZE_A_NEW_ISOLATED_SQL_DATABASE') 'A02_RESTORE_CONSENT_REQUIRED'
    $script:Phase='validate-manifest-destination'
    Assert-ManifestDestination $ManifestOutputPath
  }else{
    Require ([string]::IsNullOrWhiteSpace($RestoreConsent) -and
      [string]::IsNullOrWhiteSpace($ManifestOutputPath)) 'A02_INSPECT_FORBIDS_RESTORE_ARGS'
  }
  $script:Phase='sql-header-filelist-verifyonly'
  $check=Invoke-JsonStep 'a02-isolated-sql-restore.ps1' @(
    '-Mode','Inspect','-BackupPath',$script:BackupPath
  ) 'backup-verifyonly-passed'
  Require ($check.restoreExecuted -eq $false -and
    $check.financialReconciled -eq $false -and
    $check.sourceSqlMajor -le $check.engineSqlMajor) 'A02_SQL_INSPECT_CONTRACT_INVALID'
  if($Mode -eq 'InspectStaged'){
    [pscustomobject]@{
      status='private-staged-sql-verifyonly-passed'
      stagedBackupPath=$script:BackupPath
      sourceSqlMajor=$check.sourceSqlMajor;engineSqlMajor=$check.engineSqlMajor
      engineEdition=$check.engineEdition;fileCount=$check.fileCount
      sqlBackupVerified=$true;restoreExecuted=$false
      financialMigrationPerformed=$false;canImport=$false
    } | ConvertTo-Json -Compress
    return
  }
  $script:Phase='sql-isolated-restore'
  $restored=Invoke-JsonStep 'a02-isolated-sql-restore.ps1' @(
    '-Mode','Restore','-BackupPath',$script:BackupPath,'-ConsentPhrase',$RestoreConsent
  ) 'isolated-restore-completed-needs-mapping-and-reconciliation'
  $database=[string]$restored.databaseName
  Require ($database -cmatch '^FinoraHoloo_[0-9a-f]{32}$' -and
    $restored.financialReconciled -eq $false -and
    $restored.importPerformed -eq $false -and
    $restored.dbccCheckDbPassed -eq $true) 'A02_RESTORE_CONTRACT_INVALID'
  $script:Phase='private-schema-export'
  $schema=Invoke-JsonStep 'a02-isolated-schema-inventory.ps1' @(
    '-Mode','PrivateManifest','-InstanceName','FINORAMIG',
    '-DatabaseName',$database,'-OutputPath',$ManifestOutputPath
  ) 'private-schema-manifest-encrypted'
  Require ($schema.dpapiScope -ceq 'CurrentUser' -and
    $schema.fileAclRestricted -eq $true -and
    $schema.userRowsRead -eq $false -and
    $schema.databaseModified -eq $false) 'A02_PRIVATE_SCHEMA_ENCRYPTION_INVALID'
  [pscustomobject]@{
    status='isolated-restore-and-encrypted-schema-created'
    isolatedDatabaseName=$database;stagedBackupPath=$script:BackupPath
    encryptedSchemaManifestPath=$ManifestOutputPath
    tableCount=$schema.tableCount;columnCount=$schema.columnCount
    sqlBackupVerified=$true;restoreExecuted=$true;dbccCheckDbPassed=$true
    financialReconciled=$false;financialMigrationPerformed=$false;canImport=$false
  } | ConvertTo-Json -Compress
}catch{
  # Failed restore can leave a NEW incomplete DB. Never silently delete it.
  Write-Error ('A02_PRIVATE_LAB_BLOCKED_AT_'+$script:Phase.ToUpperInvariant().Replace('-','_')+
    '_NO_IMPORT_MANUAL_REVIEW_OF_PRIVATE_STAGING_AND_SQL_MAY_BE_REQUIRED')
  exit 2
}
