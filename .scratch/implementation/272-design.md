# Issue #272 — Security: Hono bodyLimit middleware + Content-Length pre-check

**Review tier:** High-assurance (security)
**Base SHA:** `9aac620` (merge-base with `origin/develop`)
**Branch:** `refactor/issue-272-body-limit`

## Problem

- No global request-body size limit in the Hono app (`@hono/node-server` has no default limit).
- `apps/api/src/app/create-app.ts:258-266` — the multipart upload route calls
  `await c.req.formData()`, which buffers the ENTIRE multipart body into memory before
  the 25 MB per-request attachment cap is checked.
- Attack surface: loopback default (local-only DoS), and if `API_HOST` is ever exposed to
  LAN/public an unauthenticated memory-exhaustion vector exists (auth endpoints only have
  a 30 req/15 min limiter, upload endpoint requires a session — but the body is buffered
  before any of that protection matters at the transport level).

## Public API / component interface

New module `apps/api/src/middleware/body-limit.ts`:

- `export const MAX_JSON_BODY_BYTES = 1024 * 1024` (1 MB)
- `export const MAX_MULTIPART_BODY_BYTES = 30 * 1024 * 1024` (30 MB)
- `export function resolveBodyLimitMaxSize(contentType: string | undefined): number` —
  pure helper: returns 30 MB for `multipart/form-data`, 1 MB otherwise.
- `export const bodyLimitMiddleware: MiddlewareHandler` — wraps Hono's built-in
  `bodyLimit` from `hono/body-limit` with a content-type-aware `maxSize` and a JSON 413
  `onError` handler.

Wiring in `apps/api/src/app/create-app.ts`:
- `app.use("*", bodyLimitMiddleware)` registered after the CORS/security-headers
  middlewares and before route handlers, so every request body is size-capped before any
  route reads it (including `c.req.formData()` on the attachment route).

Behavior:
- Content-Length header present → Hono `bodyLimit` pre-checks it and rejects with 413
  **without buffering the body**.
- Chunked / no Content-Length → Hono `bodyLimit` streams-counts the body and aborts with
  a `BodyLimitError` once the cap is exceeded (no full buffering).
- `GET`/`HEAD`/no-body requests pass through untouched (`c.req.raw.body` is null).

## Dependencies

- `hono/body-limit` (already in the monorepo dependency set — Hono ^4.12.12). No new
  dependencies, no lockfile changes (forbidden by parent).
- Uses `createMiddleware` from `hono/factory` for clean typing.

## Planned tests

Unit tests (`apps/api/src/middleware/body-limit.test.ts`):
1. `resolveBodyLimitMaxSize` — multipart → 30 MB; JSON → 1 MB; missing content type → 1 MB.
2. JSON body at/under 1 MB passes through to the handler.
3. JSON body over 1 MB (content-length path) → 413 JSON, handler not invoked.
4. Multipart over 30 MB (content-length path) → 413 JSON, body never parsed.
5. Chunked/streaming body (no content-length) over 1 MB → 413 via `BodyLimitError`.
6. No-body request (GET) passes through.

App-level integration (`apps/api/src/app/create-app.test.ts`, extended):
7. Oversized JSON POST to `/api/auth/profile` → 413 (middleware wired globally).
8. Multipart POST to the attachment route with a content-length > 30 MB → 413 before
   `formData()` is invoked (verify via mock `getCurrentSessionUser` not called / no auth).
9. Existing route tests still pass (regression guard).

## Implementation risks

- `bodyLimit` wraps the request stream on the chunked path — must verify the rewrapped
  `Request` still flows through `@hono/node-server`/`app.request()` correctly. Covered by
  integration tests.
- Multipart cap (30 MB) must stay ABOVE the existing per-request attachment cap (25 MB)
  so the app-level per-file + total caps remain the first-line defense for legit uploads.
- Error body language: repo uses Arabic user-facing messages; body-limit 413 will return
  `{ message: "الطلب كبير جدًا." }` consistent with the rest of the API.
- Security headers middleware runs before bodyLimit; it doesn't read the body, so order
  is safe.

## Acceptance criteria (from issue)

- [x] `bodyLimit` middleware added at app level (~1 MB JSON / 30 MB multipart)
- [x] Content-Length pre-check before parsing multipart (Hono bodyLimit short-circuits)
- [x] Per-file + total caps kept as defense in depth (unchanged route constants)
- [x] `pnpm typecheck && pnpm test:api && pnpm lint` green
