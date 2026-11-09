## Windows orphaned dev servers poison Playwright runs: kill the whole watcher tree (🟠 Major)

`pnpm dev:api` (`tsx watch`) and `pnpm dev:web` (vite) leave process TREES alive on
Windows that Playwright's webServer teardown never kills (#183, #254). The orphans
keep their OLD DB (so bootstrap looks "already set up"), serve STALE vite modules
(raw i18n keys, missing tabs), and rebind the API/web ports after `tsx watch`
restarts, producing EADDRINUSE and transient "already used" failures. Playwright's
`reuseExistingServer:false` does NOT pre-check the port: if anything answers the
`/health` URL it proceeds, so tests silently run against the wrong worktree's
server and stale DB ("Invalid phone number or password" on a supposedly-fresh DB).
Netstat right before a run can be clean and the orphan still appears mid-run
(delayed tsx-watch restart). Tell: the listener's cmdline references a DIFFERENT
worktree path.

**Always**: match port listeners to their owning worktree via cmdline before trusting
a "free" port; kill the whole watcher tree, not the listener (`taskkill /F /T` the
top of the chain: listener → tsx-watch node → cmd launcher; the watcher respawns
children). Before/after local e2e runs kill ALL node processes whose cmdline
contains the worktree path (`Get-CimInstance Win32_Process | Where-Object
{$_.CommandLine -match "worktree-name"}`), verify ports stay free, delete
`apps/api/data/*.sqlite*`, and prefer a no-watch server (`npx tsx src/index.ts`,
not `pnpm dev:api`) for manual debugging. Deleting the sqlite file while a server
holds it fails with "Device or resource busy". Kill first, then rm.
