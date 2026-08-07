# Code Review — Issue #249 (pre-push self-review)

- Base (fixed point): `bb49ec29335adb1564ba69bc7f1d91a2e9f43b33` (merge-base with develop)
- Head: `20bc48eecb61468172b4c2a9521baac0e2064cd3`
- Two parallel sub-agents: Standards + Spec

## Standards

No hard violations. Judgement calls:

1. **E2E requirement** (docs/engineering-workflow.md §4 "Every feature MUST include Playwright E2E tests") — no E2E added. Deviation documented in the design doc: no user-facing behavior changes; unit-level coverage only. Accepted.
2. **Duplicated Code** — `serialized()` + BEGIN/COMMIT/ROLLBACK `withTransaction` (~40 lines) mirrors `sqlite-recovery-key.port.ts`; acknowledged in comments, drift-prone (guarded ROLLBACK added only here). **Tracked in #288** (shared lock primitive).
3. **Duplicated Code (test fixtures)** — ~20-line invoice-receive fixture block repeated in 3 payment tests (2 pre-existing). Minor, test-only.
4. **Message Chains** — `debtPort.state.debtAccounts.values().next().value!.id` in tests (pre-existing pattern). Trivial.

Verified clean: no Mysterious Name, Feature Envy, Repeated Switches, Primitive Obsession, Speculative Generality, Refused Bequest. Tooling-enforced items skipped. The 3 touched test files pass (61/61 at time of review; 63 after the cursor-strengthening commit).

## Spec

Faithful implementation. All four acceptance criteria verified with evidence:
- `apps/api/vitest.config.ts` include adds `src/modules/account/**/*.ts` + `src/modules/payment/**/*.ts` ✓
- 100% thresholds pass (370 stmts / 233 branches / 77 funcs / 346 lines) ✓
- Tests assert behavior (error messages + status codes, DB rows read back from real SQLite, cursor decode outcomes pinned) ✓
- `pnpm typecheck` + `pnpm test:api` (734 tests) + `pnpm lint` green ✓

Scope creep assessment: the only production change is the `withTransaction` rewrite. **Justified** — the old `this.db.transaction(async …)` threw "Transaction function cannot return a promise" at runtime for every account profile update / password-change record (empirically reproduced); honest tests were impossible without the fix. Mirrors the established sqlite-recovery-key.port / sqlite-bootstrap.port pattern. The nested-join + FIFO-lock semantics exceed a minimal wrap but are pattern-consistent and pinned by tests.

Residual notes: `**/adapters/**` (pre-existing exclude) still hides the payment SQLite adapter from coverage — consistent with #248 policy; tracked in #288. One weakness fixed post-review: string/null-sortValue cursor tests now assert the cursor row is skipped (decode-success distinguishable from fallback).

## Verdict

No actionable findings. Safe to push.
