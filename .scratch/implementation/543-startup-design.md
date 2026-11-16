# #543 normal startup correction

Base: `a1fd4f8462112bcbc4bf144b4abc82df0e53d1d3`  
Worktree: `D:/worktrees/tuari_react_hono/feat-issue-427-independ-2565729f7d01eaa8`  
Mode: `focused-local / CI-final-enforced`  
Scope: desktop development startup only. No payroll feature changes.

## Findings and design

Tauri's `devUrl` is port 1420, while its `beforeDevCommand` started Vite with the web default of 3000. Pass Vite's portable `--port 1420` argument in the desktop-only command. Leave the ordinary web default and Playwright port resolution unchanged.

The debug desktop launches `pnpm.cmd`, then clears the child environment. pnpm can be found by the parent process, but its Node subprocess cannot resolve `node` without `PATH`. Preserve only the inherited `PATH` for debug launches. Release keeps its curated environment, including the existing Windows `SystemRoot` needed by bundled Node's CSPRNG. Do not forward `NODE_OPTIONS` or inherit the full parent environment.

The separate browser probe served the standard web app at port 3000 with no API process. The browser reported failed requests to `/rpc/authSetupStatus` and `/rpc/session`, no JavaScript page errors, and an auth-loading skeleton in `#root` with no text. This does not establish a frontend boot defect in normal desktop startup: that path includes the API child, which was blocked before it could start. Do not mask the missing API with a mock or alter login routing. The parent verifier owns the post-fix normal login and connected-app acceptance run.

## Interface and proof

The seam is Tauri's `build.beforeDevCommand` plus Rust's API-child environment construction. The config regression checks that Tauri and Vite use port 1420 without changing the web default. A Rust test checks that the child receives `PATH` in debug mode and no inherited environment variables in release mode. Browser diagnostics retain the original no-API evidence; they are not counted as desktop acceptance.

No module interface or domain vocabulary moved. The child-process environment remains cleared before the allowlisted variables are added. The debug-only `PATH` permits command lookup; it does not permit Node option injection or expose unrelated parent variables.

## Exclusions and preserved state

No API contract, schema, financial semantics, web route, login fallback, database migration, or package change is in scope. The six paused #544/#545 files remain untouched. The pre-existing `Cargo.toml` and generated Tauri schema status changes are also excluded and must not be staged. No database file, sidecar, config, key, or backup was changed. No unrelated process was stopped.

Prior #543 review conclusions remain valid outside these startup seams. The parent should review only this combined startup delta and then rerun the normal verifier. Full employee and A/B/A acceptance remains open.
