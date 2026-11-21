# windows-sidecar-probe.ps1 — inspect the API sidecar process the desktop app spawned.
#
# Emits one JSON object on stdout:
#   { "sidecars": [ { "pid": <int>, "commandLine": <string>, "executablePath": <string> } ],
#     "env": { "<NAME>": "<value>", ... } | null,
#     "envError": <string> | null }
#
# Why this exists: the Rust shell spawns the sidecar with `env_clear()` and then
# sets a small allowlist (API_HOST, API_PORT, APP_DB_PATH, TUARI_LICENSE_*).
# Nothing exposes that env to an HTTP client, so a smoke test that only probes
# /health cannot tell whether the license/runtime handoff actually happened.
# Reading the child's environment block is the only way to observe it directly.
#
# The environment read uses NtQueryInformationProcess + ReadProcessMemory, which
# works for same-user processes without elevation. If any step fails the script
# reports the failure in `envError` instead of throwing, so the smoke test can
# degrade to inference on locked-down machines.
param(
  [Parameter(Mandatory = $true)][string]$ExtractDir
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class TuariWindowsPaths
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern uint GetLongPathName(string shortPath, StringBuilder longPath, uint bufferLength);
    [DllImport("shell32.dll", SetLastError = true)]
    private static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)] string commandLine, out int argumentCount);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr LocalFree(IntPtr memory);

    public static string[] ParseCommandLine(string commandLine)
    {
        int count;
        IntPtr arguments = CommandLineToArgvW(commandLine, out count);
        if (arguments == IntPtr.Zero)
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "CommandLineToArgvW failed");
        try
        {
            string[] parsed = new string[count];
            for (int i = 0; i < count; i++)
                parsed[i] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(arguments, i * IntPtr.Size));
            return parsed;
        }
        finally
        {
            LocalFree(arguments);
        }
    }
}
'@

