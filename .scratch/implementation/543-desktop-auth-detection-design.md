# #543 desktop auth runtime detection

## Scope

Worktree: `D:/worktrees/tuari_react_hono/feat-issue-427-independ-2565729f7d01eaa8`

Base: `3ba115f2d00c2148c83cdde6f282c4f02ba8b8fa`

Mode: focused-local / CI-final-enforced, as supplied by parent

Tier: High-assurance, auth/session routing

Change only desktop runtime detection and its regression/integration tests. No auth policy, credential, database, API or license behavior changes.

## Diagnosis

The development WebView runs at `http://localhost:1420/` and exposes `window.__TAURI_INTERNALS__`. The prior detector recognized only `tauri.localhost` and the `tauri:` scheme, so this actual Tauri runtime returned false. That sent phone sign-in through Better Auth's browser client and made RPC use browser fetch with cookies instead of the native bridge and desktop session.

A regression at `localhost:1420` with the native marker failed against the original detector. A plain browser at the same origin remained negative. The detector now accepts the native marker while retaining packaged URL recognition and its no-window false result.

The new routing integration test leaves the production detector in place. With the localhost Tauri marker set, it asserts that phone login invokes `desktop_sign_in_with_phone_number`, authenticated RPC dispatches `desktop_api_request` with `authenticated: true`, and RPC credentials resolve to `omit`. This crosses the real auth and RPC routing modules, not a standalone helper.

## Interface and test seam

`isDesktopRuntime()` remains the existing shared module interface. Auth mutation, auth API, RPC transport and direct bridge callers use it, so changing the predicate fixes each caller at one point. The seam has two real runtime forms: a Tauri native marker for development, and the established custom host/scheme for packaged builds. Ordinary browser localhost is not a desktop adapter.

The tests cover development Tauri, plain localhost browser, packaged host, and server-side/no-window execution. The routing test covers login and authenticated RPC transport selection.

## Applied lessons

- Desktop packaging wisdom: not applicable. This change does not alter the process launcher, resource paths, or packaged runtime.
- No matching auth/runtime wisdom lesson exists in the wisdom index.

## Evidence

Ignored local evidence is under `.scratch/reviews/543/auth-fix-01/`. It includes the failing regression run, passing focused tests, the normal Tauri launch logs, and the authenticated UI screenshot. The existing account and protected database were reused without setup replay or reset.

Parent owns the bounded delta review and architecture outcome. The changed module is a shared runtime predicate; no additional interface moved.
