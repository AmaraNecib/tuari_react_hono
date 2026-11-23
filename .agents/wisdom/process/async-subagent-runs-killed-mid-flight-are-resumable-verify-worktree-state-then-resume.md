## Async subagent runs killed mid-flight are resumable: verify worktree state, then resume (🟠 Major)

All 5 async runs in the batch died once (or twice) with exit code
4294967295 (signal kill) ~35 min in, all within ~100 ms of each other. A
coordinated runner kill, NOT a natural failure. The run status says
`failed` with `resumeDisposition: resumable`. Worktree changes were intact;
resuming each run from its persisted session continued implementation,
reviews, push, PR, CI and Greptile correctly. One resume then crashed with
a Windows exception (0xC0000409) right after an edit. Resume AGAIN from
the same session; the uncommitted edit was still there.

**Always**: when a subagent run reports `failed` but the session is
resumable, inspect the worktree state first (uncommitted changes intact?)
and branch/PR state, then resume with a precise "resume exactly where you
left off" message listing the known commits/uncommitted files. Do not treat
a killed run as a lost run.


