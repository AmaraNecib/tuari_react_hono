# Issue #322 — Test Audit Evidence

**Issue:** #322 — API: unlocked sync db.transaction() writers can be absorbed into open async transactions (High-assurance)
**Tier:** High-assurance
**Base:** `3c14490` (origin/develop) — **Head:** `90d7ce1` (final rebased HEAD after the fix loop; see post-evidence delta)
**Audited:** the seven changed test files (fifo-lock.test.ts, sqlite-company.repository.test.ts, account.service.test.ts, update-history.service.test.ts, transaction-lock-guard.test.ts, plus retained payment/invoice/auth suites) against the changed source and the design doc's planned-test matrix.

## Process

Edge-case hunter + coverage analyst + quality reviewer over `git diff origin/develop...HEAD` test files and the corresponding source. Independent verification: full `apps/api` suite run — **64 files / 1088 tests pass**; `tsc --noEmit` clean; `eslint` clean.

## Verdict

**No blockers. No red (would-break) findings.** Every issue "Done when" clause has at least one deterministic test:
- (a) detection mechanism / writers under the lock — fifo-lock unit tests (free / own-run / foreign-held / precedence-inversion / independent-lock), company adapter (busy + zero-writes-after-throw + nested SAVEPOINT), update-history adapter, integration (service-level, full composition).
- (b) absorb window eliminated — account real-repo lock-window test (lock free during gated bcrypt) + name-only-skips-verify.
- (c) timeout bound — fifo-lock timeout tests (reject, never-execute, FIFO-after-abandonment, brief-wait pass, construction validation) + composition-root `{ timeoutMs: 30_000 }` wiring.

Grades: fifo-lock **A**, company **A−**, account **B+**, update-history **B**, integration **B**.

## Edge Case Hunter

Covered well: empty-free lock, own-run join (sync and across a real `setTimeout` await hop), foreign-held throw, zero writes after a busy throw (COUNT assertion), precedence inversion, independent locks, queue alive after throw, abandoned-slot never-executes, multiple abandoned slots keep FIFO, timeout doesn't fire for a briefly-waiting op, non-positive `timeoutMs` rejected at construction, nested sync writes inside `withTransaction` (SAVEPOINT), 400/401/409 error-order preservation after the bcrypt refactor.

