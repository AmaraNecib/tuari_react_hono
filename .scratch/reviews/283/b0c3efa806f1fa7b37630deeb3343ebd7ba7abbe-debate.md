# Debate — Issue #283 (High-assurance)

- Base: `256f24a34cf77ed527177ee640e74c1039028dbb`
- Head: `b0c3efa806f1fa7b37630deeb3343ebd7ba7abbe` (last reviewable commit; evidence re-SHA commit touches only .scratch/)
- Scope: `.scratch/implementation/283-design.md`, `git diff 256f24a...27e4536`
- Method: single-agent adversarial review (critic + defender roles synthesized)

## Critic findings

| # | Sev | Location | Finding | Disposition |
|---|-----|----------|---------|-------------|
| C1 | 3/10 | `apps/api/src/infrastructure/auth/auth.ts` (sendOTP throw) | better-auth's `/phone-number/send-otp` route generates and stores a code in the `verification` table *before* invoking `sendOTP`, so a refused attempt still writes a stored-but-undelivered code. Not delivered → useless to an attacker; the table key is per-identifier (overwritten per attempt); default `expiresIn` cleans it up. Omitting `sendOTP` entirely would return NOT_IMPLEMENTED before generating, but the plugin's TS type declares `sendOTP` mandatory, so omission requires a type cast. | **Dismissed** — stored-undelivered code has no security exposure; loud hard-failure is preferred over a cast and is self-documenting (a future dev enabling OTP gets an immediate 500, not silent no-op). Documented in the code comment. |
| C2 | 2/10 | `create-app.ts` → `router.ts` → `rpc-middleware.ts` | `trustProxyHeaders` is threaded through three layers. | **Dismissed** — the RPC middleware has no config access today; this mirrors exactly how the HTTP auth limiter consumes `transportSecurity.trustProxyHeaders` (single source of truth, config-consistent, no duplicate env parsing). |
| C3 | 2/10 | `tests/e2e/security-batch.spec.ts` | Sign-in cookie is parsed via `setCookie.split(",")[0].split(";")[0]` — depends on the session cookie being the first `set-cookie` value. | **Dismissed** — the first `;`-segment is always `name=value` regardless of Expires-date commas; verified passing end-to-end against the real API. |
| C4 | 5/10 | `rpc-middleware.ts` getRateLimitKey | The budget is keyed per client IP, not per user — a local process can exhaust the shared loopback bucket for other local clients (loopback-only DoS). | **Deferred (pre-existing)** — the pre-fix code keyed everything on `ip:unknown` (a single shared bucket), so the fix strictly improves isolation. Per-user keying is a design change beyond this issue's scope; documented as residual risk in the PR. |
| C5 | 1/10 | `rpc-middleware.ts` comment | Comment says "(based on user ID or IP)" while implementation keys only on IP — pre-existing wording retained. | **Fixed** — comment now says "per client". |

## Defender summary

- Both exploits are closed with a minimal diff: OTP delivery is a hard failure (no stdout/log path exists in the plugin wiring — verified in better-auth `routes.mjs` that `sendOTP` is the only OTP-output hook, and it now throws), and the RPC rate-limit key falls back to the transport socket address whenever proxy headers are not explicitly trusted.
- Reuses the existing `resolveClientIp` seam — no duplicate IP-resolution logic.
- Behavior parity with the HTTP auth limiter (same `trustProxyHeaders` source, same socket source `getRemoteAddress(c.env)`).
- Unit tests reproduce the exact reported exploit (rotating spoofed headers + 101st request), E2E proves the user-facing regression surface is intact.
- No scope creep: no SMS provider, no rate-limit tuning, no unrelated refactors.

## Synthesis

- Blockers: none. Majors in scope: none.
- Fixed during debate: C5 (comment accuracy).
- Deferred: C4 (per-user rate budget — pre-existing, out of scope, documented as residual risk).
- Dismissed: C1, C2, C3 (see rationale above).
