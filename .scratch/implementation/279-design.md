# Issue #279 — Desktop: gate sensitive Tauri commands per-window + narrow stale-process cleanup

**Tier:** HIGH-ASSURANCE (security, touches Rust Core).
**Base:** `develop` @ `256f24a34cf77ed527177ee640e74c1039028dbb` (merge-base of `refactor/issue-279-tauri-gating`).
**Owned paths (this worktree):**
- `apps/desktop/src-tauri/src/lib.rs` (only production file changed)
- `.scratch/implementation/279-design.md`
- `.scratch/reviews/279/` (review evidence)

## Problem (from issue body, verified on this worktree)

1. All ~13 commands are registered in a single `tauri::generate_handler![]`
   (`lib.rs:1479`). Tauri v2 custom commands are NOT gated by
   `capabilities/default.json` (which covers only plugin commands). Any XSS in
   the bundled webview would get full Rust command access, including
   arbitrary-URL download (`start_update_download`), update-file apply
   (`apply_update`), license state mutation (`activate_license`), and the
   desktop→API bridge (`desktop_api_request`).
2. `cleanup_stale_api_processes()` (`lib.rs:1257`) kills ANY process listening
   on port 4318 via PowerShell (`Get-NetTCPConnection -LocalPort 4318 ... |
   Stop-Process`) — an unrelated process using the port would be terminated.

## Fix

### 1. Per-window gating (default-deny ACL on the calling window)

- New module constant + pure predicate:

```rust
/// Labels of windows allowed to invoke sensitive commands. Default-deny:
/// a window not listed here (e.g. a future webview with external content)
/// is rejected before the command body runs.
const SENSITIVE_COMMAND_WINDOW_LABELS: &[&str] = &["main"];

fn is_sensitive_command_window_allowed(label: &str) -> bool {
    SENSITIVE_COMMAND_WINDOW_LABELS.contains(&label)
}

/// Rejects sensitive-command invocations from non-allowlisted windows.
fn assert_sensitive_command_window(window: &tauri::Window) -> Result<(), String> {
    if is_sensitive_command_window_allowed(window.label()) {
        Ok(())
    } else {
        Err("This command is not allowed from this window.".to_string())
    }
}
```

- `tauri::Window` is injected by Tauri v2 (implements `CommandArg`, is
  `Send`, usable in both sync and async commands — documented pattern in
  tauri 2.10.3 `app.rs`). The `Manager` trait needed for `.label()` is
  already imported in `lib.rs`.
- The four sensitive commands each gain a `window: tauri::Window` parameter
  and call `assert_sensitive_command_window(&window)?` as their first
  statement (fail before any side effect / network I/O):
  - `desktop_api_request` (async) — before the existing path allowlist.
  - `activate_license` (sync).
  - `apply_update` (sync).
  - `start_update_download` (async).
- Only window `main` is allowlisted — the only window in `tauri.conf.json`
  (capabilities/default.json is already scoped to `"main"`).
- NOT widened: `restart_app`, `cancel_update_download`, `get_license_status`,
  `check_for_updates`, auth commands are outside the issue's listed set.

### 2. Narrow stale-process cleanup to the known child

Replace port-based matching with command-line identity matching on the stable
sidecar layout markers (`api-runtime` + `index.cjs` — our child always runs
`node <install>/bin/api-runtime/dist/index.cjs`). Stable markers (not the
absolute install path) keep matching working after an app update moves the
install directory.

```rust
/// Stable command-line markers identifying this application's API sidecar
/// child. Constants so the PowerShell/pkill filters and the unit-tested
/// predicate cannot drift.
const API_SIDECAR_CMD_MARKERS: [&str; 2] = ["api-runtime", "index.cjs"];

fn is_api_sidecar_command_line(command_line: &str) -> bool {
    let lower = command_line.to_ascii_lowercase();
    API_SIDECAR_CMD_MARKERS.iter().all(|m| lower.contains(m))
}
```

- Windows: `Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"` +
  `Where-Object { CommandLine -like '*api-runtime*' -and CommandLine -like '*index.cjs*' }`
  → `Stop-Process`. No port query at all.
- POSIX: `pkill -f api-runtime/dist/index.cjs` (pkill -f matches the full
  command line).
- Release-only (unchanged `cfg!(debug_assertions)` early return).

## Public API / interfaces

- No changes to frontend-facing signatures: `window` is injected server-side;
  the four commands keep their existing JS argument shapes
  (`{ key }`, `{ path }`, `{ url }`, `{ request }`).
- No changes to `Cargo.toml`, capabilities, or tauri.conf.json.

## Tests (unit, in `lib.rs` `#[cfg(test)] mod tests`)

- `allows_only_expected_sensitive_command_windows` — `main` allowed; empty,
  arbitrary, and case-mismatched labels rejected (label matching is exact).
- `identifies_only_api_sidecar_command_lines_for_stale_cleanup` — Windows and
  POSIX command lines of our child match (case-insensitive); unrelated node
  server, port-4318 listener, partial-marker, and empty command lines do not.

No Playwright E2E: the change is Rust-side IPC gating; the web UI is
unchanged and browser-preview runs never exercise Tauri IPC. Frontend invoke
tests are unaffected (they mock `invoke`).

## Implementation risks

- Async commands with `tauri::Window` require `Send` — documented supported
  pattern in tauri 2.10.3; will be verified by `cargo test` compile.
- PowerShell filter with `-like` wildcards: markers contain no wildcard chars,
  so no escaping needed.
- Regression risk (cleanup too narrow to catch a stale process from a renamed
  layout) mitigated by using stable layout markers rather than the absolute
  path.
- No cross-window behavior change today: the only window is `main`.

## Verification commands

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- -D warnings
```
