## Turbo cache logs may show other worktree paths (🟡 Minor)

Turbo cache replays log lines from other worktrees (e.g. `cleanup-dirty-wip`). Paths in cached output are not the current worktree. Re-run the affected package's
command directly when you need certainty it actually ran on your files.

