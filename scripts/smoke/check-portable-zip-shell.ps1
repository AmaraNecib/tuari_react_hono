param(
  [Parameter(Mandatory = $true)]
  [string] $ZipPath
)

. (Join-Path $PSScriptRoot 'portable-shell-entry-names.ps1')
$resolvedPath = (Resolve-Path -LiteralPath $ZipPath).Path
$shell = New-Object -ComObject Shell.Application
$archive = $shell.Namespace($resolvedPath)
if ($null -eq $archive) {
  throw "Windows Shell could not open portable ZIP: $resolvedPath"
}

$names = @(Get-PortableShellEntryNames -Items @($archive.Items()))
if ($names.Count -eq 0) {
  throw "Windows Shell reports an empty portable ZIP: $resolvedPath"
}
$requiredNames = @("Tuari.exe", "bin")
$portableFolder = Join-Path (Split-Path -Parent $resolvedPath) ([IO.Path]::GetFileNameWithoutExtension($resolvedPath))
if (Test-Path -LiteralPath (Join-Path $portableFolder "resources") -PathType Container) {
  $requiredNames += "resources"
}
foreach ($required in $requiredNames) {
  if ($names -notcontains $required) {
    throw "Windows Shell cannot see required root entry '$required' in ${resolvedPath}: $($names -join ', ')"
  }
}
Write-Host "Windows Shell ZIP entries ($($names.Count)): $($names -join ', ')"
