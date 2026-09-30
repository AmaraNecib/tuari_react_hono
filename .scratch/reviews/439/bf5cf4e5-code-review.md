# Code review — #439 + #436

Base: lane checkout `e526acecbe9df23239c9083d99d5e7e49b854f4f`. Tier: Standard.

## Spec axis

- **#439 status surface**: Settings → System gains a self-contained
  `BackupSettings` card. It renders never-run, succeeded, failed, and overdue
  states distinctly; the failure reason and attempt time are shown, and the
  card always shows the configured root and the retention policy. The never-run
  copy says DB-only / same disk and explicitly does not claim protection from a
  disk failure. Acceptance tests exist for failure, success, and never-run.
- **#439 contract extension**: `backupStatus` now carries `backupsRootPath` and
  `retention` — needed because `lastBackupPath` is null before the first
  backup. The retention numbers are read from the service's injected policy, so
  the constant stays in one place.
- **#436 folder setting**: path field with validation plus a desktop-only
  "Choose folder" button wired through the existing Tauri dialog plugin (no new
  IPC command). Persistence goes to the config file the shell already points
  the sidecar at, so the next sidecar start reads `backups_root`. No Rust
  change, no new env var.
- **#436 degrade**: the setting action rejects an invalid path with a message
  naming the problem; a root that becomes unusable at runtime still degrades to
  a recorded failure. Docs updated, including what happens to old snapshots.
- **Decisions**: overdue is computed client-side (48h) because the engine's
  startup-only schedule has no server "due" tick to report; a deployment with
  no config file returns `persisted: false` and the UI states the choice is
  session-only.
- **Deferrals**: none. No follow-up issue filed.

## Standards axis

- **i18n**: every user-facing string goes through `t()`; `check:i18n-keys`
  passes.
- **Theme**: only semantic tokens (`border-line`, `text-destructive`,
  `bg-destructive/5`, `text-foreground`, `text-muted-foreground`). No colour
  literals, so both themes resolve from the same tokens. Not visually
  screenshotted; the token contract is the same one the theme-contrast hygiene
  test pins.
- **Money**: not applicable — no currency is rendered.
- **Tests**: new behaviours were red-checked against broken implementation
  points (see `red-green.md`). All runs used `VITEST_MAX_WORKERS=2`.
- **Staging**: explicit file staging only; no `git add -A`.
- **Lane rules**: no push, no PR, no merge, no hosted review.

## Findings

- No blocking findings.
- Non-blocking: the desktop picker path is not unit-tested (jsdom cannot run
  the Tauri dialog); the E2E spec covers that the surface is reachable.
