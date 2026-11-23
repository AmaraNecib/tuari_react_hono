param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,
  [Parameter(Mandatory = $true)]
  [string]$DestinationPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
[System.IO.Compression.ZipFile]::ExtractToDirectory($ArchivePath, $DestinationPath)
