param(
  [string]$AttemptId,
  [string]$ManagerId,
  [string]$AttemptDirectory,
  [string]$ObserverLogPath,
  [string]$ExistingFixtureDirectory,
  [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($ValidateOnly) { Write-Output 'PowerShell parser accepted measure-api-memory.ps1'; exit 0 }

$RepoRoot = 'D:\worktrees\tuari_react_hono\t3-51878482-502a4628cb7b8399'
$ApiRoot = Join-Path $RepoRoot 'apps\api'
$NodeExe = 'C:\Users\sensei57\AppData\Local\nvm\v22.14.0\node.exe'
$ReceiptPath = "D:\temp\tuari-q21-heavy-watch\receipts\$AttemptId.json"
$NodeModules = Join-Path $ApiRoot 'node_modules'
$TsxLoader = Join-Path $NodeModules 'tsx\dist\loader.mjs'
$TsxSpecifier = ([System.Uri]$TsxLoader).AbsoluteUri
$NativeBinding = Join-Path $NodeModules 'better-sqlite3\build\Release\better_sqlite3.node'
$Seeder = Join-Path $ApiRoot 'scripts\seed-api-memory-fixture.ts'
$Oracle = Join-Path $ApiRoot 'scripts\assert-api-memory-fixture.ts'
$ReadClient = Join-Path $ApiRoot 'scripts\read-api-memory-fixture.ts'
$EntryPoint = Join-Path $ApiRoot 'src\index.ts'
$TimeoutCode = 124
$CapCode = 125
$FailureCode = 1
$ExitCode = 1
$ApiProcess = $null
$ApiShutdownRequested = $false
$ApiShutdownEvidence = $null
$ChildProcesses = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()
$PeriodicSamples = [System.Collections.Generic.List[object]]::new()
$RequiredSnapshots = [ordered]@{ startup = $null; afterHealth = $null; afterReads = $null }
$MetaPath = $null
$Meta = $null
$LogPath = $null
$FixtureDirectory = $null
$DatabasePath = $null
$QueuedAt = 0L
$Deadline = 0L
$CurrentPhase = 'preflight'
$ApiPid = 0
$LastSampleUtc = [DateTimeOffset]::MinValue
$MaxLogBytes = 40MB
$MaxDatabaseBytes = 256MB
$MaxAttemptBytes = 256MB
$MaxApiRssBytes = 1GB
$MinCFreeBytes = 1.5GB
$MinDFreeBytes = 2GB
$MinAvailableRamBytes = 1GB
$MaxRows = 20000

function Write-Log([string]$Text) {
  $line = "$(Get-Date -Format o) $Text"
  [System.IO.File]::AppendAllText($LogPath, $line + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
  Write-Host $line
}
function Save-Meta {
  if (-not $MetaPath -or -not $Meta) { return }
  $Meta.updatedUtc = [DateTimeOffset]::UtcNow.ToString('o')
  [System.IO.File]::WriteAllText($MetaPath, ($Meta | ConvertTo-Json -Depth 12), [System.Text.UTF8Encoding]::new($false))
}
function Get-DriveFreeBytes([string]$Name) {
  $drive = Get-PSDrive -Name $Name -ErrorAction Stop
  return [int64]$drive.Free
}
function Get-AvailableRamBytes {
  $os = Get-CimInstance -ClassName Win32_OperatingSystem -OperationTimeoutSec 5 -ErrorAction Stop
  return [int64]$os.FreePhysicalMemory * 1024
}
function Get-DirectoryBytes([string]$Path, [switch]$LogsOnly) {
  if (-not (Test-Path -LiteralPath $Path)) { return [int64]0 }
  for ($scan = 1; $scan -le 3; $scan++) {
    try {
      $sum = [int64]0
      foreach ($file in Get-ChildItem -LiteralPath $Path -File -Recurse -Force -ErrorAction Stop) {
        if (-not $LogsOnly -or $file.Name.EndsWith('.log', [StringComparison]::OrdinalIgnoreCase)) { $sum += [int64]$file.Length }
      }
      return $sum
    } catch {
      $missing = $_.Exception -is [System.IO.FileNotFoundException] -or $_.Exception -is [System.IO.DirectoryNotFoundException]
      if ($_.Exception -is [System.ComponentModel.Win32Exception]) { $missing = $_.Exception.NativeErrorCode -in @(2, 3) }
      if (-not $missing -or $scan -eq 3) { throw }
      Write-Log "retrying complete byte scan after concurrent rename/removal path=$Path scan=$scan"
      Start-Sleep -Milliseconds 100
    }
  }
}
function Get-LogBytes([string]$Path) {
  return Get-DirectoryBytes $Path -LogsOnly
}
function Get-DatabaseFamilyBytes {
  if (-not $FixtureDirectory) { return [int64]0 }
  return Get-DirectoryBytes $FixtureDirectory
}
function Get-ProcessDescendants([int[]]$Roots) {
  if ($Roots.Count -eq 0) { return @() }
  $all = Get-CimInstance -ClassName Win32_Process -OperationTimeoutSec 5 -ErrorAction Stop
  $known = [System.Collections.Generic.HashSet[int]]::new()
  foreach ($root in $Roots) { [void]$known.Add($root) }
  $descendants = @{}
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($process in $all) {
      $childPid = [int]$process.ProcessId
      if ($known.Contains([int]$process.ParentProcessId) -and $known.Add($childPid)) {
        $descendants[$childPid] = [ordered]@{ pid = $childPid; parentPid = [int]$process.ParentProcessId; creationDate = [string]$process.CreationDate; executable = [string]$process.ExecutablePath; commandLine = [string]$process.CommandLine }
        $changed = $true
      }
    }
  }
  return @($descendants.Values)
}
function Assert-ApiAlive([string]$Phase) {
  if (-not $ApiProcess) { return }
  $ApiProcess.Refresh()
  if ($ApiProcess.HasExited -and -not $ApiShutdownRequested) {
    try { $Meta.apiOwnedDescendants = @(Get-ProcessDescendants @($ApiPid)); Save-Meta } catch { }
    throw "API exited unexpectedly during $Phase with native exit $($ApiProcess.ExitCode)"
  }
}
function Get-ApiSnapshot([string]$Phase) {
  if (-not $ApiPid) { throw "Cannot take $Phase snapshot before API PID is recorded" }
  Assert-ApiAlive $Phase
  $process = Get-Process -Id $ApiPid -ErrorAction Stop
  return [ordered]@{ timestampUtc = [DateTimeOffset]::UtcNow.ToString('o'); phase = $Phase; pid = $ApiPid; workingSetBytes = [int64]$process.WorkingSet64; privateBytes = [int64]$process.PrivateMemorySize64 }
}
function Add-PeriodicMemorySample([string]$Phase) {
  if ($PeriodicSamples.Count -ge 14) { return }
  $sample = Get-ApiSnapshot $Phase
  $PeriodicSamples.Add($sample)
  $script:LastSampleUtc = [DateTimeOffset]::UtcNow
}
function Add-RequiredSnapshot([string]$Key, [string]$Phase) {
  if (-not $RequiredSnapshots.Contains($Key) -or $RequiredSnapshots[$Key]) { throw "Required snapshot slot $Key is missing or already filled" }
  $snapshot = Get-ApiSnapshot $Phase
  $RequiredSnapshots[$Key] = $snapshot
  $script:LastSampleUtc = [DateTimeOffset]::UtcNow
}
function Check-Caps([string]$Phase) {
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if ($now -ge $Deadline) { throw [TimeoutException]::new("admission-inclusive deadline reached during $Phase") }
  $cFree = Get-DriveFreeBytes 'C'
  $dFree = Get-DriveFreeBytes 'D'
  $ram = Get-AvailableRamBytes
  $dbBytes = Get-DatabaseFamilyBytes
  $logBytes = Get-LogBytes $AttemptDirectory
  $outputBytes = Get-DirectoryBytes $AttemptDirectory
  if ($ExistingFixtureDirectory) { $outputBytes += $dbBytes }
  $apiRss = [int64]0
  if ($ApiPid) {
    Assert-ApiAlive $Phase
    if (-not $ApiProcess.HasExited) { $apiRss = [int64](Get-Process -Id $ApiPid -ErrorAction Stop).WorkingSet64 }
    $Meta.apiOwnedDescendants = @(Get-ProcessDescendants @($ApiPid))
  }
  $Meta.lastCaps = [ordered]@{ timestampUtc = [DateTimeOffset]::UtcNow.ToString('o'); phase = $Phase; cFreeBytes = $cFree; dFreeBytes = $dFree; availableRamBytes = $ram; databaseFamilyBytes = $dbBytes; attemptLogBytes = $logBytes; fixtureAndOutputBytes = $outputBytes; apiWorkingSetBytes = $apiRss }
  Save-Meta
  if ($cFree -lt $MinCFreeBytes) { throw [InvalidOperationException]::new("C: free-space cap crossed during ${Phase}: $cFree bytes") }
  if ($dFree -lt $MinDFreeBytes) { throw [InvalidOperationException]::new("D: free-space cap crossed during ${Phase}: $dFree bytes") }
  if ($ram -lt $MinAvailableRamBytes) { throw [InvalidOperationException]::new("available RAM cap crossed during ${Phase}: $ram bytes") }
  if ($dbBytes -gt $MaxDatabaseBytes) { throw [InvalidOperationException]::new("fixture family including database, backups, attachments and fixture-local output exceeded 256 MiB during ${Phase}: $dbBytes bytes") }
  if ($outputBytes -gt $MaxAttemptBytes) { throw [InvalidOperationException]::new("total attempt fixture, temp and log output exceeded 256 MiB during ${Phase}: $outputBytes bytes") }
  if ($logBytes -gt $MaxLogBytes) { throw [InvalidOperationException]::new("attempt logs exceeded 40 MiB during ${Phase}: $logBytes bytes") }
  if ($ApiPid -and $apiRss -gt $MaxApiRssBytes) { throw [InvalidOperationException]::new("API working set exceeded 1 GiB during ${Phase}: $apiRss bytes") }
}
function Record-Process([System.Diagnostics.Process]$Process, [string]$Name, [string]$Command, [string]$Stdout, [string]$Stderr) {
  try { $Process.Refresh() } catch { }
  $processId = $null
  try { $processId = [int]$Process.Id } catch { }
  $startedUtc = 'unavailable'
  try { $startedUtc = $Process.StartTime.ToUniversalTime().ToString('o') } catch { }
  $cim = $null
  if ($null -ne $processId) {
    try { $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -OperationTimeoutSec 5 -ErrorAction Stop | Select-Object -First 1 } catch { }
  }
  $parentPid = 'unavailable'; $executable = 'unavailable'; $commandLine = 'unavailable'
  if ($cim) {
    $parentPid = [string]$cim.ParentProcessId
    if ($cim.ExecutablePath) { $executable = [string]$cim.ExecutablePath }
    if ($cim.CommandLine) { $commandLine = [string]$cim.CommandLine }
  }
  $recordedPid = 'unavailable'
  if ($null -ne $processId) { $recordedPid = $processId }
  $entry = [ordered]@{ name = $Name; pid = $recordedPid; parentProcessId = $parentPid; startedUtc = $startedUtc; requestedWorkingDirectory = $ApiRoot; requestedExecutable = $NodeExe; executable = $executable; commandLine = $commandLine; requestedCommand = $Command; stdoutPath = $Stdout; stderrPath = $Stderr; nativeExitCode = $null }
  $Meta.processes += $entry
  Save-Meta
  return $entry
}
function Start-Node([string]$Name, [string[]]$Arguments) {
  foreach ($arg in $Arguments) { if ($arg -match '\s') { throw "Whitespace in child argument is unsupported by the Windows process launcher: $Name" } }
  $command = ($Arguments -join ' ')
  $stdout = Join-Path $AttemptDirectory "$Name.stdout.log"
  $stderr = Join-Path $AttemptDirectory "$Name.stderr.log"
  if ((Test-Path -LiteralPath $stdout) -or (Test-Path -LiteralPath $stderr)) { throw "Refusing to overwrite $Name logs" }
  $process = Start-Process -FilePath $NodeExe -ArgumentList $command -WorkingDirectory $ApiRoot -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  [void]$process.Handle
  $ChildProcesses.Add($process)
  $entry = Record-Process $process $Name "$NodeExe $command" $stdout $stderr
  if ($Name -eq 'api') { $script:ApiProcess = $process; $script:ApiPid = [int]$process.Id }
  Write-Log "started $Name pid=$($process.Id) command=$($entry.commandLine)"
  return $process
}
function Wait-Child([System.Diagnostics.Process]$Process, [string]$Phase, [bool]$SampleApi = $false) {
  while ($true) {
    $Process.Refresh()
    if ($Process.HasExited) { return [int]$Process.ExitCode }
    Check-Caps $Phase
    if ($SampleApi -and ([DateTimeOffset]::UtcNow - $LastSampleUtc).TotalSeconds -ge 1) { Add-PeriodicMemorySample $Phase }
    $descendants = Get-ProcessDescendants @([int]$Process.Id)
    $Meta.lastOwnedDescendants = @($descendants)
    Save-Meta
    Start-Sleep -Milliseconds 500
  }
}
function Complete-Process([System.Diagnostics.Process]$Process, [string]$Name, [string]$Phase) {
  $code = Wait-Child $Process $Phase
  foreach ($entry in $Meta.processes) { if ($entry.pid -eq $Process.Id) { $entry.nativeExitCode = $code } }
  $remaining = @(Get-ProcessDescendants @([int]$Process.Id))
  if ($remaining.Count -gt 0) { $Meta.lastOwnedDescendants = @($remaining); Save-Meta; Stop-OwnedTree @([int]$Process.Id); throw "$Name exited with owned descendants still running" }
  Save-Meta
  Write-Log "$Name nativeExitCode=$code phase=$Phase"
  return $code
}
function Assert-ProductSource([string]$ExpectedRevision = 'dd4413845f1a95fa0606d469c1f6705af08cbfd5') {
  $paths = @('apps/api/src', 'packages', 'apps/api/package.json', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml')
  $head = & git -C $RepoRoot rev-parse HEAD
  if ($LASTEXITCODE -ne 0) { throw 'Cannot identify checkout HEAD' }
  & git -C $RepoRoot diff --quiet $ExpectedRevision -- @paths
  if ($LASTEXITCODE -ne 0) { throw 'Measured product source differs from approved revision, or revision is unavailable' }
  $untracked = @(& git -C $RepoRoot ls-files --others --exclude-standard -- @paths)
  if ($LASTEXITCODE -ne 0 -or $untracked.Count -ne 0) { throw 'Untracked measured product sources or failed source inventory' }
  $Meta.sourceVerification = [ordered]@{ expectedRevision = $ExpectedRevision; actualHead = [string]$head; productPaths = $paths; trackedDiffExit = 0; untrackedCount = 0 }
  Save-Meta
}
function Get-FreePort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'), 0)
  $listener.Start()
  try { return [int]$listener.LocalEndpoint.Port } finally { $listener.Stop() }
}
function Wait-ApiReady {
  while ($true) {
    $ApiProcess.Refresh()
    if ($ApiProcess.HasExited) { throw "API exited before /health, native exit $($ApiProcess.ExitCode)" }
    Check-Caps 'api-health'
    if (([DateTimeOffset]::UtcNow - $LastSampleUtc).TotalSeconds -ge 1) { Add-PeriodicMemorySample 'api-startup' }
    $response = $null
    try { $response = Invoke-RestMethod -Method Get -Uri "$Origin/health" -TimeoutSec 2 } catch { }
    if ($response -and $response.status -eq 'ok') { Add-RequiredSnapshot 'afterHealth' 'after-health'; return }
    Start-Sleep -Milliseconds 500
  }
}
function Invoke-ControlledApiStop {
  if (-not $ApiProcess) { throw 'API process was not recorded before shutdown' }
  Assert-ApiAlive 'pre-shutdown'
  $requestUtc = [DateTimeOffset]::UtcNow
  $script:ApiShutdownRequested = $true
  $Meta.apiShutdownRequested = $true
  Save-Meta
  Write-Log "requesting API SIGTERM pid=$ApiPid"
  $signal = Start-Node 'signal-api' @('-e', "process.kill(Number(process.argv[1]),'SIGTERM')", [string]$ApiPid)
  $signalExit = Complete-Process $signal 'signal-api' 'api-shutdown-signal'
  if ($signalExit -ne 0) { throw "SIGTERM request process failed with native exit $signalExit" }
  $stopAt = [DateTimeOffset]::UtcNow.AddSeconds(8)
  while ([DateTimeOffset]::UtcNow -lt $stopAt) {
    $ApiProcess.Refresh()
    if ($ApiProcess.HasExited) {
      $apiExit = [int]$ApiProcess.ExitCode
      if ($apiExit -ne 0 -and $apiExit -ne 1) { throw "Unexpected API native exit after shutdown request: $apiExit" }
      $kind = if ($apiExit -eq 0) { 'graceful-exit' } else { 'windows-controlled-termination' }
      $script:ApiShutdownEvidence = [ordered]@{ request = 'Node process.kill(pid, SIGTERM)'; signalRequestNativeExitCode = $signalExit; requestUtc = $requestUtc.ToString('o'); observedExitUtc = [DateTimeOffset]::UtcNow.ToString('o'); nativeExitCode = $apiExit; classification = $kind; graceful = ($apiExit -eq 0); windowsControlledTermination = ($apiExit -ne 0); expectedWindowsTermination = ($apiExit -ne 0) }
      foreach ($entry in $Meta.processes) { if ($entry.name -eq 'api') { $entry.nativeExitCode = $apiExit } }
      $Meta.apiShutdown = $ApiShutdownEvidence
      Save-Meta
      Write-Log "API shutdown classification=$kind nativeExitCode=$apiExit"
      return
    }
    Check-Caps 'api-shutdown'
    Start-Sleep -Milliseconds 250
  }
  throw [TimeoutException]::new('API did not exit within eight seconds after the controlled SIGTERM request')
}
function Invoke-TaskkillOwned([int]$ProcessId, [string]$Reason) {
  $output = & "$env:SystemRoot\System32\taskkill.exe" /PID $ProcessId /T /F 2>&1
  $code = [int]$LASTEXITCODE
  $output | Out-File -FilePath (Join-Path $AttemptDirectory 'taskkill.log') -Append -Encoding utf8
  $Meta.cleanupCommands += [ordered]@{ processId = $ProcessId; reason = $Reason; nativeExitCode = $code; timestampUtc = [DateTimeOffset]::UtcNow.ToString('o') }
  Save-Meta
}
function Stop-OwnedTree([int[]]$RootPids) {
  foreach ($root in $RootPids) {
    if ($root -gt 0) {
      $ownedRoot = $ChildProcesses | Where-Object { $_.Id -eq $root } | Select-Object -First 1
      if ($ownedRoot) {
        $ownedRoot.Refresh()
        if (-not $ownedRoot.HasExited) {
          Write-Log "forced cleanup limited to owned root pid=$root"
          Invoke-TaskkillOwned $root 'owned-root-process-tree'
        }
      }
    }
  }
  $knownDescendants = @()
  if ($Meta) { $knownDescendants = @(@($Meta.lastOwnedDescendants) + @($Meta.apiOwnedDescendants) | Sort-Object pid -Unique) }
  foreach ($child in $knownDescendants) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($child.pid)" -OperationTimeoutSec 5 -ErrorAction SilentlyContinue
    if ($current -and [string]$current.CreationDate -eq [string]$child.creationDate) {
      Write-Log "forced cleanup limited to observed owned descendant pid=$($child.pid)"
      Invoke-TaskkillOwned ([int]$child.pid) 'observed-owned-descendant'
    }
  }
}

try {
  if ($AttemptId -notmatch '^[A-Za-z0-9_-]{1,100}$') { throw 'AttemptId must be unique alphanumeric text' }
  if ($ManagerId -notmatch '^[A-Za-z0-9:_-]{1,180}$') { throw 'ManagerId must be the explicit manager thread ID' }
  $AttemptDirectory = [System.IO.Path]::GetFullPath($AttemptDirectory)
  $ObserverLogPath = [System.IO.Path]::GetFullPath($ObserverLogPath)
  if ($AttemptDirectory -notmatch '^D:\\' -or $ObserverLogPath -notmatch '^D:\\') { throw 'Attempt directory and durable log must be on D:' }
  if ($AttemptDirectory -match '\s' -or $ObserverLogPath -match '\s') { throw 'Attempt paths with whitespace are refused by this process launcher' }
  if ($ObserverLogPath -ne (Join-Path $AttemptDirectory 'wrapper.log')) { throw 'Observer durable log must be wrapper.log inside the unique attempt directory' }
  if (-not (Test-Path -LiteralPath $AttemptDirectory -PathType Container)) { throw "Outer watchdog must create this unique attempt directory first: $AttemptDirectory" }
  $preexisting = @(Get-ChildItem -LiteralPath $AttemptDirectory -Force -ErrorAction Stop)
  if ($preexisting.Count -ne 1 -or $preexisting[0].Name -cne 'tmp' -or -not $preexisting[0].PSIsContainer) { throw 'Attempt directory must contain only the outer-created D-drive tmp directory' }
  if (Test-Path -LiteralPath $ObserverLogPath) { throw "Refusing to overwrite observer log $ObserverLogPath" }
  if (-not (Test-Path -LiteralPath $ReceiptPath)) { throw "Missing observer receipt $ReceiptPath; arm it before heavy_run" }
  $receipt = Get-Content -LiteralPath $ReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $QueuedAt = [int64]$receipt.queued
  $Deadline = [int64]$receipt.deadline
  $hasReturned = $false
  if ($receipt.PSObject.Properties.Name -contains 'returned') { $hasReturned = $null -ne $receipt.returned }
  $hasNativeEnd = $false
  if ($receipt.PSObject.Properties.Name -contains 'nativeEnd') { $hasNativeEnd = $null -ne $receipt.nativeEnd }
  $hasStarted = $false
  if ($receipt.PSObject.Properties.Name -contains 'started') { $hasStarted = $null -ne $receipt.started }
  if ($receipt.id -cne $AttemptId -or $receipt.manager -cne $ManagerId -or $receipt.log -cne $ObserverLogPath -or $hasReturned -or $hasNativeEnd -or -not $hasStarted -or ($Deadline - $QueuedAt) -ne 600000) { throw 'Observer receipt must match attempt, manager, exact wrapper log, and ten-minute budget; be started but not ended or returned' }

  $tmp = Join-Path $AttemptDirectory 'tmp'
  $env:TEMP = $tmp; $env:TMP = $tmp; $env:TMPDIR = $tmp
  $FixtureDirectory = Join-Path $AttemptDirectory 'fixture'
  $MetaPath = Join-Path $AttemptDirectory 'meta.json'
  $LogPath = $ObserverLogPath
  New-Item -ItemType Directory -Path $LogPath.Substring(0, $LogPath.LastIndexOf('\')) -Force -ErrorAction Stop | Out-Null
  if (Test-Path -LiteralPath $LogPath) { throw "Refusing to overwrite observer log $LogPath" }
  [System.IO.File]::WriteAllText($LogPath, '', [System.Text.UTF8Encoding]::new($false))
  $Meta = [ordered]@{
    attemptId = $AttemptId; managerId = $ManagerId; worktree = $RepoRoot; sourcePin = 'dd4413845f1a95fa0606d469c1f6705af08cbfd5'; controllerPid = $PID; controllerStartedUtc = [DateTimeOffset]::UtcNow.ToString('o'); queuedAtEpochMs = $QueuedAt; deadlineEpochMs = $Deadline
    budgetMinutes = 10; apiShutdownRequested = $false; currentPhase = $CurrentPhase; processes = @(); cleanupCommands = @(); periodicSamples = @(); requiredSnapshots = $RequiredSnapshots; lastOwnedDescendants = @(); apiOwnedDescendants = @(); caps = [ordered]@{ cFreeMinBytes = $MinCFreeBytes; dFreeMinBytes = $MinDFreeBytes; availableRamMinBytes = $MinAvailableRamBytes; apiWorkingSetMaxBytes = $MaxApiRssBytes; fixtureFamilyMaxBytes = $MaxDatabaseBytes; totalAttemptOutputMaxBytes = $MaxAttemptBytes; attemptLogMaxBytes = $MaxLogBytes; rowsMax = $MaxRows }
  }
  Save-Meta
  Write-Log "controller started pid=$PID phase=$CurrentPhase attempt=$AttemptId manager=$ManagerId"
  Check-Caps 'preflight'
  foreach ($path in @($NodeExe, $TsxLoader, $NativeBinding, $Seeder, $Oracle, $ReadClient, $EntryPoint)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required installed runtime or script is absent: $path" }
  }
  Assert-ProductSource
  $versionProcess = Start-Node 'node-version' @('--version')
  $nodeVersionExit = Complete-Process $versionProcess 'node-version' 'node-version'
  if ($nodeVersionExit -ne 0) { throw "Node version command exited with native code $nodeVersionExit" }
  $nodeVersion = (Get-Content -LiteralPath (Join-Path $AttemptDirectory 'node-version.stdout.log') -Raw -Encoding UTF8).Trim()
  if ($nodeVersion -ne 'v22.14.0') { throw "Expected Node v22.14.0; got $nodeVersion" }
  $probeCode = "d=require('better-sqlite3'),db=Reflect.construct(d,[':memory:']),row=db.prepare('select'+String.fromCharCode(32)+'sqlite_version()'+String.fromCharCode(32)+'version').get();console.log(JSON.stringify({abi:process.versions.modules,arch:process.arch,sqlite:row.version}));db.close()"
  $probeProcess = Start-Node 'native-sqlite-probe' @('-e', $probeCode)
  $nativeExit = Complete-Process $probeProcess 'native-sqlite-probe' 'native-sqlite-probe'
  if ($nativeExit -ne 0) { throw "Node 22 better-sqlite3 native probe failed with exit $nativeExit" }
  $nativeProbe = Get-Content -LiteralPath (Join-Path $AttemptDirectory 'native-sqlite-probe.stdout.log') -Raw -Encoding UTF8 | ConvertFrom-Json
  $osInfo = Get-CimInstance Win32_OperatingSystem -OperationTimeoutSec 5 -ErrorAction Stop
  $Meta.runtime = [ordered]@{ node = $nodeVersion; nativeProbe = $nativeProbe; nodeAbi = $nativeProbe.abi; tsxLoader = $TsxLoader; nativeBinding = (Get-Item -LiteralPath $NativeBinding).FullName; sqlite = $nativeProbe.sqlite; os = $osInfo.Caption; nodeArchitecture = $nativeProbe.arch; osVersion = $osInfo.Version; osBuild = $osInfo.BuildNumber }
  Save-Meta
  Check-Caps 'native-probe'

  $port = Get-FreePort
  $Origin = "http://127.0.0.1:$port"
  $FixtureDirectory = Join-Path $AttemptDirectory 'fixture'
  if ($ExistingFixtureDirectory) {
    $FixtureDirectory = [System.IO.Path]::GetFullPath($ExistingFixtureDirectory)
    if ($FixtureDirectory -notmatch '^D:\\' -or $FixtureDirectory -match '\s' -or -not (Test-Path -LiteralPath $FixtureDirectory -PathType Container)) { throw 'Resume fixture must be an existing absolute whitespace-free D-drive directory' }
    if ($FixtureDirectory.StartsWith($AttemptDirectory, [StringComparison]::OrdinalIgnoreCase)) { throw 'Resume fixture must remain separate from the fresh output directory' }
    $priorManifest = Get-Content -LiteralPath (Join-Path $FixtureDirectory 'seed-result.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($priorManifest.sourcePin -cne 'dd4413845f1a95fa0606d469c1f6705af08cbfd5' -or $priorManifest.databasePath -cne (Join-Path $FixtureDirectory 'application.sqlite')) { throw 'Resume fixture manifest source or contained database path is invalid' }
  }
  $DatabasePath = Join-Path $FixtureDirectory 'application.sqlite'
  $env:TUARI_175_SAFETY_WRAPPER = '1'; $env:TUARI_175_API_PORT = [string]$port
  $secretBytes = [byte[]]::new(48)
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $random.GetBytes($secretBytes) } finally { $random.Dispose() }
  $env:TUARI_175_TEST_SECRET = [Convert]::ToBase64String($secretBytes).TrimEnd('=').Replace('+', 'A').Replace('/', 'B')
  $env:NODE_ENV = 'test'; $env:NODE_OPTIONS = ''; $env:TUARI_CONFIG_FILE = ''
  $env:BETTER_AUTH_SECRET = $env:TUARI_175_TEST_SECRET; $env:BOOTSTRAP_SETUP_KEY = ''
  $env:DB_ADAPTER = 'sqlite'; $env:APP_DB_KEY = ''; $env:APP_DB_PATH = $DatabasePath
  $env:APP_ATTACHMENTS_ROOT = Join-Path $FixtureDirectory 'attachments'; $env:APP_BACKUPS_ROOT = Join-Path $FixtureDirectory 'backups'
  $env:API_HOST = '127.0.0.1'; $env:API_PORT = [string]$port; $env:WEB_PORT = [string]$port; $env:ALLOWED_ORIGINS = $Origin
  $env:TUARI_LICENSE_STATUS = 'trial'; $env:API_AUTH_RATE_LIMIT_MAX_REQUESTS = '100'
  $Meta.port = $port; $Meta.origin = $Origin; $Meta.fixtureDirectory = $FixtureDirectory; $Meta.databasePath = $DatabasePath
  Save-Meta

  if ($ExistingFixtureDirectory) {
    $Meta.reusedFixture = $FixtureDirectory
    Save-Meta
    Write-Log 'preserving previously verified synthetic fixture; no seeder replay'
  } else {
    $CurrentPhase = 'seed'; $Meta.currentPhase = $CurrentPhase; Save-Meta; Write-Log 'starting supported-service fixture seeder'
    Check-Caps 'pre-seed'
    $seed = Start-Node 'seed' @('--import', $TsxSpecifier, $Seeder, $FixtureDirectory)
    $seedExit = Complete-Process $seed 'seed' 'seed'
    if ($seedExit -ne 0) { throw "fixture seeder exited with native code $seedExit" }
  }

  $manifestPath = Join-Path $FixtureDirectory 'seed-result.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'seeder exited without its manifest' }
  $CurrentPhase = 'read-only-oracle'; $Meta.currentPhase = $CurrentPhase; Save-Meta; Write-Log 'running separate read-only fixture oracle'
  Check-Caps 'pre-oracle'
  $oracle = Start-Node 'oracle' @('--import', $TsxSpecifier, $Oracle, $manifestPath)
  $oracleExit = Complete-Process $oracle 'oracle' 'read-only-oracle'
  if ($oracleExit -ne 0) { throw "read-only fixture oracle exited with native code $oracleExit" }
  $oracleOutput = Get-Content -LiteralPath (Join-Path $AttemptDirectory 'oracle.stdout.log') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($oracleOutput.status -ne 'fixture-verified' -or [int]$oracleOutput.userTableRows -gt $MaxRows -or [int]$oracleOutput.foreignKeyViolations -ne 0) { throw 'read-only oracle output failed the wrapper acceptance checks' }
  $Meta.fixtureOracle = $oracleOutput; Save-Meta

  $CurrentPhase = 'api-startup'; $Meta.currentPhase = $CurrentPhase; Save-Meta; Write-Log 'starting real apps/api/src/index.ts in an owned Node 22 process'
  Check-Caps 'pre-api'
  Assert-ProductSource
  $api = Start-Node 'api' @('--import', $TsxSpecifier, 'src/index.ts')
  $ApiProcess = $api; $ApiPid = [int]$api.Id
  $apiEntry = $Meta.processes | Where-Object { $_.name -eq 'api' } | Select-Object -First 1
  if ($apiEntry.executable -ne $NodeExe -or $apiEntry.commandLine -notmatch 'src[/\\]index\.ts') { throw 'measured root PID is not the direct Node API entrypoint' }
  Add-RequiredSnapshot 'startup' 'api-startup'
  $CurrentPhase = 'api-health'; $Meta.currentPhase = $CurrentPhase; Save-Meta
  Wait-ApiReady

  $CurrentPhase = 'authenticated-reads'; $Meta.currentPhase = $CurrentPhase; Save-Meta; Write-Log 'running fixed authenticated read sequence; no query timings collected'
  Check-Caps 'pre-read-client'
  $client = Start-Node 'read-client' @('--import', $TsxSpecifier, $ReadClient, $manifestPath, $Origin)
  $clientExit = Wait-Child $client 'authenticated-reads' $true
  foreach ($entry in $Meta.processes) { if ($entry.pid -eq $client.Id) { $entry.nativeExitCode = $clientExit } }
  Save-Meta
  Write-Log "read-client nativeExitCode=$clientExit"
  if ($clientExit -ne 0) { throw "authenticated HTTP read client exited with native code $clientExit" }
  $readOutput = Get-Content -LiteralPath (Join-Path $AttemptDirectory 'read-client.stdout.log') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($readOutput.status -ne 'authenticated-reads-verified') { throw 'HTTP read client did not emit a verified result' }
  Add-RequiredSnapshot 'afterReads' 'after-fixed-reads'
  $readEndUtc = [DateTimeOffset]::UtcNow
  while ((([DateTimeOffset]::UtcNow - $readEndUtc).TotalSeconds -lt 3) -or ($PeriodicSamples.Count -lt 7)) {
    Check-Caps 'post-read-sample-window'
    if (([DateTimeOffset]::UtcNow - $LastSampleUtc).TotalSeconds -ge 1) { Add-PeriodicMemorySample 'post-read-settle' }
    Start-Sleep -Milliseconds 500
  }
  $Meta.httpReadResult = $readOutput; Save-Meta

  $CurrentPhase = 'api-shutdown'; $Meta.currentPhase = $CurrentPhase; Save-Meta
  Check-Caps 'pre-shutdown'
  Invoke-ControlledApiStop
  $apiExit = [int]$ApiProcess.ExitCode
  $remaining = @(Get-ProcessDescendants @($ApiPid))
  if ($remaining.Count -gt 0) { $Meta.lastOwnedDescendants = @($remaining); Stop-OwnedTree @($ApiPid); throw 'API left owned descendants after controlled shutdown' }
  if (-not $ApiShutdownEvidence -or $ApiShutdownEvidence.nativeExitCode -ne $apiExit) { throw 'API shutdown evidence does not match its actual native exit code' }

  $CurrentPhase = 'complete'; $Meta.currentPhase = $CurrentPhase
  foreach ($requiredKey in @('startup', 'afterHealth', 'afterReads')) { if (-not $RequiredSnapshots[$requiredKey]) { throw "Required memory snapshot $requiredKey is missing" } }
  $allSamples = @(@($RequiredSnapshots.Values) + @($PeriodicSamples) | Sort-Object { [DateTimeOffset]::Parse($_.timestampUtc) })
  $sortedWs = @($allSamples | ForEach-Object { [int64]$_.workingSetBytes } | Sort-Object)
  $sortedPrivate = @($allSamples | ForEach-Object { [int64]$_.privateBytes } | Sort-Object)
  $Meta.periodicSamples = @($PeriodicSamples)
  $Meta.requiredSnapshots = $RequiredSnapshots
  $Meta.samples = $allSamples
  $intervalsMs = @()
  for ($index = 1; $index -lt $allSamples.Count; $index++) { $intervalsMs += ([DateTimeOffset]::Parse($allSamples[$index].timestampUtc) - [DateTimeOffset]::Parse($allSamples[$index - 1].timestampUtc)).TotalMilliseconds }
  $Meta.memorySummary = [ordered]@{ metricSource = 'Windows Get-Process for the direct API PID'; sampleCount = $allSamples.Count; firstSampleUtc = $allSamples[0].timestampUtc; lastSampleUtc = $allSamples[$allSamples.Count - 1].timestampUtc; sampleIntervalsMs = $intervalsMs; sampledMaxWorkingSetBytes = $sortedWs[-1]; sampledMaxWorkingSetMiB = [Math]::Round($sortedWs[-1] / 1MB, 3); sampledMaxPrivateBytes = $sortedPrivate[-1]; sampledMaxPrivateMiB = [Math]::Round($sortedPrivate[-1] / 1MB, 3); apiPid = $ApiPid; warning = 'Snapshots and sampled maxima only. Not Node heap, lifetime peak, desktop memory, cold-start latency, or query timing.' }
  Save-Meta
  $ExitCode = 0
  Write-Log 'measurement preparation and read sequence completed; preserve fixture and logs'
} catch [System.TimeoutException] {
  $ExitCode = $TimeoutCode
  if ($MetaPath -and $Meta) { $Meta.failure = [ordered]@{ phase = $CurrentPhase; kind = 'timeout'; message = $_.Exception.Message; timestampUtc = [DateTimeOffset]::UtcNow.ToString('o') }; Save-Meta; Write-Log "timeout: $($_.Exception.Message)" }
} catch [System.InvalidOperationException] {
  $ExitCode = $CapCode
  if ($MetaPath -and $Meta) { $Meta.failure = [ordered]@{ phase = $CurrentPhase; kind = 'cap-or-safety'; message = $_.Exception.Message; timestampUtc = [DateTimeOffset]::UtcNow.ToString('o') }; Save-Meta; Write-Log "safety stop: $($_.Exception.Message)" }
} catch {
  $ExitCode = $FailureCode
  if ($MetaPath -and $Meta) { $Meta.failure = [ordered]@{ phase = $CurrentPhase; kind = 'error'; message = $_.Exception.Message; detail = $_.Exception.ToString(); scriptStackTrace = $_.ScriptStackTrace; errorId = $_.FullyQualifiedErrorId; timestampUtc = [DateTimeOffset]::UtcNow.ToString('o') }; Save-Meta; Write-Log "failed: $($_.Exception.Message)" }
} finally {
  $ownedRoots = @($ChildProcesses | ForEach-Object { [int]$_.Id } | Select-Object -Unique)
  if ($ExitCode -ne 0) { Stop-OwnedTree $ownedRoots }
  foreach ($process in $ChildProcesses) {
    try { $process.Refresh(); if ($process.HasExited) { foreach ($entry in $Meta.processes) { if ($entry.pid -eq $process.Id -and $null -eq $entry.nativeExitCode) { $entry.nativeExitCode = [int]$process.ExitCode } } } } catch { }
  }
  if ($MetaPath -and $Meta) { $Meta.periodicSamples = @($PeriodicSamples); $Meta.requiredSnapshots = $RequiredSnapshots; $Meta.controllerPlannedExitCode = $ExitCode; $Meta.controllerFinalizingUtc = [DateTimeOffset]::UtcNow.ToString('o'); Save-Meta }
  if ($LogPath -and (Test-Path -LiteralPath $LogPath)) { Write-Log "controller ended nativeExitCode=$ExitCode phase=$CurrentPhase" }
  foreach ($process in $ChildProcesses) { $process.Dispose() }
}
exit $ExitCode
