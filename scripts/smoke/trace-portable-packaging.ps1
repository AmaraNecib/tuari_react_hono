# Record one unmodified portable packaging attempt and inspect its ZIP on an isolated Windows runner.
param(
  [Parameter(Mandatory = $true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $repo
if (Test-Path -LiteralPath $OutputDirectory) { throw "Refusing to overwrite diagnostics: $OutputDirectory" }
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$inspectionRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("tuari-portable-inspection-" + [guid]::NewGuid().ToString('N'))
$originalExtraction = Join-Path $inspectionRoot 'original-error-mode'
$strictExtraction = Join-Path $inspectionRoot 'strict-error-mode'
$record = [ordered]@{
  startedUtc = [DateTime]::UtcNow.ToString('o')
  sourceSha = (& git rev-parse HEAD)
  runnerOs = [Environment]::OSVersion.VersionString
  traceStarted = $false
  packagingExitCode = $null
  inspectionExitCode = $null
  traceStopExitCode = $null
  artifact = $null
  error = $null
  outcome = 'not started'
}
$traceOwned = $false
$exitCode = 1
$portableRoot = Join-Path $repo 'apps\desktop\src-tauri\target\release\bundle\portable'
$portableZip = Join-Path $portableRoot 'Tuari-portable.zip'
$portableZipFallback = Join-Path $portableRoot 'Tuari-portable-new.zip'
function Save-Snapshot([string]$Name) {
  Get-CimInstance Win32_Process -ErrorAction Continue |
    Select-Object ProcessId, ParentProcessId, Name, ExecutablePath |
    ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $OutputDirectory "$Name-processes.json")
  $paths = @($portableRoot, (Join-Path $portableRoot '.tmp-Tuari-portable'), (Join-Path $portableRoot 'Tuari-portable'), (Join-Path $portableRoot 'Tuari-portable-new'), $portableZip, $portableZipFallback)
  $items = foreach ($item in $paths) {
    if (Test-Path -LiteralPath $item) {
      Get-Item -LiteralPath $item | Select-Object FullName, Attributes, Length, CreationTimeUtc, LastWriteTimeUtc
    } else { [pscustomobject]@{ FullName = $item; Missing = $true } }
  }
  $items | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $OutputDirectory "$Name-files.json")
}
function Save-PortableInspection {
  $readyLine = Select-String -LiteralPath (Join-Path $OutputDirectory 'packaging.log') -Pattern 'Portable zip ready at (.+)$' | Select-Object -Last 1
  $loggedZip = if ($readyLine) { $readyLine.Matches[0].Groups[1].Value.Trim() } else { $null }
  $zipSelection = 'packaging log'
  if ($loggedZip -and (Test-Path -LiteralPath $loggedZip -PathType Leaf)) {
    $portableZip = (Resolve-Path -LiteralPath $loggedZip).Path
  } else {
    $zipSelection = 'existing output fallback, latest write time'
    $portableZip = @($portableZip, $portableZipFallback) |
      Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
      Sort-Object { (Get-Item -LiteralPath $_).LastWriteTimeUtc } -Descending |
      Select-Object -First 1
  }
  $portableName = if ($portableZip) { [IO.Path]::GetFileNameWithoutExtension($portableZip) } else { 'Tuari-portable' }
  $producerExe = @(
    (Join-Path $portableRoot "$portableName\Tuari.exe"),
    (Join-Path $portableRoot 'Tuari-portable\Tuari.exe'),
    (Join-Path $portableRoot 'Tuari-portable-new\Tuari.exe'),
    (Join-Path $portableRoot '.tmp-Tuari-portable\Tuari.exe')
  ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if ($producerExe) {
    $exeInfo = Get-Item -LiteralPath $producerExe
    $exeHash = (Get-FileHash -LiteralPath $producerExe -Algorithm SHA256).Hash
    [ordered]@{ present = $true; path = $producerExe; length = $exeInfo.Length; sha256 = $exeHash } |
      ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'producer-exe.json')
  } else {
    [ordered]@{ present = $false; reason = 'Tuari.exe not found in expected portable producer directories' } |
      ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'producer-exe.json')
  }

  if (-not $portableZip -or -not (Test-Path -LiteralPath $portableZip -PathType Leaf)) {
    [ordered]@{ present = $false; reason = 'portable ZIP missing after packaging' } |
      ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'zip-central-directory.json')
    $record.inspectionExitCode = 2
    $record.outcome = 'packaging completed; portable ZIP missing; extraction inspection unavailable'
    return
  }

  [Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') | Out-Null
  $archive = [System.IO.Compression.ZipFile]::OpenRead($portableZip)
  try {
    $entries = @($archive.Entries | ForEach-Object {
      [pscustomobject]@{ FullName = $_.FullName; Length = $_.Length }
    })
    $entries | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'zip-central-directory.json')
    $exeEntries = @($entries | Where-Object { [IO.Path]::GetFileName($_.FullName).Equals('Tuari.exe', [StringComparison]::OrdinalIgnoreCase) })
    $record.artifact = [ordered]@{
      zipPath = $portableZip
      zipSelection = $zipSelection
      zipLength = (Get-Item -LiteralPath $portableZip).Length
      zipSha256 = (Get-FileHash -LiteralPath $portableZip -Algorithm SHA256).Hash
      centralEntryCount = $entries.Count
      tuariExeEntries = $exeEntries
      producerExePresent = [bool]$producerExe
    }
  } finally { $archive.Dispose() }

  $tarExe = Join-Path $env:SystemRoot 'System32\tar.exe'
  $tarOutput = Join-Path $OutputDirectory 'tar-listing.log'
  $tarError = Join-Path $OutputDirectory 'tar-stderr.log'
  $tarProcess = Start-Process -FilePath $tarExe -ArgumentList @('-tf', ('"' + $portableZip + '"')) -Wait -PassThru -NoNewWindow -RedirectStandardOutput $tarOutput -RedirectStandardError $tarError
  $tarMatches = @(Select-String -LiteralPath $tarOutput -Pattern '(^|/)Tuari\.exe$' -CaseSensitive:$false)
  [ordered]@{ exitCode = $tarProcess.ExitCode; tuariExeListed = ($tarMatches.Count -gt 0); matchingEntries = @($tarMatches | ForEach-Object { $_.Line }) } |
    ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'tar-result.json')

  New-Item -ItemType Directory -Path $originalExtraction, $strictExtraction | Out-Null
  $originalStdout = Join-Path $OutputDirectory 'expand-original.stdout.log'
  $originalStderr = Join-Path $OutputDirectory 'expand-original.stderr.log'
  $strictStdout = Join-Path $OutputDirectory 'expand-strict.stdout.log'
  $strictStderr = Join-Path $OutputDirectory 'expand-strict.stderr.log'
  $escapedZip = $portableZip.Replace("'", "''")
  $escapedOriginal = $originalExtraction.Replace("'", "''")
  $escapedStrict = $strictExtraction.Replace("'", "''")
  $originalCommand = "Expand-Archive -Path '$escapedZip' -DestinationPath '$escapedOriginal' -Force"
  $strictCommand = "`$ErrorActionPreference = 'Stop'; Expand-Archive -Path '$escapedZip' -DestinationPath '$escapedStrict' -Force"
  $originalProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-Command', $originalCommand) -Wait -PassThru -NoNewWindow -RedirectStandardOutput $originalStdout -RedirectStandardError $originalStderr
  $strictProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-Command', $strictCommand) -Wait -PassThru -NoNewWindow -RedirectStandardOutput $strictStdout -RedirectStandardError $strictStderr
  $record.inspectionExitCode = if ($originalProcess.ExitCode -ne 0 -or $strictProcess.ExitCode -ne 0 -or $tarProcess.ExitCode -ne 0) { 1 } else { 0 }
  $extractedExe = @{}
  foreach ($mode in @(
    [pscustomobject]@{ name = 'original'; root = $originalExtraction; process = $originalProcess; stdout = $originalStdout; stderr = $originalStderr },
    [pscustomobject]@{ name = 'strict'; root = $strictExtraction; process = $strictProcess; stdout = $strictStdout; stderr = $strictStderr }
  )) {
    $files = @(Get-ChildItem -LiteralPath $mode.root -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
      [pscustomobject]@{ relativePath = $_.FullName.Substring($mode.root.Length + 1); length = $_.Length }
    })
    $files | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDirectory "extracted-$($mode.name)-inventory.json")
    $foundExe = @($files | Where-Object { [IO.Path]::GetFileName($_.relativePath).Equals('Tuari.exe', [StringComparison]::OrdinalIgnoreCase) }).Count -gt 0
    $extractedExe[$mode.name] = $foundExe
    [ordered]@{
      mode = $mode.name
      processExitCode = $mode.process.ExitCode
      stderrBytes = (Get-Item -LiteralPath $mode.stderr).Length
      stdoutBytes = (Get-Item -LiteralPath $mode.stdout).Length
      extractedFileCount = $files.Count
      tuariExeExtracted = $foundExe
      inventoryPath = "extracted-$($mode.name)-inventory.json"
    } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $OutputDirectory "expand-$($mode.name)-result.json")
  }
  $record.originalExpandExitCode = $originalProcess.ExitCode
  $record.strictExpandExitCode = $strictProcess.ExitCode
  $record.outcome = if ($record.inspectionExitCode -ne 0) { 'inspection command failed; packaging result recorded separately' } elseif ($record.artifact.tuariExeEntries.Count -eq 0) { 'packaging completed; Tuari.exe absent from ZIP central directory; cause unknown' } elseif ($originalProcess.ExitCode -ne 0 -or $strictProcess.ExitCode -ne 0) { 'packaging completed; extraction process failed; compare original and strict stderr, cause unknown' } elseif (-not $extractedExe.original -or -not $extractedExe.strict) { 'ZIP central directory contains Tuari.exe but extraction output does not; cause unknown' } else { 'packaging completed; ZIP entry and extraction observations recorded; no release verdict' }
}
try {
  $wpr = (Get-Command wpr.exe -ErrorAction Stop).Source
  & $wpr -profiles *> (Join-Path $OutputDirectory 'profiles.log')
  if ($LASTEXITCODE -ne 0) { throw "WPR profile discovery failed with exit $LASTEXITCODE" }
  Save-Snapshot 'before'
  # No cancel: a failed start must not stop another recorder's session.
  & $wpr -start FileIO -start Minifilter -start Handle -filemode *> (Join-Path $OutputDirectory 'trace-start.log')
  if ($LASTEXITCODE -ne 0) { throw "WPR start failed with exit $LASTEXITCODE; packaging was not run." }
  $traceOwned = $true
  $record.traceStarted = $true
  & cmd.exe /d /c 'pnpm --filter @tuari/desktop portable:only' *> (Join-Path $OutputDirectory 'packaging.log')
  $record.packagingExitCode = $LASTEXITCODE
  $exitCode = $LASTEXITCODE
  Save-PortableInspection
  if ($record.inspectionExitCode -ne 0 -and $exitCode -eq 0) { $exitCode = 1 }
  if ($record.packagingExitCode -ne 0) { $record.outcome = 'packaging failed; inspection evidence retained' }
} catch {
  $record.error = $_.Exception.Message
  if ($record.packagingExitCode -eq $null) { $record.outcome = 'diagnostic setup failed; packaging may not have run' }
  else { $record.outcome = 'inspection failed; packaging result recorded separately' }
  $_ | Out-String | Set-Content -LiteralPath (Join-Path $OutputDirectory 'wrapper-error.log')
  if ($exitCode -eq 0) { $exitCode = 1 }
} finally {
  if ($traceOwned) {
    & $wpr -stop (Join-Path $OutputDirectory 'packaging-and-inspection.etl') *> (Join-Path $OutputDirectory 'trace-stop.log')
    $record.traceStopExitCode = $LASTEXITCODE
    if ($LASTEXITCODE -ne 0 -and $exitCode -eq 0) { $exitCode = 1 }
  }
  try { Save-Snapshot 'after' } catch {
    $_ | Out-String | Set-Content -LiteralPath (Join-Path $OutputDirectory 'snapshot-error.log')
    if ($exitCode -eq 0) { $exitCode = 1 }
  }
  $record.endedUtc = [DateTime]::UtcNow.ToString('o')
  $record.exitCode = $exitCode
  $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'result.json')
  $record | ConvertTo-Json -Depth 8 | Write-Output
  Remove-Item -LiteralPath $inspectionRoot -Recurse -Force -ErrorAction SilentlyContinue
}
exit $exitCode
