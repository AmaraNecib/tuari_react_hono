# Code Review — Issue #283

- Fixed point: `256f24a34cf77ed527177ee640e74c1039028dbb` (merge-base with `origin/develop`)
- Diff: `git diff 256f24a...HEAD` (`b0c3efa806f1fa7b37630deeb3343ebd7ba7abbe`)
- Spec: GitHub issue #283 + `.scratch/implementation/283-design.md`
- Method: single-agent two-axis review (Standards + Spec)

## Standards

Sources: `AGENTS.md`, repo conventions (typed errors, JSDoc on public APIs, Arabic
user-facing messages preserved, no `any` casts introduced).

- **Documented standards:** no violations found. Lint (`pnpm lint`) and typecheck
  (`pnpm typecheck`) pass cleanly; JSDoc added for `withPermission` and
  `RpcContext.remoteAddress` matches the repo's comment conventions.
- **Smell baseline (Fowler):**
  - *Duplicated Code:* none introduced — IP resolution stays in the single
    `resolveClientIp` seam; `getRateLimitKey` only passes data through it.
  - *Speculative Generality:* the `trustProxyHeaders` option threading is exercised
    (config → router → middleware) and mirrors the existing auth-limiter wiring, so
    it is not speculative.
  - *Feature Envy / Primitive Obsession / Message Chains:* none in the diff.
  - *Mysterious Name:* `callRateLimited` in tests is self-explanatory; production
    names unchanged.
  - The `sendOTP` hard-failure callback is a deliberate, commented security guard
    (matches better-auth's required-option typing), not a smell.

## Spec

Issue requirements vs implementation:

1. *"Remove the placeholder OTP plugin or implement a real delivery provider; never
   log OTP secrets"* — the placeholder `sendOTP` (which `console.info`'d) is gone;
   the callback is now a hard failure that cannot reach stdout/logs (verified
   against better-auth `routes.mjs`: `sendOTP` is the only output hook and the
   password sign-in path never calls it). **Decision documented in the design doc**:
   the `phoneNumber` plugin itself is retained because the web app's login flow
   (`signIn.phoneNumber({ phoneNumber, password })`) requires its
   `/sign-in/phone-number` endpoint — removing the whole plugin would break login.
   Scope kept to "never log OTP secrets" — no SMS provider was added (the issue
   allows either branch). ✅
2. *"Drop the spoofable header when `trustProxyHeaders` is false; fall back to the
   socket address"* — `getRateLimitKey` now passes `context.remoteAddress`
   (transport socket, plumbed through `createRpcContext`) and
   `dependencies.trustProxyHeaders ?? false`; `resolveClientIp` already ignores the
   header in that mode. ✅
3. *"Document `withPermission` OR/AND semantics"* — JSDoc at the definition site
   states OR (`some()`), that it is NOT AND, and how to compose AND explicitly;
   pinned by a test. ✅

Scope creep: none — diff touches only the two fix surfaces + tests + design doc.

## Verdict

- Standards: **pass** (0 violations, 0 actionable smells).
- Spec: **pass** (all three requirements implemented; the one judgment call —
  keep the plugin, remove the placeholder callback — is documented).
- No actionable findings. Safe to push.
