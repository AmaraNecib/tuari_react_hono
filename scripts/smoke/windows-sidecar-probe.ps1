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

function Get-SidecarProcesses {
  param([string]$Root)
  # Command lines can carry either separator (Rust passes backslashes, but a
  # node-launched probe may pass forward slashes), so compare on a normalized
  # form with one separator.
  $rootLower = $Root.ToLowerInvariant().Replace('\', '/')
  $result = @()
  $candidates = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
  foreach ($candidate in $candidates) {
    $commandLine = [string]$candidate.CommandLine
    if ([string]::IsNullOrEmpty($commandLine)) { continue }
    $lower = $commandLine.ToLowerInvariant().Replace('\', '/')
    # Same identity contract as the Rust shell: our child always runs
    # `<root>/bin/api-runtime/dist/index.cjs`, so require the extract dir plus
    # both layout markers. A pid-by-port guess would match unrelated servers.
    if ($lower.Contains($rootLower) -and $lower.Contains('api-runtime') -and $lower.Contains('index.cjs')) {
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
