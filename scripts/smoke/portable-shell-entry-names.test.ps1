$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'portable-shell-entry-names.ps1')
$names = @(Get-PortableShellEntryNames -Items @(
  [pscustomobject]@{ Name = 'Tuari'; Path = 'C:\owned\portable.zip\Tuari.exe' },
  [pscustomobject]@{ Name = 'Localized folder'; Path = 'C:\owned\portable.zip\bin' }
))
if ($names.Count -ne 2 -or $names[0] -ne 'Tuari.exe' -or $names[1] -ne 'bin') {
  throw "Hidden-extension display names changed identity: $($names -join ', ')"
}
$fake = @(Get-PortableShellEntryNames -Items @(
  [pscustomobject]@{ Name = 'Tuari.exe'; Path = 'C:\owned\portable.zip\Tuari.txt' }
))
if ($fake -contains 'Tuari.exe') { throw 'Display label falsely satisfied executable identity' }
$empty = @(Get-PortableShellEntryNames -Items @())
if ($empty.Count -ne 0) { throw 'Empty namespace must remain empty' }
Write-Output 'PASS hidden-extension and localized labels preserve actual identity'
Write-Output 'PASS executable display label cannot disguise a different file'
Write-Output 'PASS empty namespace remains empty'
