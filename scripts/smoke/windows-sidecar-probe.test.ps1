$ErrorActionPreference = 'Stop'
$probePath = Join-Path $PSScriptRoot 'windows-sidecar-probe.ps1'
$container = Join-Path $env:TEMP ('tuari-sidecar-probe-test-' + [Guid]::NewGuid().ToString('N'))
$root = Join-Path $container 'child'
$entry = Join-Path $root 'bin\api-runtime\dist\index.cjs'
New-Item -ItemType Directory -Path $container -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path $entry) -Force | Out-Null
Set-Content -LiteralPath $entry -Value 'setInterval(() => {}, 1000);' -Encoding ascii

Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
using System.Text;
public static class TuariProbeTestPaths
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern uint GetShortPathName(string longPath, StringBuilder shortPath, uint bufferLength);
}
'@
$shortPath = New-Object System.Text.StringBuilder 32768
$shortLength = [TuariProbeTestPaths]::GetShortPathName($root, $shortPath, [uint32]$shortPath.Capacity)
if ($shortLength -eq 0 -or $shortPath.ToString() -eq $root) {
  throw "Test setup needs a distinct 8.3 alias for '$root'"
}
$shortEntry = Join-Path $shortPath.ToString() 'bin\api-runtime\dist\index.cjs'
$node = (Get-Command node.exe).Source
$fixture = $null
$longFixture = $null
$fixture = Start-Process -FilePath $node -ArgumentList ('"' + $shortEntry + '"') -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Milliseconds 300
  if ($fixture.HasExited) { throw "Fixture node process $($fixture.Id) exited before inspection" }

  $actual = (& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $probePath -ExtractDir $root | ConvertFrom-Json)
  $owned = @($actual.sidecars | Where-Object { $_.pid -eq $fixture.Id })
  if ($owned.Count -ne 1) {
    throw "Expected exact fixture PID $($fixture.Id) for long root '$root'; got $($actual.sidecars.Count) sidecar(s), probe error '$($actual.envError)'"
  }
  if (-not $owned[0].commandLine.ToLowerInvariant().Replace('\', '/').Contains($shortPath.ToString().ToLowerInvariant().Replace('\', '/'))) {
    throw "Fixture command line did not retain its short-path identity: $($owned[0].commandLine)"
  }
  Write-Output "PASS long-root alias matched exact short-path fixture PID $($fixture.Id)"
  Stop-Process -Id $fixture.Id -Force -ErrorAction SilentlyContinue
  Wait-Process -Id $fixture.Id -Timeout 10 -ErrorAction SilentlyContinue
  $fixture = $null

  $longFixture = Start-Process -FilePath $node -ArgumentList ('"' + $entry + '"') -PassThru -WindowStyle Hidden
  Start-Sleep -Milliseconds 300
  if ($longFixture.HasExited) { throw "Long-path fixture node process $($longFixture.Id) exited before inspection" }
  $shortRoot = $shortPath.ToString()
  $reverse = (& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $probePath -ExtractDir $shortRoot | ConvertFrom-Json)
  $reverseOwned = @($reverse.sidecars | Where-Object { $_.pid -eq $longFixture.Id })
  if ($reverseOwned.Count -ne 1) {
    throw "Expected exact fixture PID $($longFixture.Id) for short root '$shortRoot'; got $($reverse.sidecars.Count) sidecar(s), probe error '$($reverse.envError)'"
  }
  Write-Output "PASS short-root alias matched exact long-path fixture PID $($longFixture.Id)"

  $parentRoot = (& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $probePath -ExtractDir $container | ConvertFrom-Json)
  if (@($parentRoot.sidecars).Count -ne 0) {
    throw "Parent root '$container' incorrectly matched child PID(s) $(@($parentRoot.sidecars | ForEach-Object { $_.pid }) -join ', ')"
  }
  Write-Output 'PASS parent-root prefix did not match the child runtime'
} finally {
  if ($fixture) {
    Stop-Process -Id $fixture.Id -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $fixture.Id -Timeout 10 -ErrorAction SilentlyContinue
  }
  if ($longFixture) {
    Stop-Process -Id $longFixture.Id -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $longFixture.Id -Timeout 10 -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $container -Recurse -Force -ErrorAction SilentlyContinue
}