function ConvertTo-CanonicalWindowsPath {
  param([string]$Path)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $longPath = New-Object System.Text.StringBuilder 32768
  $longLength = [TuariWindowsPaths]::GetLongPathName($fullPath, $longPath, [uint32]$longPath.Capacity)
  if ($longLength -eq 0) {
    throw "GetLongPathName failed for '$Path' (Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
  }
  $canonical = $longPath.ToString()
  if ($canonical.StartsWith('\\?\UNC\', [StringComparison]::OrdinalIgnoreCase)) {
    $canonical = '\\' + $canonical.Substring(8)
  } elseif ($canonical.StartsWith('\\?\', [StringComparison]::OrdinalIgnoreCase)) {
    $canonical = $canonical.Substring(4)
  }
  return $canonical.TrimEnd('\').ToLowerInvariant()
}

function Get-SidecarProcesses {
  param([string]$Root)
  $expectedEntry = ConvertTo-CanonicalWindowsPath (Join-Path $Root 'bin\api-runtime\dist\index.cjs')
  $result = @()
  $candidates = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop
  foreach ($candidate in $candidates) {
    $commandLine = [string]$candidate.CommandLine
    if ([string]::IsNullOrEmpty($commandLine) -or [string]::IsNullOrEmpty([string]$candidate.ExecutablePath)) { continue }
    $arguments = [TuariWindowsPaths]::ParseCommandLine($commandLine)
    if ($arguments.Length -lt 2 -or -not [System.IO.Path]::IsPathRooted($arguments[0]) -or $arguments[1].StartsWith('-') -or -not [System.IO.Path]::IsPathRooted($arguments[1])) { continue }
    if (-not [System.IO.File]::Exists($arguments[1])) { continue }

    # The process executable is argv[0]; Node's main script is argv[1].
    # Compare complete canonical paths, never substrings or later arguments.
    $commandExecutable = ConvertTo-CanonicalWindowsPath $arguments[0]
    $processExecutable = ConvertTo-CanonicalWindowsPath ([string]$candidate.ExecutablePath)
    $mainScript = ConvertTo-CanonicalWindowsPath $arguments[1]
    if ($commandExecutable -eq $processExecutable -and $mainScript -eq $expectedEntry) {
      $result += [pscustomobject]@{
        pid            = [int]$candidate.ProcessId
        commandLine    = $commandLine
        executablePath = [string]$candidate.ExecutablePath
      }
    }
  }
  return $result
}

$envReaderSource = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class TuariProcEnv
{
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(int access, bool inherit, int pid);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadProcessMemory(IntPtr handle, IntPtr address, byte[] buffer, int size, out IntPtr read);

    [DllImport("ntdll.dll")]
    private static extern int NtQueryInformationProcess(IntPtr handle, int infoClass, ref ProcessBasicInformation info, int length, out int returned);

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessBasicInformation
    {
        public IntPtr Reserved1;
        public IntPtr PebBaseAddress;
        public IntPtr Reserved2a;
        public IntPtr Reserved2b;
        public IntPtr UniqueProcessId;
        public IntPtr Reserved3;
    }

    private static long ReadPointer(IntPtr handle, long address)
    {
        byte[] buffer = new byte[8];
        IntPtr read;
        if (!ReadProcessMemory(handle, (IntPtr)address, buffer, 8, out read))
        {
            throw new Exception("ReadProcessMemory failed at 0x" + address.ToString("X") + " (error " + Marshal.GetLastWin32Error() + ")");
        }
        return BitConverter.ToInt64(buffer, 0);
    }

    public static string Dump(int pid)
    {
        // PROCESS_QUERY_INFORMATION (0x0400) | PROCESS_VM_READ (0x0010)
        IntPtr handle = OpenProcess(0x0410, false, pid);
        if (handle == IntPtr.Zero)
        {
            throw new Exception("OpenProcess failed (error " + Marshal.GetLastWin32Error() + ")");
        }
        try
        {
            ProcessBasicInformation info = new ProcessBasicInformation();
            int returned;
            int status = NtQueryInformationProcess(handle, 0, ref info, Marshal.SizeOf(info), out returned);
            if (status != 0)
            {
                throw new Exception("NtQueryInformationProcess failed (status " + status + ")");
            }

            // PEB->ProcessParameters is at +0x20 on x64; its Environment pointer
            // is at +0x80. Both are stable, documented-by-reversing offsets.
            long processParameters = ReadPointer(handle, (long)info.PebBaseAddress + 0x20);
            long environment = ReadPointer(handle, processParameters + 0x80);
            if (environment == 0)
            {
                return string.Empty;
            }

            // The environment block is a run of NUL-terminated UTF-16 strings
            // ending in an empty string. Read it 512 bytes at a time and stop at
            // the terminator (or the first unreadable page) so the dump never
            // spills into unrelated process memory.
            const int ChunkSize = 512;
            byte[] buffer = new byte[ChunkSize];
            StringBuilder accumulated = new StringBuilder();
            long address = environment;
            while (accumulated.Length < 131072)
            {
                IntPtr read;
                if (!ReadProcessMemory(handle, (IntPtr)address, buffer, ChunkSize, out read))
                {
                    break;
                }
                int count = (int)read;
                if (count <= 0)
                {
                    break;
                }
                accumulated.Append(Encoding.Unicode.GetString(buffer, 0, count));
                string current = accumulated.ToString();
                int terminator = current.IndexOf("\0\0", StringComparison.Ordinal);
                if (terminator >= 0)
                {
                    return current.Substring(0, terminator);
                }
                address += count;
                if (count < ChunkSize)
                {
                    break;
                }
            }
            return accumulated.ToString();
        }
        finally
        {
            CloseHandle(handle);
        }
    }
}
'@

$payload = [ordered]@{
  sidecars = @()
  env      = $null
  envError = $null
}

try {
  $sidecars = @(Get-SidecarProcesses -Root $ExtractDir)
  $payload.sidecars = $sidecars

  if ($sidecars.Count -gt 0) {
    try {
      Add-Type -TypeDefinition $envReaderSource -ErrorAction Stop
      $raw = [TuariProcEnv]::Dump($sidecars[0].pid)
      $map = [ordered]@{}
      foreach ($entry in ($raw -split "`0")) {
        if ([string]::IsNullOrEmpty($entry)) { continue }
        $separator = $entry.IndexOf('=')
        if ($separator -lt 1) { continue }
        $name = $entry.Substring(0, $separator)
        $value = $entry.Substring($separator + 1)
        $map[$name] = $value
      }
      $payload.env = $map
    }
    catch {
      $payload.envError = $_.Exception.Message
    }
  }
}
catch {
  $payload.envError = $_.Exception.Message
}

$payload | ConvertTo-Json -Depth 4 -Compress
