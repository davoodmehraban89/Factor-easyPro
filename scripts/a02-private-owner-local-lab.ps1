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
 [string]$ExpectedBackupSha256='',
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
function Assert-A02StagedAcl($descriptor){
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  Require ($descriptor.AreAccessRulesProtected -and
    $descriptor.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $owner) 'A02_STAGED_BACKUP_ACL_OWNER_OR_INHERITANCE_UNSAFE'
  $trusted=@($owner,'S-1-5-18','S-1-5-32-544') | Select-Object -Unique
  # Optional, explicitly operator-authorized read access only for the
  # dedicated SQL service SID. Other extra trustees are not accepted.
  $serviceSid=$null
  try {
    $serviceName=[Security.Principal.NTAccount]::new('NT SERVICE','MSSQL$FINORAMIG')
    $serviceSid=$serviceName.Translate([Security.Principal.SecurityIdentifier]).Value
  } catch { }
  $seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $rules=@($descriptor.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  Require ($rules.Count -ge $trusted.Count -and
    $rules.Count -le ($trusted.Count+1)) 'A02_STAGED_BACKUP_ACL_UNEXPECTED_TRUSTEES'
  foreach($rule in $rules){
    $sid=$rule.IdentityReference.Value
    Require (-not $rule.IsInherited -and
      $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
      $seen.Add($sid)) 'A02_STAGED_BACKUP_ACL_NONEXPLICIT_OR_DUPLICATE'
    if($sid -in $trusted){
      Require ($rule.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl) 'A02_STAGED_BACKUP_CORE_ACCESS_CHANGED'
    }else{
      Require ($null -ne $serviceSid -and $sid -eq $serviceSid) 'A02_STAGED_BACKUP_EXTRA_TRUSTEE_UNSAFE'
      $writeBits=(
        [Security.AccessControl.FileSystemRights]::Write -bor
        [Security.AccessControl.FileSystemRights]::Modify -bor
        [Security.AccessControl.FileSystemRights]::Delete -bor
        [Security.AccessControl.FileSystemRights]::ChangePermissions -bor
        [Security.AccessControl.FileSystemRights]::TakeOwnership
      )
      Require (($rule.FileSystemRights -band $writeBits) -eq 0) 'A02_SQL_SERVICE_MUST_BE_READ_ONLY'
    }
  }
  foreach($sid in $trusted){
    Require ($seen.Contains($sid)) 'A02_STAGED_BACKUP_CORE_ACCESS_MISSING'
  }
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
  Assert-A02StagedAcl ($file.GetAccessControl())
  Assert-A02StagedAcl ($file.Directory.GetAccessControl())
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
    [string]::IsNullOrWhiteSpace($ExpectedBackupSha256) -and
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
  # Test the resume ACL gate IN MEMORY: never open owner staging paths
  # and never persist an insecure access rule.
  $acl=[Security.AccessControl.FileSecurity]::new()
  $acl.SetAccessRuleProtection($true,$false)
  $current=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.SetOwner($current)
  foreach($sidText in @($current.Value,'S-1-5-18','S-1-5-32-544') | Select-Object -Unique){
    $sid=[Security.Principal.SecurityIdentifier]::new([string]$sidText)
    $rule=[Security.AccessControl.FileSystemAccessRule]::new(
      $sid,[Security.AccessControl.FileSystemRights]::FullControl,
      [Security.AccessControl.AccessControlType]::Allow)
    [void]$acl.AddAccessRule($rule)
  }
  Assert-A02StagedAcl $acl
  $everyone=[Security.Principal.SecurityIdentifier]::new('S-1-1-0')
  [void]$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
    $everyone,[Security.AccessControl.FileSystemRights]::Read,
    [Security.AccessControl.AccessControlType]::Allow))
  $blocked=$false
  try{Assert-A02StagedAcl $acl}catch{$blocked=$true}
  Require $blocked 'A02_SELFTEST_BROAD_PUBLIC_BAK_ACL_ACCEPTED'
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
      [string]::IsNullOrWhiteSpace($ExpectedBackupSha256) -and
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
      $staged.stageAclRestricted -eq $true -and
      $staged.backupFileAclRestricted -eq $true -and
      $staged.sqlBackupVerified -eq $false -and
      $staged.databaseModified -eq $false) 'A02_ZIP_STAGE_INCOMPLETE'
    $script:BackupPath=Assert-StagedBackup ([string]$staged.stagedBackupPath)
    $stageDigest=(Get-FileHash -LiteralPath $script:BackupPath -Algorithm SHA256).Hash.ToUpperInvariant()
    [pscustomobject]@{
      status='private-zip-staged-crc-verified'
      stagedBackupPath=$script:BackupPath
      stagedBackupSha256=$stageDigest
      archiveBytes=$probe.archiveBytes;backupBytes=$staged.backupBytes
      crcVerified=$true;stageAclRestricted=$true;backupFileAclRestricted=$true
      sqlBackupVerified=$false;restoreExecuted=$false
      financialMigrationPerformed=$false;canImport=$false
    } | ConvertTo-Json -Compress
    return
  }
  # Resume with the SAME guarded private copy. No second ZIP extraction.
  Require ([string]::IsNullOrWhiteSpace($SourceZip) -and
    [string]::IsNullOrWhiteSpace($StagingConsent)) 'A02_NO_SECOND_ZIP_EXTRACTION'
  $script:Phase='validate-staged-file'
  $script:BackupPath=Assert-StagedBackup $StagedBackupPath
  Require ($ExpectedBackupSha256 -cmatch '^[a-fA-F0-9]{64}$') 'A02_EXPECTED_DIGEST_REQUIRED'
  $before=(Get-FileHash -LiteralPath $script:BackupPath -Algorithm SHA256).Hash
  Require ($before -ieq $ExpectedBackupSha256) 'A02_BACKUP_CHANGED_SINCE_STAGE'

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
  $after=(Get-FileHash -LiteralPath $script:BackupPath -Algorithm SHA256).Hash
  Require ($after -ieq $ExpectedBackupSha256) 'A02_BACKUP_CHANGED_DURING_SQL_VERIFY'

  if($Mode -eq 'InspectStaged'){
    [pscustomobject]@{
      status='private-staged-sql-verifyonly-passed'
      stagedBackupPath=$script:BackupPath
      sourceSqlMajor=$check.sourceSqlMajor;engineSqlMajor=$check.engineSqlMajor
      engineEdition=$check.engineEdition;fileCount=$check.fileCount
      sqlBackupVerified=$true;backupDigestContinuityVerified=$true
      restoreExecuted=$false;financialMigrationPerformed=$false;canImport=$false
    } | ConvertTo-Json -Compress
    return
  }

  $script:Phase='sql-isolated-restore'
  $restored=Invoke-JsonStep 'a02-isolated-sql-restore.ps1' @(
    '-Mode','Restore','-BackupPath',$script:BackupPath,
    '-ConsentPhrase',$RestoreConsent
  ) 'isolated-restore-completed-needs-mapping-and-reconciliation'
  $database=[string]$restored.databaseName
  Require ($database -cmatch '^FinoraHoloo_[0-9a-f]{32}$' -and
    $restored.financialReconciled -eq $false -and
    $restored.importPerformed -eq $false -and
    $restored.dbccCheckDbPassed -eq $true) 'A02_RESTORE_CONTRACT_INVALID'
  $restoredHash=(Get-FileHash -LiteralPath $script:BackupPath -Algorithm SHA256).Hash
  Require ($restoredHash -ieq $ExpectedBackupSha256) 'A02_BACKUP_CHANGED_DURING_SQL_RESTORE'

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
    backupDigestContinuityVerified=$true
    financialReconciled=$false;financialMigrationPerformed=$false;canImport=$false
  } | ConvertTo-Json -Compress
}catch{
  # Failure can leave an incomplete NEW isolated DB and unencrypted BAK copy.
  # Never automatically DROP or DELETE owner's private data.
  Write-Error ('A02_PRIVATE_LAB_BLOCKED_AT_'+$script:Phase.ToUpperInvariant().Replace('-','_')+
    '_NO_IMPORT_STAGED_BACKUP_OR_ISOLATED_DB_MAY_REQUIRE_MANUAL_REVIEW')
  exit 2
}
