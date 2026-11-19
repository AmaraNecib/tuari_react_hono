param(
  [Parameter(Mandatory = $true)][string]$DiagnosticsDirectory
)

$ErrorActionPreference = 'Continue'
$diagnosticErrors = [System.Collections.Generic.List[string]]::new()
$wprOwned = $false
$packageExitCode = 1
$diagnosticDirectoryReady = $false
$wprPath = Join-Path $env:SystemRoot 'System32\wpr.exe'
$wprStatusLog = Join-Path $DiagnosticsDirectory 'wpr-status.log'
$wprStartLog = Join-Path $DiagnosticsDirectory 'wpr-start.log'
$wprStopLog = Join-Path $DiagnosticsDirectory 'wpr-stop.log'
$etlPath = Join-Path $DiagnosticsDirectory 'portable-rename.etl'
$wprInstance = "tuari-portable-$([Guid]::NewGuid().ToString('N'))"

try {
  New-Item -ItemType Directory -Path $DiagnosticsDirectory -Force -ErrorAction Stop | Out-Null
  $diagnosticDirectoryReady = $true
  $env:TUARI_PORTABLE_DIAGNOSTICS_DIR = $DiagnosticsDirectory
} catch {
  $diagnosticErrors.Add("diagnostic directory unavailable: $($_.Exception.Message)")
}

if ($diagnosticDirectoryReady -and (Test-Path -LiteralPath $wprPath)) {
  try {
    $status = & $wprPath -status -instancename $wprInstance 2>&1
    $statusCode = $LASTEXITCODE
    $status | Out-File -LiteralPath $wprStatusLog -Encoding utf8
    if ($statusCode -ne 0) {
      $diagnosticErrors.Add("wpr -status exited $statusCode")
    } elseif (($status -join "`n") -match 'not recording|no recording') {
      $start = & $wprPath -start FileIO -start Handle -filemode -recordtempto $DiagnosticsDirectory -instancename $wprInstance 2>&1
      $startCode = $LASTEXITCODE
      $start | Out-File -LiteralPath $wprStartLog -Encoding utf8
      if ($startCode -eq 0) {
        $wprOwned = $true
      } else {
        $diagnosticErrors.Add("wpr -start exited $startCode")
      }
    } else {
      $diagnosticErrors.Add('The unique WPR instance name is unexpectedly active; did not stop it')
    }
  } catch {
    $diagnosticErrors.Add("WPR start probe failed: $($_.Exception.Message)")
  }
} elseif ($diagnosticDirectoryReady) {
  $diagnosticErrors.Add('built-in wpr.exe is unavailable')
}

try {
  & pnpm --filter @tuari/desktop portable:only
  $packageExitCode = $LASTEXITCODE
} catch {
  $diagnosticErrors.Add("packaging process launch failed: $($_.Exception.Message)")
  $packageExitCode = 1
} finally {
  if ($wprOwned) {
    try {
      $stop = & $wprPath -stop $etlPath 'Tuari portable package diagnostic capture' -instancename $wprInstance 2>&1
      $stopCode = $LASTEXITCODE
      $stop | Out-File -LiteralPath $wprStopLog -Encoding utf8
      if ($stopCode -ne 0) {
        $diagnosticErrors.Add("wpr -stop exited $stopCode")
      }
    } catch {
      $diagnosticErrors.Add("WPR stop failed: $($_.Exception.Message)")
    }
  }

  if ($diagnosticErrors.Count -gt 0) {
    if ($diagnosticDirectoryReady) {
      $diagnosticErrors | Out-File -LiteralPath (Join-Path $DiagnosticsDirectory 'diagnostic-errors.log') -Encoding utf8 -Append
    }
    $diagnosticErrors | ForEach-Object { Write-Warning $_ }
  }
}

exit $packageExitCode
