## Multipart bodies are fully buffered before any size check: pre-check Content-Length (🟠 Major)

`await c.req.formData()` in `apps/api/src/app/create-app.ts` parsed the ENTIRE
multipart body into memory before the 25 MB attachment cap was checked, a
loopback-only memory-exhaustion vector that becomes an unauthenticated DoS if
`API_HOST` is ever set to LAN/public (auth endpoints only had a 30 req/15 min
limiter; the upload route requires a session). Fix (#272): a global,
content-type-aware `bodyLimit` (1 MB JSON/urlencoded, 30 MB multipart)
registered before ALL route handlers, a `Content-Length` short-circuit that
returns 413 before the body is read, and the existing per-file/total caps kept
as defense in depth.

**Always**: when an endpoint calls `c.req.formData()` or `c.req.text()`, check
for an upstream size gate BEFORE the read; a route-level cap after a full
buffered parse is not a limit. Content-type-aware caps (JSON vs multipart) and
a `Content-Length` pre-check are the cheap first line; keep the multipart cap
ABOVE route-level per-file caps so the route still enforces its own totals.

