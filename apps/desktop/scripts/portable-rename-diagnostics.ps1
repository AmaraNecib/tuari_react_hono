param(
  [Parameter(Mandatory = $true)][string]$Candidate,
  [Parameter(Mandatory = $true)][string]$Final,
  [Parameter(Mandatory = $true)][string]$ResourcesBase64,
  [switch]$ProbeOwners
)

$ErrorActionPreference = 'Stop'

function Get-PathSnapshot([string]$Path) {
  try {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    return [ordered]@{
      path = $Path
      exists = $true
      kind = if ($item.PSIsContainer) { 'directory' } else { 'file' }
      attributes = [string]$item.Attributes
      length = if ($item.PSIsContainer) { $null } else { [long]$item.Length }
      lastWriteTimeUtc = $item.LastWriteTimeUtc.ToString('o')
    }
  } catch [System.Management.Automation.ItemNotFoundException] {
    return [ordered]@{ path = $Path; exists = $false }
  } catch {
    return [ordered]@{ path = $Path; exists = $null; error = $_.Exception.Message }
  }
}

$resourcesText = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ResourcesBase64))
$Resources = @($resourcesText -split "`n" | Where-Object { $_.Length -gt 0 })
$result = [ordered]@{
  timestampUtc = [DateTime]::UtcNow.ToString('o')
  paths = @((Get-PathSnapshot $Candidate), (Get-PathSnapshot $Final))
  resources = @($Resources | ForEach-Object { Get-PathSnapshot $_ })
  restartManager = [ordered]@{ status = 'not-requested'; owners = @(); errors = @(); limitations = @() }
}

if ($ProbeOwners) {
  $result.restartManager.status = 'queried'
  $result.restartManager.limitations = @('Restart Manager is queried for explicit existing files only. Directory handles are not covered; an empty file-owner list does not prove no directory handle exists.')
  $result.restartManager.directoryResourcesNotQueried = @()
  try {
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class TuariRestartManager {
  public static DateTime FileTimeUtc(System.Runtime.InteropServices.ComTypes.FILETIME value) {
    long high = unchecked((uint)value.dwHighDateTime);
    long low = unchecked((uint)value.dwLowDateTime);
    long fileTime = (high << 32) | low;
    return DateTime.FromFileTimeUtc(fileTime);
  }
  public static RM_PROCESS_INFO[] ReturnedEntries(RM_PROCESS_INFO[] allocated, uint returnedCount) {
    int length = (int)Math.Min((ulong)returnedCount, (ulong)allocated.Length);
    var returned = new RM_PROCESS_INFO[length];
    Array.Copy(allocated, returned, length);
    return returned;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct RM_UNIQUE_PROCESS {
    public int dwProcessId;
    public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string strServiceShortName;
    public uint ApplicationType;
    public uint AppStatus;
    public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
  }
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  public static extern int RmStartSession(out uint sessionHandle, int sessionFlags, StringBuilder sessionKey);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  public static extern int RmRegisterResources(uint sessionHandle, uint fileCount, string[] fileNames, uint appCount, RM_UNIQUE_PROCESS[] applications, uint serviceCount, string[] serviceNames);
  [DllImport("rstrtmgr.dll")]
  public static extern int RmGetList(uint sessionHandle, out uint needed, ref uint count, [In, Out] RM_PROCESS_INFO[] affectedApps, ref uint rebootReasons);
  [DllImport("rstrtmgr.dll")]
  public static extern int RmEndSession(uint sessionHandle);
}
'@

    $ownersFound = $false
    foreach ($resource in $Resources) {
      if (-not (Test-Path -LiteralPath $resource)) { continue }
      $resourceItem = Get-Item -LiteralPath $resource -Force
      if ($resourceItem.PSIsContainer) {
        $result.restartManager.directoryResourcesNotQueried += $resource
        continue
      }
      $key = New-Object System.Text.StringBuilder 33
      $session = [uint32]0
      $startCode = [TuariRestartManager]::RmStartSession([ref]$session, 0, $key)
      if ($startCode -ne 0) {
        $result.restartManager.errors += "RmStartSession($resource) returned $startCode"
        continue
      }
      try {
        $registerCode = [TuariRestartManager]::RmRegisterResources($session, 1, [string[]]@($resource), 0, $null, 0, $null)
        if ($registerCode -ne 0) {
          $result.restartManager.errors += "RmRegisterResources($resource) returned $registerCode"
          continue
        }
        $needed = [uint32]0
        $count = [uint32]0
        $reasons = [uint32]0
        $listCode = [TuariRestartManager]::RmGetList($session, [ref]$needed, [ref]$count, $null, [ref]$reasons)
        if ($listCode -eq 234) {
          $count = $needed
          $apps = New-Object 'TuariRestartManager+RM_PROCESS_INFO[]' $count
          $listCode = [TuariRestartManager]::RmGetList($session, [ref]$needed, [ref]$count, $apps, [ref]$reasons)
        } elseif ($listCode -eq 0) {
          $apps = @()
        }
        if ($listCode -ne 0) {
          $result.restartManager.errors += "RmGetList($resource) returned $listCode"
          continue
        }
        foreach ($app in [TuariRestartManager]::ReturnedEntries($apps, $count)) {
          $startTime = [TuariRestartManager]::FileTimeUtc($app.Process.ProcessStartTime).ToString('o')
          $process = Get-Process -Id $app.Process.dwProcessId -ErrorAction SilentlyContinue
          $result.restartManager.owners += [ordered]@{
            pid = $app.Process.dwProcessId
            processStartTimeUtc = $startTime
            appName = $app.strAppName
            processName = if ($process) { $process.ProcessName } else { $null }
            resource = $resource
          }
          $ownersFound = $true
        }
      } catch {
        $result.restartManager.errors += "${resource}: $($_.Exception.Message)"
      } finally {
        [void][TuariRestartManager]::RmEndSession($session)
      }
    }
    if (-not $ownersFound -and $result.restartManager.errors.Count -eq 0) {
      $result.restartManager.status = 'no-owners-reported'
    } elseif ($result.restartManager.errors.Count -gt 0) {
      $result.restartManager.status = if ($ownersFound) { 'partial' } else { 'probe-error' }
    }
  } catch {
    $result.restartManager.status = 'probe-error'
    $result.restartManager.errors += $_.Exception.Message
  }
}

$result | ConvertTo-Json -Depth 8 -Compress
