#requires -Version 5.1
<#
A02 private local lab: owner-only operator workflow, NOT end-user wizard.
Test is synthetic only. No SQL install, remote connection, financial import,
automatic privilege elevation, ACL modification, or automatic DROP DATABASE.
#>
[CmdletBinding()]
param(
 [ValidateSet('Test','StageAndInspect','RestoreAndInventory')]
 [string]$Mode='Test',
 [string]$SourceZip='',
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
function Invoke-JsonStep([string]$scriptName,[string[]]$args,[string]$expected){
  $file=Join-Path $PSScriptRoot $scriptName
  Require ([IO.File]::Exists($file)) 'A02_REQUIRED_HELPER_MISSING'
  # No raw error, SQL query or private source path is echoed by this wrapper.
  $output=@(& powershell.exe -NoProfile -NonInteractive -File $file @args 2>$null)
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
  [pscustomobject]@{
    status='private-lab-synthetic-orchestration-passed'
    checks=$tests.Count;ownerBackupUsed=$false;sqlServerInstalled=$false
    restoreExecuted=$false;financialMigrationPerformed=$false;canImport=$false
  } | ConvertTo-Json -Compress
  return
}

try{
  Require ($StagingConsent -ceq 'I_AUTHORIZE_PRIVATE_HOLOO_STAGING') 'A02_STAGING_CONSENT_REQUIRED'
  Require (-not [string]::IsNullOrWhiteSpace($SourceZip)) 'A02_OWNER_ZIP_PATH_REQUIRED'
  if($Mode -eq 'RestoreAndInventory'){
    Require ($RestoreConsent -ceq 'I_AUTHORIZE_A_NEW_ISOLATED_SQL_DATABASE') 'A02_RESTORE_CONSENT_REQUIRED'
    $script:Phase='validate-manifest-destination'
    Assert-ManifestDestination $ManifestOutputPath
  }else{
    Require ([string]::IsNullOrWhiteSpace($ManifestOutputPath) -and
      [string]::IsNullOrWhiteSpace($RestoreConsent)) 'A02_INSPECT_FORBIDS_RESTORE_ARGS'
  }

  $script:Phase='zip-envelope'
  $probe=Invoke-JsonStep 'a02-private-holoo-zip-staging.ps1' @('-Mode','Probe','-SourceZip',$SourceZip) 'zip-envelope-identified'
  Require ($probe.databaseModified -eq $false -and $probe.crcVerified -eq $false) 'A02_ZIP_PROBE_INVALID'

  $script:Phase='zip-stage-private'
  $staged=Invoke-JsonStep 'a02-private-holoo-zip-staging.ps1' @(
    '-Mode','Stage','-SourceZip',$SourceZip,'-ConsentPhrase',$StagingConsent
  ) 'private-local-zip-staged-crc-and-tape-verified'
  Require ($staged.crcVerified -eq $true -and $staged.sqlTapeHeaderVerified -eq $true -and
    $staged.sqlBackupVerified -eq $false -and $staged.databaseModified -eq $false) 'A02_ZIP_STAGE_INCOMPLETE'
  $script:BackupPath=[string]$staged.stagedBackupPath
  Require (-not [string]::IsNullOrWhiteSpace($script:BackupPath)) 'A02_STAGED_BACKUP_PATH_MISSING'

  $script:Phase='sql-header-filelist-verifyonly'
  $check=Invoke-JsonStep 'a02-isolated-sql-restore.ps1' @(
    '-Mode','Inspect','-BackupPath',$script:BackupPath
  ) 'backup-verifyonly-passed'
  Require ($check.restoreExecuted -eq $false -and
    $check.financialReconciled -eq $false -and
    $check.sourceSqlMajor -le $check.engineSqlMajor) 'A02_SQL_INSPECT_CONTRACT_INVALID'

  if($Mode -eq 'StageAndInspect'){
    [pscustomobject]@{
      status='private-backup-staged-and-sql-verified'
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
    $restored.importPerformed -eq $false) 'A02_RESTORE_CONTRACT_INVALID'

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
    sqlBackupVerified=$true;restoreExecuted=$true
    financialReconciled=$false;financialMigrationPerformed=$false;canImport=$false
  } | ConvertTo-Json -Compress
}catch{
  # A failed restore can leave a NEW incomplete DB or plaintext staged backup.
  # Never silently delete data or a SQL DB; leave inspection to the owner.
  Write-Error ('A02_PRIVATE_LAB_BLOCKED_AT_'+$script:Phase.ToUpperInvariant().Replace('-','_')+
    '_NO_IMPORT_MANUAL_REVIEW_OF_PRIVATE_STAGING_AND_SQL_MAY_BE_REQUIRED')
  exit 2
}
