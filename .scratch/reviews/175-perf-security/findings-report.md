# #175 — M7 production hardening: perf + security findings report

Lane: perf/security hardening. Branch `feature/issue-175-perf-security`, base `6be3497`
(`origin/develop`), mode `local-only`.

## Summary

A focused review of the five installed threat-contact points + a performance profile
of the request hot path. The base is already extensively hardened (#272 body limits,
#283 rate-limit keying + OTP refuse-to-send, #265/#352 DB-key rotation tri-state,
origin/CORS allowlist, security headers). This lane applied **two low-risk,
defense-in-depth fixes with tests** and documents **three residual risks** that are
deployment/config concerns or too broad to change here (escalated via `crew_report`).

## Threat-contact points — findings

### 1. Auth bootstrap / sign-in / OTP — LOW-RISK FIX APPLIED

- Sign-in (`/api/auth/*`) is behind the 30 req/15 min per-IP sliding-window limiter,
  origin-checked, with spoof-proof socket keying when proxy headers are untrusted.
- OTP deliberately refuses to send (#283) — `sendOTP` throws; no OTP can leak to logs.
- **Gap found:** the RPC `authBootstrap` endpoint (first-user setup, verifies the
  setup secret) ran with NO rate limit — the only unauthenticated credential-verifying
  surface not throttled. The setup secret is already gated as a strong secret
  (≥20 chars + entropy), so online guessing was already infeasible.
- **Fix:** `authBootstrap` now charges the shared per-IP RPC budget via a new
  `rateLimit(context)` helper on the middleware (100 req/15 min); throttled before the
  handler and before any service work. Tests: `rpc-middleware.test.ts` (helper unit +
  socket-keying) and `router.test.ts` (100 allowed → 101st `TOO_MANY_REQUESTS`, service
  not reached).

### 2. RPC transport + origin / rate / body limits — reviewed, no change

- Origin allowlist enforced on `/rpc/*` (and `/api/auth/*`, `/api/inventory/*`).
- `bodyLimitMiddleware` (#272): 1 MB JSON/urlencoded / 30 MB multipart, Content-Length
  short-circuit 413 before read; invoice route keeps its per-file/total caps (10 files,
  25 MB) as defense in depth — the multipart cap sits ABOVE the route caps so the route
  still enforces its own totals.
- Rate-limited `*RateLimited` wrappers check the limiter BEFORE auth/expensive work.
- **Residual (escalated, not a code fix):** when the runtime exposes no socket peer
  address and `trustProxyHeaders=false`, the per-IP budgets collapse to one shared
  `ip:unknown` bucket (correct fail-safe against spoofed headers, but a shared bucket).
  Mitigation is deployment: run behind a trusted reverse proxy with
  `API_TRUST_PROXY_HEADERS=true`, or confirm the runtime populates
  `incoming.socket.remoteAddress`. Same applies to exposing the API on LAN/public with
  an untrusted proxy — all real clients would share the proxy socket and be throttled
  collectively. Documented, not silently changed.

### 3. Invoice attachment upload — reviewed, no change

- Upload: session + bootstrap-owner auth, per-file+total size caps, count cap, body
  limit with Content-Length pre-check (no full buffering past the cap).
- Download: authenticated + owner-guarded; `Content-Disposition`
  `filename="${encodeURIComponent(name)}"` — `"` is escaped by `encodeURIComponent`
  (no header injection); `no-store` cache headers applied to `/api/inventory/*`.
- **Residual (documented):** download streams the whole blob via `c.body()` (sqlite
  storage). Acceptable at the 25 MB cap; a streaming download is a future
  optimization, out of scope (risky to change wire behavior now).

### 4. Recovery-key and DB-key rotation — LOW-RISK FIX APPLIED

- Recovery keys: 72-bit entropy (18 hex chars), one-time-use + pool cap enforced in a
  real transaction, only 4-char prefix stored, unsalted SHA-256 storage acceptable for
  high-entropy keys (2^72 brute force infeasible), consumed keys never reused.
- DB-key rotation: fresh-connection verify, tri-state `rekeyed`/`ambiguous` result,
  rollback-slot persistence (#265), restore-old-key on pre-delivery failure (#352).
- **Gap found:** `generateRecoveryKeys`, `consumeRecoveryKey`, `revokeRecoveryKey`,
  and `changeDbEncryptionKey` used the NON-rate-limited `mutationAudit` wrapper despite
  being the highest-value credential/encryption-rotation surface (a compromised-but-active
  admin session, or IP-level abuse, could thrash these operations).
- **Fix:** switched all four to `mutationAuditRateLimited` (same auth + audit semantics,
  adds the 100 req/15 min per-IP budget, checked before the handler).
  Test: `router.test.ts` — 100 authenticated `consumeRecoveryKey` calls succeed, the
  101st is `TOO_MANY_REQUESTS` and the service is never reached.

### 5. Desktop API bridge — reviewed, no change

- Forwarded-header denylist strips `authorization`, `cookie`, `host`, `origin`,
  `content-length` before the native bridge forwards; fail-closed delivery phases
  (pre-delivery / response-body-read / unknown) prevent ambiguous recovery handling;
  per-runtime `resolveApiBaseUrl`; multipart uploads go through the same body limits.

## Performance profile (request hot path)

- `createRpcContext` memoizes the session resolution (`currentUserPromise`) → one
  `getCurrentUser` per RPC request, not per handler.
- Rate-limit checks run before auth and before service work on all rate-limited
  wrappers — throttled requests cost no DB/session work.
- RPC handler fan-out (`Promise.all` for parallel snapshots) avoids serial N+1 on the
  workspace snapshot path.
- Rate limiter uses in-memory sliding windows with a 60 s `unref`'d cleanup timer
  (no timer keeps the process alive; bounded memory by IP cardinality).
- Recovery-key hashing is one SHA-256 per op (sync, microseconds) — negligible.
- No unbounded loops or full-table scans found on the contact surface; attachment
  download buffering is the only notable memory profile item (bounded at 25 MB,
  documented above).

## Verification (all green on this branch)

- `pnpm --filter @tuari/contracts build` ✅
- `pnpm --filter @tuari/api test` — 67 files, 1174 passed / 1 skipped ✅
- `pnpm --filter @tuari/api typecheck`; `pnpm typecheck` (turbo all) ✅
- `pnpm lint` (turbo, hygiene + per-package eslint) ✅
- `pnpm test:web` — 59 files, 494 passed ✅

## Residual risks / escalted items

1. Rate-limit key collapse to `ip:unknown` when runtime exposes no socket peer address
   (deployment/config; `trustProxyHeaders=true` behind a trusted proxy).
2. LAN/public `API_HOST` + untrusted proxy → collective throttling of real clients.
3. Attachment download is fully buffered (bounded, but a streaming route is a future
   optimization; changing the wire behavior now is out of scope).