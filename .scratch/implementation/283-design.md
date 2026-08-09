# Issue #283 — Security batch: remove placeholder OTP plugin, drop spoofable X-Forwarded-For from RPC rate-limit key

**Tier:** HIGH-ASSURANCE (security: OTP credential leak, spoofable rate-limit key)
**Base SHA:** `256f24a34cf77ed527177ee640e74c1039028dbb` (merge-base with `origin/develop`)
**Branch:** `refactor/issue-283-otp-xff`

## Problem (from issue #283)

1. `apps/api/src/infrastructure/auth/auth.ts:31-33` — `phoneNumber({ sendOTP })` only
   `console.info`s the verification request; if OTP sign-in were ever enabled, OTP
   codes would print in plaintext to `%APPDATA%/Tuari/logs/api-server.log`.
2. `apps/api/src/rpc/rpc-middleware.ts:37-44` — RPC rate-limit key is
   `ip:${x-forwarded-for}` with `trustProxyHeaders: true` hardcoded and
   `remoteAddress: undefined`. Local/desktop-bridge clients can rotate the header
   to reset their rate budget.
3. `withPermission` uses OR semantics for arrays (`requiredPermissions.some(...)`)
   — must be documented so it can't be misused as AND later.

## Decision: OTP plugin

**Chosen: remove the placeholder `sendOTP` callback; keep the `phoneNumber` plugin.**

Rationale — removing the whole plugin would break the primary login flow:
- The web app signs in with `getAuthClient().signIn.phoneNumber({ phoneNumber, password })`
  (`apps/web/src/features/auth/use-phone-sign-in-mutation.ts:34`), which hits the
  plugin's `/sign-in/phone-number` (password-based) endpoint. The plugin is NOT a
  placeholder — only its `sendOTP` callback is.
- In better-auth@1.6.20, `sendOTP` is only invoked when `requireVerification` is set
  (it is not). Without `sendOTP`, the OTP send route
  (`/phone-number/send-otp`) returns `NOT_IMPLEMENTED` *before* generating/storing
  a code — verified in `dist/plugins/phone-number/routes.mjs`:
  `if (!opts?.sendOTP) { … throw APIError.from("NOT_IMPLEMENTED", SEND_OTP_NOT_IMPLEMENTED) }`.
  So no OTP can ever be generated or logged.
- Comment documents why `sendOTP` is deliberately absent.

## Decision: RPC rate-limit key

Thread the socket address and the `trustProxyHeaders` config flag into the RPC
middleware, mirroring the existing HTTP auth limiter in `create-app.ts`:

- `RpcContext` gains `remoteAddress?: string`. `createRpcContext(headers, sessionService, remoteAddress?)`
  stores it. The only call site (`app/create-app.ts` `/rpc/*` handler) passes
  `getRemoteAddress(c.env)` — the same socket source already used by the auth limiter.
- `createRouter(deps, options?: { trustProxyHeaders?: boolean })` → passes to
  `createRpcMiddleware`. `createApp` wires `transportSecurity.trustProxyHeaders ?? false`.
- `getRateLimitKey` calls `resolveClientIp({ forwardedFor, realIp, remoteAddress: context.remoteAddress, trustProxyHeaders })`
  — `resolveClientIp` (unchanged) already ignores the header when `trustProxyHeaders`
  is false and falls back to `remoteAddress ?? "unknown"`.

Behavior change: with the default config (`API_TRUST_PROXY_HEADERS` unset → false),
browser RPC calls now key on the loopback socket address instead of `ip:unknown` —
functionally identical (one shared bucket per client process) but no longer spoofable.

## Decision: withPermission semantics

Add JSDoc to `withPermission` stating: a single permission OR an array means
**OR** (user needs *any* of the listed permissions, `some()`); AND semantics are
not supported and must be composed explicitly (chained guards). A unit test
documents the OR-not-AND property.

## Public API / interfaces

- `RpcContext` type: `+ remoteAddress?: string`
- `createRpcContext(headers, sessionService, remoteAddress?)` — 3rd optional param
- `createRouter(dependencies, options?: { trustProxyHeaders?: boolean })` — optional 2nd param
- `createRpcMiddleware(dependencies)` — `RouterDependencies` gains optional `trustProxyHeaders?: boolean`
- `createAuth(...)` — unchanged signature; `sendOTP` callback removed

## Dependencies

- none new; uses existing `resolveClientIp` from `infrastructure/rate-limiter.ts`

## Planned tests

Unit (vitest):
- `rpc/rpc-middleware.test.ts`:
  - Spoofed `x-forwarded-for`/`x-real-ip` ignored when `trustProxyHeaders` is false (default);
    rotating spoofed headers still exhaust the 100/15-min budget → 101st call throws
    `TOO_MANY_REQUESTS` (the exact exploit from the issue, now closed).
  - Socket `remoteAddress` keys the bucket: same socket + rotating spoofed headers = shared budget.
  - `trustProxyHeaders: true` → header IS used (rotating headers never exhaust).
  - No remoteAddress + no headers → `ip:unknown` shared bucket.
  - `withPermission` OR-not-AND doc test.
- `rpc/context.test.ts`: `remoteAddress` stored on the context; optional.
- `infrastructure/rate-limiter.test.ts`: forwardedFor present but `trustProxyHeaders` false
  (default) → socket address wins.
- `infrastructure/auth/auth.test.ts` (new):
  - `createAuth` builds an instance without calling `console.info` (no OTP logging path).
  - `auth.api.sendPhoneNumberOTP({ phoneNumber })` → rejects with
    `NOT_IMPLEMENTED` / "sendOTP not implemented" (proves OTP delivery is not wired;
    no code is ever generated or logged).

Playwright E2E (`tests/e2e/`):
- Phone+password sign-in still works after the `sendOTP` removal (regression for item 1)
  — existing `bootstrapOrSignIn` path re-verified in a focused spec.
- An authenticated RPC request carrying a spoofed `x-forwarded-for` header still
  succeeds (regression: RPC flow unaffected by the key change).
- NOT E2E-tested: exhausting the 100-request/15-min RPC budget — it would burn the
  shared loopback bucket for sibling specs in the same serial run. The security
  property (spoofed header cannot reset the budget) is proven at the unit level.

## Implementation risks

- Threading `trustProxyHeaders` through `createApp` → `createRouter` → `createRpcMiddleware`
  touches `create-app.ts` (core file). Verified: none of the parallel issues
  (#273/#276/#279/#280) touch `apps/api/src/app/create-app.ts` or `apps/api/src/rpc/*`.
- Removing `sendOTP` must not break phone+password sign-in: verified in
  better-auth routes.mjs that the password path never calls `sendOTP` (only the
  `requireVerification` branch does, and that flag is unset).
- `router.test.ts` and `create-app.test.ts` construct the router/app with existing
  signatures; both new parameters are optional, so no test churn beyond additions.

## Out of scope / deferred

- Real OTP delivery provider (SMS provider integration) — intentionally not implemented;
  issue allows either removal or real delivery; removal is the small-batch scope.
