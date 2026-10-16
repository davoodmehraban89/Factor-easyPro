# PowerShell 7. Disposable Windows GitHub Actions laboratory.
# Exercises REAL NSIS binaries: released v2.0.3 -> locally built candidate,
# and fresh candidate. No installed user data or public publishing.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$CandidateInstaller,
  [Parameter(Mandatory=$true)][string]$CandidateVersion,
  [string]$OldVersion = '2.0.3'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if (-not $env:GITHUB_ACTIONS -or $env:RUNNER_OS -ne 'Windows') {
  throw 'This test must run only on a disposable Windows GitHub Actions runner'
}
$lab = Join-Path $env:RUNNER_TEMP 'factor-easypro-native-vm-lab'
$reportDir = Join-Path $lab 'reports'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$summary = [ordered]@{
  lab='real-Windows-NSIS-WebView2'
  oldVersion=$OldVersion
  candidateVersion=$CandidateVersion
  install='not-run'
  upgrade='not-run'
  freshInstall='not-run'
  nativeGUI='not-run'
  status='FAILED'
}
function Verify-Installer([string]$file) {
  if (!(Test-Path -LiteralPath $file)) { throw "Installer does not exist: $file" }
  $size = (Get-Item -LiteralPath $file).Length
  if ($size -lt 500000) { throw "Installer size suspicious: $size" }
  return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
}
function Install-NSIS([string]$installer,[string]$directory) {
  # NSIS /D=path MUST be the final argument. The VM path has no spaces.
  if ($directory.Contains(' ')) { throw 'Use a disposable NSIS test path without spaces' }
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  $args = @('/S',("/D=" + $directory))
  Write-Host ("Installing " + (Split-Path $installer -Leaf) + ' to ' + $directory)
  $process = Start-Process -FilePath $installer -ArgumentList $args -PassThru
  try {
    if (-not $process.WaitForExit(150000)) {
      $process.Kill()
      throw 'NSIS silent installation timed out'
    }
    if ($process.ExitCode -ne 0) { throw "NSIS installer exited $($process.ExitCode)" }
  } finally { $process.Dispose() }
  # The current Rust binary target is "app.exe" even though the product
  # and NSIS installer are called Factor-easyPro. Check both explicitly.
  $candidate = Get-ChildItem -LiteralPath $directory -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -in @('app.exe', 'Factor-easyPro.exe') } | Select-Object -First 1
  if (-not $candidate) {
    $discovered = @(Get-ChildItem -LiteralPath $directory -Recurse -File -ErrorAction SilentlyContinue |
      Select-Object -First 15 -ExpandProperty FullName)
    Write-Host ("NSIS installation contents: " + ($discovered -join '; '))
    $uninstallRoots = @(
      'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
      'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
      'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    foreach ($registry in $uninstallRoots) {
      if (!(Test-Path $registry)) { continue }
      $entries = @(Get-ChildItem $registry -ErrorAction SilentlyContinue |
        Get-ItemProperty -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like 'Factor-easyPro*' })
      foreach ($entry in $entries) {
        $place = $entry.InstallLocation
        if (!$place -or !(Test-Path $place)) { continue }
        $candidate = Get-ChildItem -LiteralPath $place -Recurse -File -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -in @('app.exe', 'Factor-easyPro.exe') } |
          Select-Object -First 1
        if ($candidate) { break }
      }
      if ($candidate) { break }
    }
  }
  if (-not $candidate) { throw "Installed native app executable not found in $directory or uninstall registry" }
  if ($candidate.Length -lt 300000) { throw 'Installed executable suspiciously small' }
  return $candidate.FullName
}
function Run-Native([string]$exe,[string]$profile,[string]$mode,[string]$version) {
  $report = Join-Path $reportDir ($mode + '-native-result.json')
  & node 'tests/windows-vm-installed-tauri-cdp.cjs' $exe $profile $mode $version $report | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Installed native application $mode test failed (exit $LASTEXITCODE)" }
  $result = Get-Content $report -Raw | ConvertFrom-Json
  if ($result.status -ne 'PASSED' -or $result.installedNativeTauri -ne $true) {
    throw "Native $mode test did not verify real Tauri WebView2"
  }
  return $result
}
function Cleanup-Installed([string]$folder) {
  $uninstaller = Get-ChildItem -LiteralPath $folder -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'uninstall.*\.exe$' } | Select-Object -First 1
  if (-not $uninstaller) {
    Write-Warning "NSIS uninstaller not found in disposable folder $folder"
    return
  }
  $proc = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -PassThru
  try {
    if (!$proc.WaitForExit(90000)) { $proc.Kill(); throw 'Uninstaller timed out' }
    if ($proc.ExitCode -ne 0) { throw "Uninstaller failed with $($proc.ExitCode)" }
  } finally { $proc.Dispose() }
}
try {
  $newSha = Verify-Installer $CandidateInstaller
  $previous = Join-Path $lab ('Factor-easyPro_' + $OldVersion + '_x64-setup.exe')
  $checksum = Join-Path $lab 'v2.0.3-SHA256SUMS.txt'
  $releaseBase = 'https://github.com/davoodmehraban89/Factor-easyPro/releases/download/v' + $OldVersion + '/'
  Invoke-WebRequest -Uri ($releaseBase + (Split-Path $previous -Leaf)) -OutFile $previous
  Invoke-WebRequest -Uri ($releaseBase + 'SHA256SUMS.txt') -OutFile $checksum
  $checksumText = Get-Content $checksum -Raw
  $found = [regex]::Match($checksumText,'(?i)([0-9a-f]{64})\s+\*?Factor-easyPro_' +
    [regex]::Escape($OldVersion) + '_x64-setup.exe')
  if (-not $found.Success) { throw 'Previous public installer checksum not found' }
  $oldSha = Verify-Installer $previous
  if ($found.Groups[1].Value.ToUpperInvariant() -ne $oldSha.ToUpperInvariant()) {
    throw 'Previous public installer SHA256 verification FAILED'
  }
  if ($oldSha -eq $newSha) { throw 'Previous and candidate installers are byte-identical' }
  Write-Output "Verified signed-by-checksum public release artifact v$OldVersion"

  $upgradeDir = Join-Path $lab 'installed-upgrade'
  $upgradeData = Join-Path $lab 'webview2-upgrade-profile'
  $oldExe = Install-NSIS $previous $upgradeDir
  $summary.install = 'public-v' + $OldVersion + '-nsis-installed'
  $seed = Run-Native $oldExe $upgradeData 'seed' $OldVersion
  $summary.nativeGUI = 'old-native-CDP-connected'

  $newExe = Install-NSIS $CandidateInstaller $upgradeDir
  $summary.upgrade = 'nsis-in-place-upgrade-installed'
  $verified = Run-Native $newExe $upgradeData 'upgrade' $CandidateVersion
  $summary.upgrade = $verified.persistence
  $summary.nativeGUI = 'real-native-WebView2-validated'
  $summary.backupRecovery = $verified.backupRecovery
  $summary.atomicTamperRollback = $verified.immutableRestoreRollback
  # Reopen the real installed executable with the SAME Windows WebView2
  # profile after the restore and rollback tests. This proves disk durability.
  $reopened = Run-Native $newExe $upgradeData 'reopen' $CandidateVersion
  $summary.restartPersistence = $reopened.persistence

  $freshDir = Join-Path $lab 'installed-fresh'
  $freshData = Join-Path $lab 'webview2-fresh-profile'
  $freshExe = Install-NSIS $CandidateInstaller $freshDir
  $freshResult = Run-Native $freshExe $freshData 'fresh' $CandidateVersion
  $summary.freshInstall = $freshResult.indexedDb

  # A08: after all functional checks, measure the real installed candidate
  # using a separate disposable WebView2/IndexedDB profile. Never mix with
  # data-preservation or first-run validation profiles.
  $performanceData = Join-Path $lab 'webview2-native-performance-profile'
  $nativePerformance = Run-Native $freshExe $performanceData 'benchmark' $CandidateVersion
  $summary.nativePerformance = $nativePerformance.nativePerformance

  # A04 destructive fault injection is strictly confined to a disposable
  # Windows VM profile. Abruptly kill the native app during genuine importAll,
  # reopen SAME persistent profile and check not one staged row committed.
  $crashData = Join-Path $lab 'webview2-crash-restore-profile'
  $armed = Run-Native $freshExe $crashData 'crash-arm' $CandidateVersion
  if (!$armed.crashInjected.realWindowsProcessKilled) {
    throw 'Native restore process was not genuinely force-terminated'
  }
  $crashVerified = Run-Native $freshExe $crashData 'crash-verify' $CandidateVersion
  $summary.crashRestoreRollback = $crashVerified.crashRollback

  # Full Phase A integration contract: a green partial job is not enough.
  # Validate all essential paths on the SAME installed candidate before
  # declaring the disposable VM laboratory successful.
  $mandatory = @(
    'activate-accounting-and-inventory',
    'positive-opening-ledger-and-idempotency',
    'purchase-and-post-ledger',
    'partial-sale-and-inventory',
    'inactive-treasury-cheque-settlement',
    'treasury-cheque-reconciliation-readonly',
    'sale-return-immutable-stock-and-ledger',
    'purchase-return-and-stock-guardrails',
    'return-cash-settlement-net-credit',
    'append-only-history-bulk-clear-protection',
    'backup-and-atomic-rejection',
    'rtl-invoice-print-settings',
    'fiscal-close-atomic-guardrails',
    'opening-dry-run-rejects-existing-postings'
  )
  if (!$freshResult.nativeFunctional) {
    throw 'Native installed financial matrix was not reported'
  }
  foreach ($scenario in $mandatory) {
    if (!$freshResult.nativeFunctional.PSObject.Properties[$scenario]) {
      throw "Required installed native scenario missing: $scenario"
    }
  }
  if (!$freshResult.nativeOffline.simulatedOffline -or
      $freshResult.nativeOffline.routesChecked -ne 10) {
    throw 'All ten native offline routes were not verified'
  }
  if ($freshResult.nativePrint.pages -lt 2 -or
      $freshResult.nativePrint.itemRows -ne 110 -or
      $freshResult.nativePrint.physicalPrinter -ne 'not-tested') {
    throw 'WebView2 multi-page RTL PDF evidence is missing or misrepresented'
  }
  if ($nativePerformance.nativePerformance.products -ne 10000 -or
      $nativePerformance.nativePerformance.invoices -ne 50000 -or
      $nativePerformance.nativePerformance.companyInvoices -ne 50000) {
    throw 'Native 10k/50k actual IndexedDB performance coverage is incomplete'
  }
  if ($crashVerified.crashRollback -ne
      'killed-real-installed-Windows-WebView2-during-importAll-no-partial-rows-on-restart') {
    throw 'A04 actual process-crash restore rollback evidence is missing'
  }
  # New A08 criterion: this is *renderer JavaScript heap*, never total Windows
  # RAM/RSS. Require the real installed candidate's CDP memory measurements.
  $heap = $nativePerformance.nativePerformance.jsHeapBytes
  if (!$heap -or $nativePerformance.nativePerformance.jsHeapScope -ne
      'renderer-js-heap-not-total-Windows-process-memory' -or
      [long]$heap.beforeUsed -le 0 -or
      [long]$heap.afterUsed -le 0 -or
      [long]$heap.afterAllocated -lt [long]$heap.afterUsed) {
    throw 'Installed native WebView2 60k workload has no valid JS heap evidence'
  }
  $summary.integratedCoverage = [ordered]@{
    installedFinancialScenarios = $mandatory.Count
    offlineRoutes = 10
    printPdfPages = [int]$freshResult.nativePrint.pages
    benchmarkProducts = 10000
    benchmarkInvoices = 50000
    nativeJsHeapAfterUsedBytes = [long]$heap.afterUsed
    nativeJsHeapScope = 'renderer-only'
    crashRestoreRowsRemaining = 0
    independentHumanQA = 'not-covered'
    customerBackup = 'not-covered'
    physicalPrinter = 'not-covered'
  }
  $summary.status = 'PASSED'
  Write-Output 'Verified fresh installation, NSIS in-place upgrade, retained v6 records, native login and Windows DPAPI'
  Cleanup-Installed $freshDir
  Cleanup-Installed $upgradeDir
} catch {
  $summary.failure = $_.Exception.Message
  Write-Error $_.Exception.Message
  throw
} finally {
  New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
  $summary | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $reportDir 'lab-summary.json') -Encoding utf8
  $summary | ConvertTo-Json -Depth 5 | Write-Output
}
