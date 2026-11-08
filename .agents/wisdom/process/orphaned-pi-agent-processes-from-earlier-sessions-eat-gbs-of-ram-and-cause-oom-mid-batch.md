## Orphaned pi agent processes from earlier sessions eat GBs of RAM and cause OOM mid-batch (🟠 Major)

The 5-worktree parallel run (#273/#276/#279/#280/#283) hit `spawn ENOMEM`
and killed runs because the machine had 0.5 GB free of 31.8 GB. Root cause:
two `pi-coding-agent` node processes created ~4.5h EARLIER (the previous
parallel run's session) were still alive holding ~7.9 GB and ~7.6 GB
respectively, orphaned runners nobody reaped. Plus the live session (~4.3
GB) and 5 subagents with 125–166k-token contexts running vitest/playwright/
cargo simultaneously.

**Always**: before launching a parallel worktree batch, list leftover
`pi-coding-agent` node processes and kill ONLY ones you can positively
identify as dead-session orphans, never by age alone (another ACTIVE
session's runners can legitimately be older than yours). For each candidate
process: (1) walk its parent `pi.exe`/shell chain and the session file path
embedded in its command line to find its owning session, (2) confirm that
session is no longer active. Its async-run `status.json` shows a terminal
state (complete/failed/stopped) with no recent `lastActivityAt`, and (3)
check it has no live activity (recent tool/bash child, growing output log).
Kill only after all three hold. Expect long async runs to be killed (exit
-1) or fail to spawn (ENOMEM) under memory pressure; runs are resumable
from persisted sessions and worktree state survives, so resume rather than
restart.


