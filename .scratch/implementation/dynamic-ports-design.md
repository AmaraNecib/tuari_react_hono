# dynamic-ports — design & review record

**mode:** local-only (temp recovery repo)
**base SHA:** 8e14b8b (current temp `origin/develop`)
**branch/worktree:** chore/dynamic-ports-parallel / worktrees/dynamic-ports
**review tier:** Standard
**PR:** #16 (open, never merged)

## Goal

Parallel Herdr lanes must be able to run the API, web dev server, and E2E
suite on distinct ports without colliding on the default 4318/3000, while
staying loopback-only and keeping desktop/tauri origins intact.

## Design (env-configurable ports, shared single source of truth)

- `apps/web/src/lib/ports.ts` — NEW pure helper (loopback-only, side-effect
  free) owning all port normalization + URL precedence:
  - `normalizePort()` — validates/normalizes port strings (rejects `+3000`
    style non-canonical/int-out-of-range/invalid values → fallback).
  - `apiBaseUrl()` / `apiPort()` — API URL from `API_PORT` (default 4318).
  - `webBaseUrl()` — `PLAYWRIGHT_BASE_URL` wins, else `WEB_PORT` (default 3000).
  - `resolveWebServer()` — decides the test web origin and whether Playwright
    starts its own Vite server:
      - no override → start own on `WEB_PORT`;
      - loopback override → start own aligned to the override's port (never
        poll a different port than we start);
      - non-loopback override → wait for the external server, do not start one.
- `apps/web/vite.config.ts` — derives `WEB_PORT` (server/preview) and injects
  `import.meta.env.VITE_API_PORT` from normalized `API_PORT`.
- `apps/web/src/lib/analytics-db.ts` — fallback API port follows
  `VITE_API_PORT` (so a lane setting only `API_PORT` routes analytics to its
  own API instead of hardcoding 4318).
- `playwright.config.ts` — consumes `ports.ts` for `webServer` URLs/ports,
  `baseURL`, `sharedEnv` (API_PORT/WEB_PORT/ALLOWED_ORIGINS/VITE_API_URL).
- `tests/e2e/helpers/urls.ts` — re-exports `apiBaseUrl`/`webBaseUrl` from the
  shared helper so specs use identical precedence.

## Why the Greptile PR-#16 findings are fixed

1. P1 analytics fallback ignores lanes → analytics now follows `API_PORT` via
   the injected `VITE_API_PORT`, no longer bakes in 4318.
2. P1 override targets wrong server → `resolveWebServer` aligns the started
   Vite server with a loopback `PLAYWRIGHT_BASE_URL`, or waits for an external
   host instead of starting one.
3. P2 raw port strings diverge → all ports pass through `normalizePort`
   (unit-tested) before use in URLs/config.

## Tests

- `apps/web/src/lib/ports.test.ts` — 12 unit tests: normalization edge cases,
  web-server resolution (none/loopback/external/invalid), api/web URL
  precedence. TDD: red before `ports.ts`, green after.
- E2E on distinct ports `API_PORT=14318 WEB_PORT=3001` → 47/47.

## Risks / notes

- `strictPort: true` hard-fails `dev:web` if `WEB_PORT` is occupied (intended
  for parallel lanes).
- Desktop Rust sidecar (lib.rs API_PORT, tauri CSP/devUrl 1420) stays baked:
  single packaged instance outside the local parallel-lane flow (documented,
  out of scope).
- Legacy tracked `playwright-report/index.html` exists in base (gitignored but
  tracked); restored after test runs — never commit new generated versions.
