# Read-only Holoo lab prerequisite check. Never prints credentials or database contents.
[CmdletBinding()]
param([switch]$Json)
$ErrorActionPreference = 'Stop'
$checks = New-Object System.Collections.Generic.List[object]
function Add-Check([string]$Name,[string]$Status,[string]$Detail) {
  $checks.Add([pscustomobject]@{ name=$Name; status=$Status; detail=$Detail })
}
try {
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  if ($null -eq $cpu) { Add-Check 'virtualization' 'UNKNOWN' 'CPU query returned no result' }
  elseif ($cpu.VirtualizationFirmwareEnabled -eq $true) {
    Add-Check 'virtualization' 'PASS' 'Firmware virtualization enabled'
  } else {
    Add-Check 'virtualization' 'BLOCKED' 'Firmware virtualization disabled; owner must enable it in BIOS/UEFI'
  }
} catch { Add-Check 'virtualization' 'UNKNOWN' 'Unable to query CPU virtualization state' }
try {
  $source = 'H:\Holoo\Holoo_dataSource.txt'
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    Add-Check 'runtime-source' 'UNKNOWN' 'Runtime source file not found'
  } else {
    # Do not print connection strings, server names, usernames, or secrets.
    Add-Check 'runtime-source' 'INFO' 'Runtime source file exists; isolation not established by this check'
  }
} catch { Add-Check 'runtime-source' 'UNKNOWN' 'Runtime source file could not be inspected' }
try {
  $svc = @(Get-Service -Name 'MSSQL$FINORA_LAB' -ErrorAction SilentlyContinue)
  if ($svc.Count -gt 0) {
    Add-Check 'dedicated-sql-service' 'INFO' 'Candidate lab service exists; independence and permissions require separate validation'
  } else {
    Add-Check 'dedicated-sql-service' 'BLOCKED' 'No dedicated FINORA_LAB SQL service detected; service name is configurable'
  }
} catch { Add-Check 'dedicated-sql-service' 'UNKNOWN' 'Could not inspect SQL services' }
Add-Check 'synthetic-data' 'UNVERIFIED' 'Synthetic-only dataset must be validated manually before behavioral tests'
Add-Check 'least-privilege' 'UNVERIFIED' 'Lab-only restricted account must be validated manually'
Add-Check 'network-isolation' 'UNVERIFIED' 'Offline or isolated VM network must be validated manually'
$blocked = @($checks | Where-Object { $_.status -in @('BLOCKED','UNVERIFIED','UNKNOWN') }).Count
$result = [pscustomobject]@{
  schemaVersion = 1
  readyForTrace = ($blocked -eq 0)
  checks = $checks.ToArray()
}
if ($Json) { $result | ConvertTo-Json -Depth 5 }
else { $checks | Format-Table -AutoSize; Write-Output ('READY_FOR_TRACE=' + $result.readyForTrace) }
# A read-only check cannot authorize trace or write operations.
if ($blocked -gt 0) { exit 2 }
