# Test Audit — Issue #272 (bodyLimit middleware)

Tier: High-assurance (security). Base SHA: `9aac620`. Evidence SHA (HEAD at review): `fa5b33c`.
Executed inline (three lenses) because sub-agent spawning is unavailable.

## Edge-case hunter

Checked boundary values and failure paths:

- **Exactly at cap (1 MB)** → covered (`lets a JSON body exactly at the 1 MB cap through`).
- **Over cap (content-length path, JSON)** → covered; handler never invoked.
- **Over cap (content-length path, multipart)** → covered; body never parsed.
- **Over cap (streaming, no content-length)** → covered (32 × 64 KB chunks); exercises the
  `BodyLimitError` mid-stream path.
- **Missing content type** → covered (`resolveBodyLimitMaxSize(undefined)` → 1 MB).
- **Case-insensitive content type** → covered (`Multipart/Form-Data`).
- **Bodyless GET** → covered.
- **Under-cap multipart** → covered.
- **App wiring**: oversized JSON to a real route → 413; oversized multipart to the real
  attachment route → 413 *before* `getCurrentSessionUser` is called; in-limit body passes
  through to handler → 200.

Gap: no test with `Transfer-Encoding: chunked` + explicit content-length (hono treats that
as streamed; undici strips conflicting headers in practice). Low risk — hono's own
middleware covers the dual-header branch; documented here as advisory.

## Coverage analyst

- `resolveBodyLimitMaxSize`: all branches covered (multipart true/false, case-insensitive,
  undefined).
- `bodyLimitMiddleware`: content-length short-circuit (both JSON and multipart), streaming
  path, bodyless passthrough, handler-not-invoked — all covered.
- App-level wiring: the middleware is exercised through `createApp` on 3 routes.
- Middleware directory is not in the vitest coverage `include` list (only
  `src/modules/{workforce,invoice,auth,account,payment,rbac,company}`), so no threshold
  pressure — but explicit tests still cover every branch.

## Quality reviewer

- Assertions are behavior-focused (status 413 + JSON message + handler-not-called), not
  smoke checks.
- The handler-not-invoked assertion for the content-length path is the strongest
  security-relevant check: it proves the body is rejected before buffering/parsing.
- Test for the attachment route asserts `getCurrentSessionUser` not called — proves the
  guard runs before session resolution + `formData()` parse, the exact vulnerability
  window from the issue.
- No shallow "doesn't crash" tests.

Verdict: no actionable gaps; single advisory note on the dual-header branch.