| # | Risk | Missing edge case | Where it could break | Fix / note |
|---|---|---|---|---|
| T1 | 🟠 | No test simulates the *true* absorb scenario end-to-end: a locked run that actually executes `BEGIN IMMEDIATE`, awaits a real yield, then a sync writer fires. The busy tests hold the lock with `await gate` but never BEGIN — a fair proxy for the activeCount throw path, but the "writer vs an actually-open transaction" interleaving is not pinned. | If a future change made the busy check depend on `raw.inTransaction` instead of `activeCount`, these tests would not catch it. | Accepted (deterministic tests can't reproduce a real interleaving); note in PR. |
| T2 | 🟡 | Join-outer with an actually-open transaction (payment `runInTransaction` → `recordInvoicePayment` savepoint) is not re-pinned by a new test in this change. | ALS own-run regression after a real yield. | Covered by fifo-lock "join across an await hop" + retained payment/invoice module tests; low. |
| T3 | 🟡 | Timeout tests use tight real-timer bounds (20/30/100 ms) with the default 5 s describe timeout. Under a loaded CI the "does not time out an operation that waits only briefly" test (100 ms bound, 10 ms holder sleep) is the flake candidate. | CI flake; the prior debate already fixed this class once (account suite `{ timeout: 20000 }`). | Should-fix: lengthen the fifo-lock timeout describe block (e.g. `{ timeout: 20000 }`). |
| T4 | 🟠 | No test for the abandoned-slot + immediate-retry interaction: a caller that catches `FifoLockTimeoutError` and re-queues while the abandoned slot is still in line. | Duplicate/reordered work is not possible (abandoned op never executes, chain stays FIFO), but it is unpinned. | Low; optional pinning test. |
| T5 | 🟡 | No test covers the plain sync writers identified in debate D1 (createRole, createDebtAccount, updateStatus, …) — because they are not wrapped. | Exactly the tripwire gap D1 describes. | Ties to the D1 follow-up; cannot be tested until wrapped. |

## Coverage Analyst

1. Acceptance criteria → test mapping: (a) detection — fifo-lock ×5 modes + company + update-history + integration service-level; (b) window elimination — account real-repo lock-window + skip-verify; (c) bounded wait — fifo-lock ×5 + `FifoLockTimeoutError` typed asserts. All present, deterministic, no mocking of the lock.
2. Diversity: good — unit (primitive), adapter (company/update-history), service (account), integration (composition root). The same gate-holder shape repeats across suites but exercises different seams.
3. Duplicate coverage: the busy-throw pattern is tested at primitive, adapter (company + update-history), and integration level — the adapter-level pair is justified (two distinct adapters, shared util), and the prior audit's duplicate fifo-lock tests were already merged.
4. Missing:
   - Composition-root lock *sharing* is not asserted (the lock is deliberately not exposed on `AppDependencies`) — verified by review, documented residual.
   - The real transaction section of the account flow is unobservable from outside by design (that is the point of the fix); uniqueness-inside-tx is proven via the mock-based 409 test.
   - better-auth session writes: no test (unwrappable), protected by invariant (D) — documented residual.
   - No Playwright E2E — deliberate (the race is not deterministically reproducible via a browser).

## Quality Reviewer

Grade: **A−**. Test names are behavior-descriptive ("refuses to run a sync writer while another flow holds the connection open", "timed-out operations never execute; multiple abandoned slots keep the queue FIFO"); DB lifecycle is in `beforeEach`/`afterEach` (the prior audit's leak fix held); isolation is clean (per-test in-memory DBs); assertions are strong (`toThrow(FifoLockBusyError)` typed, `COUNT(*) = 0` after a busy throw, post-release success asserted). Minor nits: the gate-holder boilerplate is duplicated across four suites (acceptable; extraction would reduce clarity per-suite), and `await new Promise((resolve) => setTimeout(resolve, 10))` sleeps are small but adequate for the ordering they pin.

## Residuals documented (not fixed)

- T3 — timeout-suite flake hardening recommended (should-fix, trivial).
- Composition-root lock sharing unasserted (verified by review).
- T1 — true absorb interleaving untestable deterministically; proxy tests accepted.
- better-auth writes unwrappable; invariant (D) protection only.
- Plain sync writers (debate D1) have no tripwire tests until wrapped (follow-up issue).

---

## Post-evidence delta (evidence refresh to final HEAD)

This evidence was originally written against HEAD `ba746e5` and renamed to the
final SHA `90d7ce1` after the fix loop (per `.agents/wisdom/process.md`).

**Delta (`ba746e5` → `90d7ce1`): test-only hardening addressing this review's
own findings — no production code changed.**
- **test-audit T3 (should-fix):** fifo-lock timeout suite hardened against CI
  flake — describe timeout lengthened to 20s (matching the account lock-window
  suite) and the real-timer bounds widened (30/20/100ms → 150/100/500ms); the
  brief-wait test now has a 50x margin. Verified stable across 3 consecutive
  runs.
- **test-audit T4 (nit):** pinned the abandoned-slot + immediate-retry
  interaction — a caller that catches `FifoLockTimeoutError` and re-queues
  while the abandoned slot is still in line runs exactly once, in order.
- **test-audit T2 (nit):** re-pinned join-outer-with-open-transaction through
  the REAL sqlite invoice-debt port in `transaction-lock-guard.test.ts` —
  `recordInvoicePayment` joins our own locked transaction across a real yield
  and commits with it; a foreign holder rejects with `FifoLockBusyError`
  (surfaced as a rejection — the port method is async); post-release success
  asserted durably.
- **D1 (deferred):** unchanged — plain sync writers still unwrapped; follow-up
  issue to be noted in the PR body.

**Re-verification at `90d7ce1`:** `pnpm typecheck` exit 0; `pnpm test:api` 64
files / 1091 tests pass (was 1088 at `ba746e5`); `pnpm lint` exit 0; fifo-lock
and integration suites each stable across 3 consecutive runs.
