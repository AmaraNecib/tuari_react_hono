## Pass PowerShell scripts by file across Bash (🔴 Critical)

During #501 validation, Bash expanded `$p` out of an inline double-quoted
PowerShell command. A cleanup intended for one log directory became
`Get-ChildItem -File | Remove-Item -Force` in the worktree root and deleted
21 tracked files. The parent recovered those named paths from HEAD and verified
that the intended source diff was unchanged. The interrupted build emitted
TS5083 for a missing base config but still exited zero.

**Always**: write a `.ps1` file and invoke `powershell.exe -NoProfile -File`
with its literal absolute path. Set `$ErrorActionPreference = 'Stop'` in the
file. Avoid cleanup for fresh evidence directories; use a new path and refuse
overwrites. Never place PowerShell variables inside a Bash double-quoted
`-Command` string. Check required root files and compiler diagnostics before
calling a build green; a process exit code alone can miss compiler failure.

Seen in: #501; retained in #504.
