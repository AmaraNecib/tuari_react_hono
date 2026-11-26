param(
  [string]$AttemptId,
  [string]$ManagerId,
  [string]$AttemptDirectory,
  [string]$ObserverLogPath,
  [string]$OuterLogPath,
  [string]$ExistingFixtureDirectory,
  [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($ValidateOnly) { Write-Output 'PowerShell parser accepted launch-api-memory-watchdog.ps1'; exit 0 }

$RepoRoot = 'D:\worktrees\tuari_react_hono\t3-51878482-502a4628cb7b8399'
$ApiRoot = Join-Path $RepoRoot 'apps\api'
$Controller = Join-Path $ApiRoot 'scripts\measure-api-memory.ps1'
$NodeExe = 'C:\Users\sensei57\AppData\Local\nvm\v22.14.0\node.exe'
$WatchScript = 'D:\temp\tuari-q21-heavy-watch\watch.mjs'
$ReceiptRoot = 'D:\temp\tuari-q21-heavy-watch\receipts'
$TimeoutCode = 124
$FailureCode = 1
$OuterExitCode = $FailureCode
$ControllerExitCode = $null
$TaskkillExitCode = $null
$TimedOut = $false
$ReceiptValidated = $false
$ControllerProcess = $null
$stdoutPath = $null
$stderrPath = $null
$ObserverLogFiles = [System.Collections.Generic.List[string]]::new()
$MaxOuterLogBytes = 4MB

function Write-OuterEvent([string]$Event, [System.Collections.IDictionary]$Fields = @{}) {
  $entry = [ordered]@{ event = $Event; timestampUtc = [DateTimeOffset]::UtcNow.ToString('o'); outerPid = $PID }
  foreach ($key in $Fields.Keys) { $entry[$key] = $Fields[$key] }
  $line = ($entry | ConvertTo-Json -Compress -Depth 8) + [Environment]::NewLine
  if ((Test-Path -LiteralPath $OuterLogPath) -and (Get-Item -LiteralPath $OuterLogPath).Length -gt $MaxOuterLogBytes) { throw 'outer watchdog durable log exceeded 4 MiB' }
  [System.IO.File]::AppendAllText($OuterLogPath, $line, [System.Text.UTF8Encoding]::new($false))
}
function Get-OuterLogBytes {
  $sum = [int64]0
  foreach ($path in (@($OuterLogPath, $stdoutPath, $stderrPath) + @($ObserverLogFiles))) {
    if ($path -and (Test-Path -LiteralPath $path)) { $sum += [int64](Get-Item -LiteralPath $path).Length }
  }
  return $sum
}
function Invoke-ObserverBounded([string]$Name, [string[]]$Arguments, [int]$TimeLimitMs = 0) {
  if ($TimeLimitMs -le 0 -and [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -ge $Deadline) {
    $result = [ordered]@{ name = $Name; pid = $null; nativeExitCode = 124; processNativeExitCode = $null; timedOut = $true; logCapExceeded = $false; elapsedMs = 0 }
    Write-OuterEvent 'observer-process-not-started' $result
    return $result
  }
  $observerStdout = "$OuterLogPath.observer-$Name.stdout.log"
  $observerStderr = "$OuterLogPath.observer-$Name.stderr.log"
  foreach ($path in @($observerStdout, $observerStderr)) { if (Test-Path -LiteralPath $path) { throw "Refusing to overwrite observer output $path" }; $ObserverLogFiles.Add($path) }
  $argumentList = @($WatchScript) + $Arguments
  foreach ($argument in $argumentList) { if ($argument -match '\s') { throw "Observer argument contains whitespace: $argument" } }
  $process = Start-Process -FilePath $NodeExe -ArgumentList ($argumentList -join ' ') -WorkingDirectory $ReceiptRoot -PassThru -NoNewWindow -RedirectStandardOutput $observerStdout -RedirectStandardError $observerStderr
  [void]$process.Handle
  $process.Refresh()
  $startedUtc = 'unavailable'; try { $startedUtc = $process.StartTime.ToUniversalTime().ToString('o') } catch { }
  Write-OuterEvent 'observer-process-started' @{ name = $Name; pid = [int]$process.Id; startedUtc = $startedUtc; stdoutPath = $observerStdout; stderrPath = $observerStderr }
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  $timedOut = $false
  $logCapExceeded = $false
  while ($true) {
    $process.Refresh()
    if ($process.HasExited) { break }
    $remaining = if ($TimeLimitMs -gt 0) { $TimeLimitMs - [int]$timer.ElapsedMilliseconds } else { $Deadline - [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
    if ($remaining -le 0) { $timedOut = $true; break }
    if ((Get-OuterLogBytes) -gt $MaxOuterLogBytes) { $logCapExceeded = $true; break }
    [void]$process.WaitForExit([int][Math]::Min(100, $remaining))
  }
  $process.Refresh()
  $processExit = $null
  if (-not $process.HasExited) {
    $killOutput = & "$env:SystemRoot\System32\taskkill.exe" /PID $process.Id /T /F 2>&1
    $killExit = [int]$LASTEXITCODE
    $killOutput | Out-File -FilePath $observerStderr -Append -Encoding utf8
    [void]$process.WaitForExit(3000)
    $process.Refresh()
    if ($process.HasExited) { $processExit = [int]$process.ExitCode }
    Write-OuterEvent 'observer-process-taskkill' @{ name = $Name; pid = [int]$process.Id; nativeExitCode = $killExit; timedOut = $true }
  } else {
    $processExit = [int]$process.ExitCode
    if ($TimeLimitMs -le 0 -and ([DateTimeOffset]$process.ExitTime.ToUniversalTime()).ToUnixTimeMilliseconds() -gt $Deadline) { $timedOut = $true }
  }
  $timer.Stop()
  $nativeExit = if ($timedOut) { 124 } elseif ($logCapExceeded) { 125 } else { $processExit }
  $result = [ordered]@{ name = $Name; pid = [int]$process.Id; nativeExitCode = $nativeExit; processNativeExitCode = $processExit; timedOut = $timedOut; logCapExceeded = $logCapExceeded; elapsedMs = [int64]$timer.ElapsedMilliseconds }
  Write-OuterEvent 'observer-process-ended' $result
  $process.Dispose()
  return $result
}
function Stop-ControllerTree {
  if (-not $ControllerProcess) { return }
  $ControllerProcess.Refresh()
  if ($ControllerProcess.HasExited) { return }
  $output = & "$env:SystemRoot\System32\taskkill.exe" /PID $ControllerProcess.Id /T /F 2>&1
  $TaskkillExitCode = [int]$LASTEXITCODE
  $script:TaskkillExitCode = $TaskkillExitCode
  $output | Out-File -FilePath $stderrPath -Append -Encoding utf8
  Write-OuterEvent 'controller-taskkill' @{ controllerPid = [int]$ControllerProcess.Id; nativeExitCode = $TaskkillExitCode; reason = 'admission-inclusive deadline or outer failure' }
  [void]$ControllerProcess.WaitForExit(5000)
  $ControllerProcess.Refresh()
  if ($ControllerProcess.HasExited) { $script:ControllerExitCode = [int]$ControllerProcess.ExitCode }
}

try {
  if ($AttemptId -notmatch '^[A-Za-z0-9_-]{1,100}$') { throw 'AttemptId must be unique alphanumeric text' }
  if ($ManagerId -notmatch '^[A-Za-z0-9:_-]{1,180}$') { throw 'ManagerId must be the explicit manager thread ID' }
  if (-not $AttemptDirectory -or -not $ObserverLogPath -or -not $OuterLogPath) { throw 'AttemptDirectory, ObserverLogPath, and OuterLogPath are required' }
  foreach ($path in @($AttemptDirectory, $ObserverLogPath, $OuterLogPath)) {
    if ($path -notmatch '^D:\\' -or $path -match '\s') { throw "All wrapper paths must be absolute, whitespace-free D: paths: $path" }
  }
  if ([System.IO.Path]::GetFullPath($ObserverLogPath) -cne $ObserverLogPath -or [System.IO.Path]::GetFullPath($AttemptDirectory) -cne $AttemptDirectory -or [System.IO.Path]::GetFullPath($OuterLogPath) -cne $OuterLogPath) { throw 'Pass canonical absolute paths exactly as they appear in the receipt' }
  if ($ObserverLogPath -cne (Join-Path $AttemptDirectory 'wrapper.log')) { throw 'ObserverLogPath must be wrapper.log inside AttemptDirectory' }
  $attemptPrefix = $AttemptDirectory.TrimEnd('\') + '\'
  if ($OuterLogPath.StartsWith($attemptPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'OuterLogPath and controller stdout/stderr must remain separate from the bounded attempt directory' }
  $outerParent = Split-Path -Parent $OuterLogPath
  if (-not (Test-Path -LiteralPath $outerParent -PathType Container)) { throw 'OuterLogPath parent directory must already exist on D:' }
  $stdoutPath = "$OuterLogPath.controller.stdout.log"
  $stderrPath = "$OuterLogPath.controller.stderr.log"
  foreach ($path in @($OuterLogPath, $stdoutPath, $stderrPath)) { if (Test-Path -LiteralPath $path) { throw "Refusing to overwrite outer watchdog output $path" } }
  if (Test-Path -LiteralPath $AttemptDirectory) { throw "Refusing to reuse attempt directory $AttemptDirectory" }
  $receiptPath = Join-Path $ReceiptRoot "$AttemptId.json"
  if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { throw "Missing observer receipt $receiptPath" }
  $receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $QueuedAt = [int64]$receipt.queued
  $Deadline = [int64]$receipt.deadline
  $hasReturned = $false
  if ($receipt.PSObject.Properties.Name -contains 'returned') { $hasReturned = $null -ne $receipt.returned }
  $hasNativeEnd = $false
  if ($receipt.PSObject.Properties.Name -contains 'nativeEnd') { $hasNativeEnd = $null -ne $receipt.nativeEnd }
  $hasStarted = $false
  if ($receipt.PSObject.Properties.Name -contains 'started') { $hasStarted = $null -ne $receipt.started }
  if ($receipt.id -cne $AttemptId -or $receipt.manager -cne $ManagerId -or $receipt.log -cne $ObserverLogPath -or $hasReturned -or $hasNativeEnd -or $hasStarted -or ($Deadline - $QueuedAt) -ne 600000) { throw 'Receipt identity, fresh state, log path, or exact ten-minute queue-inclusive budget is invalid' }
  $ReceiptValidated = $true
  [System.IO.File]::WriteAllText($OuterLogPath, '', [System.Text.UTF8Encoding]::new($false))
  Write-OuterEvent 'outer-started' @{ managerId = $ManagerId; attemptId = $AttemptId; queuedAtEpochMs = $QueuedAt; deadlineEpochMs = $Deadline; attemptDirectory = $AttemptDirectory; observerLogPath = $ObserverLogPath }
  New-Item -ItemType Directory -Path $AttemptDirectory -ErrorAction Stop | Out-Null
  $tempPath = Join-Path $AttemptDirectory 'tmp'
  New-Item -ItemType Directory -Path $tempPath -ErrorAction Stop | Out-Null
  $env:TEMP = $tempPath; $env:TMP = $tempPath; $env:TMPDIR = $tempPath
  $watchStartResult = Invoke-ObserverBounded -Name 'started' -Arguments @('started', $AttemptId, [string]$PID)
  Write-OuterEvent 'observer-started' @{ nativeExitCode = $watchStartResult.nativeExitCode; timedOut = $watchStartResult.timedOut }
  if ($watchStartResult.nativeExitCode -ne 0) { $TimedOut = $watchStartResult.timedOut; $OuterExitCode = if ($TimedOut) { $TimeoutCode } else { $FailureCode }; throw "Observer started receipt failed with native exit $($watchStartResult.nativeExitCode)" }
  if ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -ge $Deadline) { $TimedOut = $true; $OuterExitCode = $TimeoutCode; throw 'Admission-inclusive deadline expired before controller launch' }
  $controllerArguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $Controller, '-AttemptId', $AttemptId, '-ManagerId', $ManagerId, '-AttemptDirectory', $AttemptDirectory, '-ObserverLogPath', $ObserverLogPath)
  if ($ExistingFixtureDirectory) { $controllerArguments += @('-ExistingFixtureDirectory', $ExistingFixtureDirectory) }
  foreach ($argument in $controllerArguments) { if ($argument -match '\s') { throw "Controller argument contains whitespace: $argument" } }
  $controllerCommand = ($controllerArguments -join ' ')
  if ((Test-Path -LiteralPath $stdoutPath) -or (Test-Path -LiteralPath $stderrPath)) { throw 'Refusing to overwrite controller stdout/stderr logs' }
  $ControllerProcess = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $controllerCommand -WorkingDirectory $ApiRoot -PassThru -NoNewWindow -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  [void]$ControllerProcess.Handle
  $ControllerProcess.Refresh()
  $controllerStart = 'unavailable'
  try { $controllerStart = $ControllerProcess.StartTime.ToUniversalTime().ToString('o') } catch { }
  Write-OuterEvent 'controller-started' @{ controllerPid = [int]$ControllerProcess.Id; controllerStartedUtc = $controllerStart; requestedCommand = "$PSHOME\powershell.exe $controllerCommand"; stdoutPath = $stdoutPath; stderrPath = $stderrPath }

  while ($true) {
    $ControllerProcess.Refresh()
    if ($ControllerProcess.HasExited) {
      $logBytes = Get-OuterLogBytes
      if ($logBytes -gt $MaxOuterLogBytes) { throw "outer and controller logs exceeded 4 MiB: $logBytes bytes" }
      $ControllerExitCode = [int]$ControllerProcess.ExitCode
      $controllerExitUtc = [DateTimeOffset]$ControllerProcess.ExitTime.ToUniversalTime()
      if ($controllerExitUtc.ToUnixTimeMilliseconds() -gt $Deadline) { $TimedOut = $true }
      Write-OuterEvent 'controller-exited' @{ controllerPid = [int]$ControllerProcess.Id; controllerNativeExitCode = $ControllerExitCode; controllerExitUtc = $controllerExitUtc.ToString('o'); afterDeadline = $TimedOut }
      break
    }
    $logBytes = Get-OuterLogBytes
    if ($logBytes -gt $MaxOuterLogBytes) { throw "outer and controller logs exceeded 4 MiB: $logBytes bytes" }
    $remainingMs = $Deadline - [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if ($remainingMs -le 0) { $TimedOut = $true; break }
    $waitMs = [int][Math]::Min(250, $remainingMs)
    [void]$ControllerProcess.WaitForExit($waitMs)
  }
  if ($TimedOut) {
    Write-OuterEvent 'outer-timeout' @{ deadlineEpochMs = $Deadline; controllerPid = [int]$ControllerProcess.Id }
    Stop-ControllerTree
    $OuterExitCode = $TimeoutCode
  } else {
    $OuterExitCode = [int]$ControllerExitCode
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.ToString())
  $OuterExitCode = if ($TimedOut) { $TimeoutCode } else { $FailureCode }
  if ($OuterLogPath -and (Test-Path -LiteralPath $OuterLogPath)) { Write-OuterEvent 'outer-failure' @{ message = $_.Exception.Message } }
} finally {
  if ($ControllerProcess) {
    try { $ControllerProcess.Refresh(); if (-not $ControllerProcess.HasExited) { Stop-ControllerTree }; if ($ControllerProcess.HasExited -and $null -eq $ControllerExitCode) { $ControllerExitCode = [int]$ControllerProcess.ExitCode } } catch { }
  }
  if ($ReceiptValidated) {
    try {
      $watchEndResult = Invoke-ObserverBounded -Name 'ended' -Arguments @('ended', $AttemptId, [string]$OuterExitCode) -TimeLimitMs 5000
      Write-OuterEvent 'observer-ended' @{ nativeExitCode = $watchEndResult.nativeExitCode; timedOut = $watchEndResult.timedOut; outerNativeExitCode = $OuterExitCode }
      if ($watchEndResult.nativeExitCode -ne 0) { $OuterExitCode = $FailureCode }
    } catch { $OuterExitCode = $FailureCode; Write-OuterEvent 'observer-ended-failure' @{ message = $_.Exception.Message } }
  }
  if ($OuterLogPath -and (Test-Path -LiteralPath $OuterLogPath)) {
    Write-OuterEvent 'outer-ended' @{ nativeExitCode = $OuterExitCode; controllerNativeExitCode = $ControllerExitCode; timedOut = $TimedOut; taskkillNativeExitCode = $TaskkillExitCode }
  }
  if ($ControllerProcess) { $ControllerProcess.Dispose() }
}
exit $OuterExitCode
