# #175 — M7 production hardening: perf + security (perf/security lane)

- **mode:** `local-only` (repo unavailable; source of truth is this checkout + cached `origin/develop`)
- **ticket:** #175 (milestone parent — M7 production hardening)
- **target ref:** `feature/issue-175-perf-security`
- **base SHA:** `6be3497` (`origin/develop`)
- **review tier:** Standard (defense-in-depth hardening; no new public API)

## Objective (from brief)

Focus on the installed threat-contact surface and measure/document performance:

1. auth bootstrap / sign-in / OTP
2. RPC transport + origin / rate limits / body limits
3. invoice attachment upload
4. recovery-key and DB-key rotation
5. desktop API bridge

Implement **only LOW-RISK** fixes with tests; escalate anything risky/broad to the
parent via `crew_report` instead of silently widening scope. Do not duplicate the
transport-seam (#214), reports-stub (#242), or #334 lanes.

## Current posture (confirmed already shipped in base)

- **Body limits (#272):** global `bodyLimitMiddleware` (1 MB JSON/urlencoded, 30 MB
  multipart) with a `Content-Length` short-circuit (413 before read) + route-level
  per-file/total attachment caps (10 files / 25 MB) on the invoice upload.
- **Rate limits (#283):** `/api/auth/*` sliding-window 30 req/15 min per IP (with
  spoof-proof socket keying when proxy headers untrusted); RPC middleware has its own
  100 req/15 min per-IP limiter on the `*RateLimited` wrappers.
- **Origin/CORS:** allowlist-based origin checks on `/api/auth/*`, `/rpc/*`,
  `/api/inventory/*`; HSTS/security headers; `Vary: Origin`.
- **OTP (#283):** `sendOTP` hard-fails (no OTP delivery/logging) — deliberate.
- **Recovery keys:** 72-bit entropy (18 hex), unsalted SHA-256 storage (acceptable for
  high-entropy keys), one-time-use + pool cap enforced inside a real transaction.
- **DB key rotation (#265/#352):** fresh-connection verify, tri-state rekey result,
  rollback-slot persistence.
- **Desktop bridge:** forwarded-header denylist (`authorization`, `cookie`, `host`,
  `origin`, `content-length`), fail-closed delivery phases, per-runtime `resolveClientIp`.

## Findings (documented — see committed report)

Security review across the five contact points surfaced **two low-risk gaps** in
credential/rotation rate coverage (both fixed here) and several **residual risks**
that are out of scope or too broad to change safely (escalated):

1. **Low-risk:** The unauthenticated `authBootstrap` RPC endpoint (first-user setup with
   the setup secret) is NOT behind any per-IP limiter. The setup secret is already gated
   as a strong secret (≥20 chars + entropy), so online guessing is already infeasible —
   but the endpoint was the single in-scope credential-verification surface not throttled.
   → Wrap it with the existing RPC per-IP limiter (defense-in-depth).
2. **Low-risk:** The high-value recovery-key and DB-key-rotation mutations
   (`generateRecoveryKeys`, `consumeRecoveryKey`, `revokeRecoveryKey`,
   `changeDbEncryptionKey`) use the non-rate-limited `mutationAudit` wrapper even though
   they are the credential/encryption-rotation contact points. → Switch to
   `mutationAuditRateLimited` (same auth/audit semantics, adds the 100/15-min per-IP budget).
3. **Residual / escalate (documented, NOT fixed):**
   - RPC + auth rate-limit keys collapse to a single `ip:unknown` bucket when the runtime
     does not expose a socket peer address. No safe client-supplied fallback exists when
     `trustProxyHeaders=false` (headers are spoofable). Mitigation is deployment
     (`trustProxyHeaders=true` behind a trusted reverse proxy, or ensuring the runtime
     exposes `incoming.socket.remoteAddress`). Not a code fix.
   - Setting `API_HOST` to LAN/public while `trustProxyHeaders` stays false makes all
     real clients share the reverse-proxy's socket → collective throttle. Deployment
     concern, not a code change.
   - Attachment download streams the whole blob in memory; acceptable for 25 MB caps and
     sqlite storage, noted as a future streaming candidate (not changing now).
4. **Performance (measured/inspected):** request hot path already caches the session
   resolution once per request (`createRpcContext` memoized `currentUserPromise`);
   `checkRateLimit` runs before auth on the rate-limited wrappers so throttling happens
   before expensive work. No obvious N+1 or unbounded loops on the contact surface.

## Changes (this commit)

- `apps/api/src/rpc/rpc-middleware.ts`: expose a `rateLimit(context)` helper on the
  middleware return (calls the existing `checkRateLimit`), so unauthenticated base
  handlers can share the per-IP budget.
- `apps/api/src/rpc/router.ts`: apply `m.rateLimit(context)` to the `authBootstrap`
  handler.
- `apps/api/src/rpc/handlers/system.ts`: switch `generateRecoveryKeys`,
  `consumeRecoveryKey`, `revokeRecoveryKey`, `changeDbEncryptionKey` from
  `mutationAudit` → `mutationAuditRateLimited`.
- Tests: RPC-middleware unit test for the new `rateLimit` helper; router/system-level
  check that recovery/DB-key rotation handlers are rate-limited.

## Verification

- `pnpm --filter @tuari/contracts build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:api` (targeted: rpc-middleware, system handlers)
- Local Greptile CLI scoped to the #175 perf/security diff.

## Risks / escalation

- No new public API or wire-format change; only throttle placement under existing
  authenticated/credential surfaces. `rateLimit` on `authBootstrap` can reject a setup
  only after 100 attempts from one IP in 15 min — acceptable.
- The residual rate-limit-key-collapse and LAN-public-`API_HOST` issues are escalated
  via `crew_report` (deployment/config), not silently changed.
