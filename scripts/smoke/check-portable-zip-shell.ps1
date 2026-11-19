param(
  [Parameter(Mandatory = $true)]
  [string] $ZipPath
)

$resolvedPath = (Resolve-Path -LiteralPath $ZipPath).Path
$shell = New-Object -ComObject Shell.Application
$archive = $shell.Namespace($resolvedPath)
if ($null -eq $archive) {
  throw "Windows Shell could not open portable ZIP: $resolvedPath"
}

$names = @($archive.Items() | ForEach-Object { $_.Name })
if ($names.Count -eq 0) {
  throw "Windows Shell reports an empty portable ZIP: $resolvedPath"
}
$requiredNames = @("Tuari.exe", "bin")
$archiveFolder = Split-Path -Parent $resolvedPath
$portableFolder = Get-ChildItem -LiteralPath $archiveFolder -Directory | Where-Object { $_.Name -like "Tuari-portable*" } | Select-Object -First 1
if ($portableFolder -and (Test-Path -LiteralPath (Join-Path $portableFolder.FullName "resources") -PathType Container)) {
  $requiredNames += "resources"
}
foreach ($required in $requiredNames) {
  if ($names -notcontains $required) {
    throw "Windows Shell cannot see required root entry '$required' in ${resolvedPath}: $($names -join ', ')"
  }
}
Write-Host "Windows Shell ZIP entries ($($names.Count)): $($names -join ', ')"
