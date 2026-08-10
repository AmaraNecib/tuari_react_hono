# Code Review — #287 (Tauri splashscreen)

- **Base SHA:** `03ec349643901a2802338d8e19b730b28e5eb841`
- **Head SHA:** `f5d8d1a2c16fe03cc463a95317cfb69c04bd23ad`
- **Tier:** Standard
- **Fixed point:** `git diff 03ec349...f5d8d1a2` (commits 78f0306, 51b4306, f5d8d1a2)

Ran two parallel sub-agents — **Standards** (repo docs + Fowler smell
baseline) and **Spec** (issue #287 + `.scratch/implementation/287-design.md`).

## Standards

**Hard violations: none.** Design doc precedes code and matches the
implementation; unit + Playwright E2E present in the expected locations;
test-audit evidence exists. Tooling-enforced checks (lint/format/clippy)
skipped per the skill.

Judgement calls (all addressed):

| # | Smell / note | Disposition |
|---|--------------|-------------|
| S1 | Duplicate `"main"` label literal — `SENSITIVE_COMMAND_WINDOW_LABELS` (lib.rs) vs new `MAIN_WINDOW_LABEL` const | **FIXED** — ACL now reuses `MAIN_WINDOW_LABEL` |
| S2 | Watcher reaches into `AppReadyState.notified` directly instead of the helper API (Feature Envy, same-module) | **FIXED** — added `AppReadyState::is_ready()` accessor |
| S3 | Watcher never-exit edge: if `app_ready` marked ready but the splashscreen close failed, the loop never terminates | **FIXED** — `ready && splashscreen_open` now force-reveals and exits; every loop path terminates |
| S4 | HomeView re-mount re-fires `notifyAppReady` (ref resets) | **ACCEPTED** — backend idempotent by design; documented |

## Spec

All four spec points implemented and verified against the diff:

1. `tauri.conf.json` — `main` gets `"label": "main"` + `"visible": false`;
   splashscreen window matches the spec verbatim (`splashscreen.html`,
   400×300, `resizable: false`, `center: true`).
2. `apps/web/public/splashscreen.html` — static brand + CSS spinner,
   inline `<style>` only, zero scripts, zero external resources
   (CSP-safe under the app's `script-src 'self'`).
3. `lib.rs` — `app_ready` command registered, gated by the default-deny
   window ACL (`splashscreen` label explicitly rejected in tests),
   idempotent; closes the splashscreen and shows/focuses the main window.
4. Frontend — `notifyAppReady()` dynamic-invoke with browser/SSR no-op +
   failure swallow; ref-guarded `useNotifyAppReady` wired into `HomeView`
   at the auth-state settlement seam.

Notes (no blockers):

- **Spec note 1 — ready-on-error seam:** the spec says "after first
  successful data load"; the implementation signals on auth-state
  *settlement* (success or error). Intentional and documented in the
  design doc ("On error the splashscreen still closes — an infinite
  spinner would be worse than the error UI"). Covers the "or API health
  OK" acceptance clause.
- **Spec note 2 — 45s fallback watcher** is a defensive addition beyond
  the spec's literal text; it guarantees the main window is revealed even
  if the webview JS crashes (the one failure mode the spec's frontend
  signal cannot cover). Documented in the design doc, not creep.
- **Residual risk:** the Tauri window lifecycle itself is not
  browser-testable; the e2e spec pins the static-page contract and the
  Rust unit tests pin the reveal decision logic.

## Summary

- **Standards:** 0 findings remaining after fixes (3 judgement calls fixed, 1 accepted).
- **Spec:** 0 blockers; 2 documented intentional deviations (error-settlement seam, fallback watcher).
