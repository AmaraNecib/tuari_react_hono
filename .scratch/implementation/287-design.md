# 287 — Tauri splashscreen loading window (no blank window on cold start)

## Tier

**Standard** — Tauri config, Rust app layer (`lib.rs`), static HTML, React wiring.
No authz/permissions, licensing, crypto, or financial logic.

## Base

- Target branch: `develop`
- Base SHA: `03ec349643901a2802338d8e19b730b28e5eb841` (origin/develop at start)

## Problem

First launch shows a blank/white Tauri window for several seconds while the API
sidecar boots and the webview loads React + the (now chunk-split, #286) home-view
bundle. Reads as a hang. No loading UI exists.

## Design

Tauri v2 splashscreen pattern (official: v2.tauri.app/learn/splashscreen/):
a second, always-visible window shows a lightweight static page; the main
window starts hidden; once the app is actually ready to show UI, the
frontend signals the backend (`app_ready` command), which closes the
splashscreen and reveals the main window.

### 1. `apps/desktop/src-tauri/tauri.conf.json`

- Main window: add explicit `"label": "main"` and `"visible": false`.
  (A hidden Tauri window still loads and runs its webview — this is what
  lets React mount and fetch data behind the splashscreen.)
- New window:
  ```json
  {
    "label": "splashscreen",
    "url": "splashscreen.html",
    "title": "Tuari",
    "width": 400,
    "height": 300,
    "resizable": false,
    "center": true
  }
  ```
- `url` resolution: dev → `http://localhost:1420/splashscreen.html`
  (Vite serves `public/` at root); prod → `dist/splashscreen.html` copied
  from `public/` at build, served from the local asset root.
- Capabilities unchanged: `default.json` lists only `main`. The
  splashscreen is a static page that invokes no commands/plugins, so it
  needs no permissions. Windows without a capability entry simply get no
  JS-accessible API surface.

### 2. `apps/web/public/splashscreen.html`

Static, dependency-free, CSP-safe:
- `lang="ar" dir="rtl"`, brand wordmark + Arabic tagline + pure-CSS spinner.
- Inline `<style>` only (app CSP allows `style-src 'self' 'unsafe-inline'`).
- **No inline scripts** — app CSP (`script-src 'self'`) forbids them and
  the dev CSP forbids them too. Zero JS.
- Uses system fonts; no network requests.

### 3. `apps/desktop/src-tauri/src/lib.rs`

- `AppReadyState { notified: Mutex<bool> }` managed via `.manage(...)`.
- Constants: window labels (`"main"`, `"splashscreen"`) and
  `SPLASHSCREEN_FALLBACK_REVEAL_DELAY: Duration = 45s`.
- `reveal_main_window(app: &AppHandle) -> Result<(), String>`:
  close splashscreen (if still open), show + focus main window.
  Safe to call repeatedly (optionals).
- `should_force_reveal_main_window(ready: bool, elapsed: Duration) -> bool`:
  pure, unit-testable fallback decision — force reveal when NOT ready and
  elapsed ≥ delay. Protects against a JS crash in the hidden webview
  leaving the user with a perpetual spinner.
- `#[tauri::command] fn app_ready(...) -> Result<(), String>`:
  idempotent (state flag), gated by `assert_sensitive_command_window`
  (same default-deny ACL as the other commands — only the `main` window
  may reveal). Calls `reveal_main_window`.
- `setup`: after spawning the API sidecar, spawn a watcher thread that
  polls the ready flag; when ready → return; when the fallback delay
  elapses → `reveal_main_window` unconditionally. Uses `Instant` captured
  at setup.

### 4. Frontend readiness signal

- `apps/web/src/lib/app-ready.ts` — `notifyAppReady()`: dynamic-import
  `@tauri-apps/api/core` and `invoke("app_ready")`, swallowing failures
  (browser preview / IPC errors must never break the shell). Matches the
  existing `update-bridge.ts` fallback pattern.
- `apps/web/src/hooks/use-notify-app-ready.ts` — `useNotifyAppReady(ready)`:
  ref-guarded effect that calls `notifyAppReady()` once when `ready` flips
  true (protects against React StrictMode double effects + re-renders).
- `apps/web/src/features/app-shell/home-view.tsx` — call
  `useNotifyAppReady(!auth.isAuthStateLoading)`.

**Why auth-state resolution is the readiness seam:** `isAuthStateLoading`
(`!setupStatus && !authStartupError || sessionQuery.isPending`) is the gate
to ALL UI — it settles only after the first RPC round-trip to the API
(`/rpc/authSetupStatus` + `/rpc/session`). Success (bootstrap or sign-in
screen), failure (error + retry), and returning-user (dashboard) all become
visible exactly when the splashscreen closes. On error the splashscreen
still closes — an infinite spinner would be worse than the error UI.

### 5. Tests

| Level | What | Where |
|---|---|---|
| Rust unit | `should_force_reveal_main_window` decision (ready vs elapsed boundaries) | `lib.rs` `#[cfg(test)]` |
| Web unit | `notifyAppReady` invokes `app_ready` in Tauri, no-ops in browser | `apps/web/src/lib/app-ready.test.ts` |
| Web unit | hook fires exactly once when `ready` goes true | `apps/web/src/hooks/use-notify-app-ready.test.tsx` |
| Hygiene | splashscreen.html exists, contains brand, has **no `<script>`** (CSP pin) | `tests/web-hygiene.test.mjs` |
| E2E | `/splashscreen.html` serves 200 with brand text and zero script tags | `tests/e2e/splashscreen.spec.ts` |

## Risks

- **Capability file** — splashscreen label not in `default.json`: intended
  (static page). Verified no command/plugin is invoked from it.
- **CSP** — inline scripts blocked in both prod and dev CSP; splashscreen is
  script-free by construction; hygiene test pins it.
- **StrictMode double-invoke** — idempotent backend + ref-once hook.
- **JS crash in hidden webview** — 45s fallback force-reveals the main window.
- **macOS last-window-close quit** — main window is never closed (only
  hidden → shown); closing the splashscreen while main exists is safe.
- **`app_ready` from non-main window** — ACL rejects (default-deny).
- **Rust Core guardrail** — all changes live in `lib.rs` (app layer, excluded
  from the no-`tauri::` boundary check).

## Out of scope

- Real load-time speedups (#286 chunk split, #282 live.js) — already shipped
  separately; splashscreen only *masks* the wait.
- Animation polish beyond the CSS spinner.
