# Test Audit — #247 RPC wire tests (getRecoveryKeyPool / generateRecoveryKeys)

- Base SHA: `03ec349643901a2802338d8e19b730b28e5eb841`
- Head SHA (audited): `d1775a31d5db8eb731b66a5499d9db4f02a5abe3`
- Tier: Standard
- Date: 2026-08-10

## Method

Three parallel sub-agents (edge case hunter, coverage analyst, quality
reviewer) reviewed the two new wire tests in
`apps/api/src/rpc/router.test.ts` against the handler passthroughs
(`apps/api/src/rpc/handlers/system.ts`), the service
(`apps/api/src/modules/auth/recovery-key.service.ts`) and the wire schemas
(`packages/contracts/src/security.ts`, `system-contract.ts`).

## Findings

### Edge Case Hunter

- ✅ Both tests follow the established black-box pattern (real
  `RecoveryKeyService` on a stubbed `RecoveryKeyPort`, injected via the
  harness `recoveryKeyService` param, invoked through the untyped client so
  ORPC output validation genuinely runs). Passthrough call-count assertions
  correct; regex pins the key format beyond the loose schemas.
- 🟠 **Empty result boundary for generateRecoveryKeys** — only the 3-key path
  was pinned; `{ keys: [] }` (full pool) never crossed ORPC validation.
  → **FIXED**: second `generateRecoveryKeys` call against a full-pool stub
  asserts `resolves.toEqual({ keys: [] })`.
- 🟠 **Zero-count boundary for getRecoveryKeyPool** — `availableCount: 0`
  with a non-empty pool never exercised the `nonnegative().int()` boundary
  through the wire.
  → **FIXED**: second `getRecoveryKeyPool` call against an all-consumed/
  revoked record set asserts the exact zero-available shape.
- 🟠 **Non-strict output schemas can mask field leakage** —
  `recoveryKeyPoolStatusSchema` / `generatedRecoveryKeysSchema` are plain
  `z.object` (not `.strict()`), so zod strips unknown props (e.g. a leaked
  `keyHash`/`consumedAt`) and the wire test would still pass. Contract change
  — **DEFERRED** (follow-up; out of scope for a test-only issue).
- 🟡 `createdAt` asserted via `toBeTruthy()` only — format pinned at service
  level (`recovery-key.service.test.ts`). Accepted.
- 🟡 No per-procedure unauthenticated/audit assertion — the generic protected-
  procedure test already covers the auth middleware pattern. Accepted.
- Out of scope correctly omitted: invalid output shapes (cannot be produced
  through the harness), concurrency/rollback/unique-key (service-level tests).

### Coverage Analyst

- ✅ Both acceptance criteria (one test per passthrough) covered.
- ✅ Diverse: query vs mutation; exact deep-equality vs structural/format;
  different port methods stubbed.
- ✅ Minimal duplicate coverage: consume/revoke wire tests, service tests and
  the e2e test all bypass the wire for these two procedures — the new tests
  fill a real gap.
- ✅ Test 1's exact `toEqual` proves the handler returns the service value
  unmodified.
- No blockers.

### Quality Reviewer — Grade B

- Correct naming, async handling, isolation, and comment clarity.
- Test 1 exact `toEqual` pins the full shape; test 2 pins format + call
  counts through `withTransaction` and the `{ keys }` handler wrap.
- Minor notes (accepted): unused mocks in the pool-test port stub (matches
  file convention); no explicit schema-rejection test (issue's criterion is
  "resolve through output validation" — covered).

## Actions taken

1. Added zero-available pool boundary to the `getRecoveryKeyPool` test.
2. Added full-pool `{ keys: [] }` boundary to the `generateRecoveryKeys` test.
3. Deferred: `.strict()` parity for the two output schemas (contract change —
   candidate follow-up issue).

## Verification

- `pnpm --filter @tuari/api exec vitest run src/rpc/router.test.ts` — 26/26 pass
  after the fixes.
