$ErrorActionPreference = 'Stop'
$probePath = Join-Path $PSScriptRoot 'windows-sidecar-probe.ps1'
$container = Join-Path $env:TEMP ('tuari sidecar probe parent with a long name ' + [Guid]::NewGuid().ToString('N'))
$childName = 'child extraction directory with an independent long name'
$root = Join-Path $container $childName
$entry = Join-Path $root 'bin\api-runtime\dist\index.cjs'
$node = (Get-Command node.exe).Source
$fixtures = @()

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class TuariProbeTestPaths
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern uint GetShortPathName(string longPath, StringBuilder shortPath, uint bufferLength);
}
'@

function Get-ShortPath([string]$Path) {
  $buffer = New-Object System.Text.StringBuilder 32768
  $length = [TuariProbeTestPaths]::GetShortPathName($Path, $buffer, [uint32]$buffer.Capacity)
  if ($length -eq 0) {
    throw "GetShortPathName failed for '$Path' (Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
  }
  $buffer.ToString()
}

function Invoke-Probe([string]$ExpectedRoot) {
  $json = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $probePath -ExtractDir $ExpectedRoot
  if ($LASTEXITCODE -ne 0) { throw "Probe process exited with code $LASTEXITCODE for '$ExpectedRoot'" }
  $json | ConvertFrom-Json
}

function Assert-OwnedFixture([int]$FixturePid, [string]$ExpectedRoot, [string]$Label) {
  $actual = Invoke-Probe $ExpectedRoot
  $owned = @($actual.sidecars | Where-Object { $_.pid -eq $FixturePid })
  if ($owned.Count -ne 1) {
    throw "Expected exact fixture PID $FixturePid for $Label root '$ExpectedRoot'; got $($owned.Count) exact fixture match(es) among $($actual.sidecars.Count) sidecar(s), probe error '$($actual.envError)'"
  }
}

try {
  New-Item -ItemType Directory -Path (Split-Path $entry) -Force | Out-Null
  Set-Content -LiteralPath $entry -Value 'setInterval(() => {}, 1000);' -Encoding ascii

  $parentShort = Get-ShortPath $container
  $childShort = Get-ShortPath $root
  $parentShortName = Split-Path $parentShort -Leaf
  $parentLongName = Split-Path $container -Leaf
  $childShortName = Split-Path $childShort -Leaf
  if ($parentShortName -eq $parentLongName) { throw "Test setup needs a distinct 8.3 alias for parent '$container'" }
  if ($childShortName -eq $childName) { throw "Test setup needs a distinct 8.3 alias for child '$root'" }
  $mixedParentShort = Join-Path $parentShort $childName
  $mixedChildShort = Join-Path $container $childShortName
  if ($mixedParentShort -eq $root -or $mixedChildShort -eq $root) {
    throw 'Test setup did not create two distinct mixed-alias roots'
  }
  Write-Output "ALIAS parent='$parentShort' child='$childShort' mixedA='$mixedParentShort' mixedB='$mixedChildShort'"

  $cases = @(
    @{ label = 'long root'; script = $entry; expected = @($root, $childShort, $mixedParentShort, $mixedChildShort) },
    @{ label = 'mixed parent-short/child-long root'; script = (Join-Path $mixedParentShort 'bin\api-runtime\dist\index.cjs'); expected = @($root, $childShort, $mixedParentShort, $mixedChildShort) },
    @{ label = 'mixed parent-long/child-short root'; script = (Join-Path $mixedChildShort 'bin\api-runtime\dist\index.cjs'); expected = @($root, $childShort, $mixedParentShort, $mixedChildShort) },
    @{ label = 'short root'; script = (Join-Path $childShort 'bin\api-runtime\dist\index.cjs'); expected = @($root, $childShort, $mixedParentShort, $mixedChildShort) }
  )

  foreach ($case in $cases) {
    $fixture = Start-Process -FilePath $node -ArgumentList @('"' + $case.script + '"') -PassThru -WindowStyle Hidden
    $fixtures += $fixture
    if ($fixture.Id -le 0) { throw "Start-Process returned invalid fixture PID $($fixture.Id)" }
    if ($fixture.HasExited) { throw "Fixture node process $($fixture.Id) exited before inspection" }
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($fixture.Id)"
    Write-Output "FIXTURE commandLine='$($processInfo.CommandLine)' executable='$($processInfo.ExecutablePath)'"
    foreach ($expectedRoot in $case.expected) {
      Assert-OwnedFixture -FixturePid $fixture.Id -ExpectedRoot $expectedRoot -Label $case.label
    }
    Write-Output "PASS $($case.label) matched exact fixture PID $($fixture.Id) across $($case.expected.Count) expected-root forms"
  }

  $siblingRoot = Join-Path $container ($childName + '-sibling')
  New-Item -ItemType Directory -Path (Join-Path $siblingRoot 'bin\api-runtime\dist') -Force | Out-Null
  $siblingEntry = Join-Path $siblingRoot 'bin\api-runtime\dist\index.cjs'
  Set-Content -LiteralPath $siblingEntry -Value 'setInterval(() => {}, 1000);' -Encoding ascii
  $negative = Start-Process -FilePath $node -ArgumentList @('"' + $siblingEntry + '"', '"' + $entry + 'suffix"') -PassThru -WindowStyle Hidden
  $fixtures += $negative
  foreach ($expectedRoot in @($root, $childShort, $mixedParentShort, $mixedChildShort, $container)) {
    $actual = Invoke-Probe $expectedRoot
    if (@($actual.sidecars | Where-Object { $_.pid -eq $negative.Id }).Count -ne 0) {
      throw "Unrelated sibling script or extra argument matched fixture PID $($negative.Id) for '$expectedRoot'"
    }
  }
  Write-Output "PASS sibling-root and expected-path-suffix argument were rejected for PID $($negative.Id)"

  $parentRoot = Invoke-Probe $container
  if (@($parentRoot.sidecars).Count -ne 0) {
    throw "Parent root '$container' incorrectly matched child PID(s) $(@($parentRoot.sidecars | ForEach-Object { $_.pid }) -join ', ')"
  }
  Write-Output 'PASS parent-root prefix did not match the child runtime'
} finally {
  foreach ($fixture in $fixtures) {
    if (-not $fixture.HasExited) { $fixture.Kill() }
    if (-not $fixture.WaitForExit(10000)) {
      throw "Fixture process handle for PID $($fixture.Id) did not exit within 10 seconds"
    }
  }
  if (Test-Path -LiteralPath $container) {
    Remove-Item -LiteralPath $container -Recurse -Force -ErrorAction SilentlyContinue
  }
}
