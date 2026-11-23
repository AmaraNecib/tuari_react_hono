## Sibling-worktree dev servers squat the fixed Playwright ports and fake a green e2e run (🟠 Major)

On #278 the local full Playwright suite failed 9 specs at `bootstrapOrSignIn`,
every one a `page.goto` timeout, minutes after the SAME new spec passed
standalone. Root cause: another worktree (`issue-287-splashscreen`) was running
its own Playwright suite CONCURRENTLY, and its API/web dev servers held the
hardcoded ports 4318/3000. `reuseExistingServer: false` does NOT pre-check the
port, the stale server answered `/health` ok, so our run connected to
issue-287's DB/modules instead of spawning its own. Diagnosis path:
`Get-NetTCPConnection -LocalPort 4318,3000 -State Listen` showed a foreign
worktree's PIDs; `Get-CimInstance Win32_Process` showed an ACTIVE
`npx playwright test` from that worktree, so the servers were NOT orphans to
kill (another agent's live run), just squatters. Re-ran the full suite when the
ports freed → 24 passed / 2 skipped.

**Always**: before a local e2e run, check WHO owns ports 4318/3000 (not just
that they're free). If another worktree's process holds them, wait for that
run or coordinate; never kill a process belonging to an active sibling session.
And when a batch of specs fails identically at `page.goto`, suspect infra
(port squatters / stale servers), not the diff. Re-run with clean ports before
trusting the failures.


