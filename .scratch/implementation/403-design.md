# #403 — Scope stale API-process cleanup to this installation

mode: remote
ticket: #403 (GitHub, `bug`)
base: origin/develop @ ec369a303301fb61259a61c532753fea723d75fd
branch: fix/403-stale-process-scope
tier: Standard

## Problem

`cleanup_stale_api_processes` (apps/desktop/src-tauri/src/lib.rs) enumerates
node processes and kills every one whose command line contains the layout
markers `api-runtime` and `index.cjs`. Both markers are install-relative, so a
sidecar from **any** Tuari install matches: a portable build kills the
installed build's sidecar, and vice versa. The issue calls this out as a
known break found by the installer smoke lane (#316 in
`docs/release-verification.md`).

## Change

Make the process-identity predicate installation-scoped instead of
layout-scoped.

- Add `resolve_api_runtime_dir(app)` — the `<install>/bin/api-runtime`
  directory this shell spawns from (derived from `resource_dir()`, exactly the
  path `spawn_api_process` uses as the child's cwd/script dir).
- Add `api_sidecar_entry_path(runtime_dir)` — single source for
  `dist/index.cjs`, used by both spawn and cleanup so the two cannot drift.
- Change `is_api_sidecar_command_line(command_line, install_runtime_dir)` to
  match the absolute sidecar path `<runtime_dir>/dist/index.cjs` after
  normalization (strip Windows `\\?\` prefix, unify separators, case-fold on
  Windows only because POSIX paths are case-sensitive).
- `cleanup_stale_api_processes` resolves the runtime dir and skips cleanup
  entirely when resolution fails (fail-open: leave unknown processes alone
  rather than kill them).
- Match the path as a whole command-line argument (`command_line_contains_path`),
  not a bare `contains`: `index.cjs.map` or `--entry=<path>` are not our child.
- Single-source the `<install>/bin/api-runtime` layout via `api_runtime_dir`,
  used by spawn, `has_portable_runtime_layout`, and the predicate's resolver.
- Drop `API_SIDECAR_CMD_MARKERS`; the full-path match strictly subsumes it.

The command line is the discriminator; the data dir is not in the command
line, and two installs cannot share a `resource_dir`, so install-path scoping
is sufficient. Working directory is not exposed by `Win32_Process`/`pgrep -a`,
so nothing else is available to scope on.

## Interfaces

- `fn api_runtime_dir(resource_dir: &Path) -> PathBuf`
- `fn resolve_api_runtime_dir(app: &AppHandle) -> Result<PathBuf, String>`
- `fn api_sidecar_entry_path(runtime_dir: &Path) -> PathBuf`
- `fn is_api_sidecar_command_line(command_line: &str, install_runtime_dir: &Path) -> bool`
- `fn command_line_contains_path(command_line: &str, expected_path: &str) -> bool`
- `fn cleanup_stale_api_processes(app: &AppHandle)` (was no-arg)

## Tests

Pure predicate, no process spawn:

- this install's Windows and POSIX command lines match (quoted, unquoted,
  trailing args, mixed case and forward slashes on Windows, UNC)
- a foreign install with the identical `bin/api-runtime/dist/index.cjs`
  layout does **not** match (the #403 regression)
- same runtime dir but a different entry script does not match
- the path as a substring of a longer path (`.map`) or of another argument
  (`--entry=`) does not match
- POSIX paths stay case-sensitive
- unrelated node process and empty string do not match

## Risks

- `resource_dir()` must equal the install dir; it already does for the
  portable and NSIS layouts (`spawn_api_process` uses it for the same
  purpose), so predicate and spawn cannot diverge.
- **Relocation trade-off (accepted):** the old marker predicate deliberately
  ignored the absolute install path, so it also killed a sidecar left by a
  previous install that an update relocated. An install-scoped predicate
  cannot do both — a relocated old sidecar is indistinguishable from another
  install's by its command line. #403 chose "never kill another install"; a
  sidecar orphaned by an in-place relocation is not reclaimed by cleanup.
- Behaviour change is intentionally fail-open on resolution failure — no kill
  is safer than a wrong kill.
- Debug builds return before any cleanup, unchanged.
