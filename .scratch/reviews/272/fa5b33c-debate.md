# Debate — Issue #272 (bodyLimit middleware)

Tier: High-assurance (security). Base SHA: `9aac620`. Evidence SHA (HEAD at review): `fa5b33c`.
Note: child agent executed the debate inline (two-sided analysis) because sub-agent
spawning is unavailable.

## Critic side

1. **Middleware registered after CORS but before auth origin checks** — an oversized
   body from a *disallowed* origin now gets 413 instead of 403. Is this a behavior
   regression? Response: No — the disallowed-origin request never reaches a handler
   either way, and 413/403 are both rejections. The body-limit guard is intentionally
   global so it runs before *any* body is parsed anywhere.
2. **JSON cap 1 MB could break legitimate large RPC payloads.** Response: audited all RPC
   procedures (`src/rpc/handlers/*`); none accept binary/base64 payloads — all are
   metadata objects (filter/input shapes, a few KB max). The only large-payload route is
   the multipart attachment endpoint, which is explicitly exempted with the 30 MB cap.
3. **`duplex: "half"` cast in tests** — tests construct `Request` inits with `duplex`,
   which TS DOM `RequestInit` doesn't type. Response: the cast is scoped to tests and
   matches the undici/fetch standard used at runtime by `@hono/node-server`; production
   code has no casts.
4. **Arabic error message in a middleware module** — inconsistent language risk if a
   non-Arabic consumer calls the API. Response: the entire API surface returns Arabic
   user-facing messages (see rate-limit 429 and all `InventoryError` messages); matching
   it keeps UX consistent. A `413` is also machine-readable via status code.

## Defender side

1. **Content-Length short-circuit is real**: hono's `bodyLimit` reads `content-length`
   and returns the 413 response *without touching the body stream* — proven by the test
   asserting the downstream handler is never invoked. This directly fixes the issue's
   "multipart fully buffered before any size check" problem: the buffer can never exceed
   30 MB, and a lying content-length is rejected before a byte is read.
2. **Chunked/streamed bodies are capped mid-stream** — hono's `bodyLimit` wraps the
   reader and errors the stream past the cap; the `BodyLimitError` path is exercised by
   the no-content-length test and returns 413.
3. **Defense in depth is preserved**: route-level per-file count (10) and total (25 MB)
   caps still run after the middleware for under-cap requests; the middleware is a
   *transport* backstop, not a replacement.
4. **Zero new dependencies** — `hono/body-limit` and `hono/factory` are already in the
   Hono 4.12.12 dependency graph; no lockfile or package.json edits (parent-owned files).

## Synthesis

No fixes required. Critic points 1–4 are answered by the design; no security regression
was found. One follow-up observation: the multipart cap (30 MB) intentionally sits above
the route-level total cap (25 MB), so a client can still send 25–30 MB before the
route-level cap rejects — bounded memory, acceptable defense-in-depth trade-off.
