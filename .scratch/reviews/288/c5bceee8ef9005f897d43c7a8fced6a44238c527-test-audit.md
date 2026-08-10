# Test-audit evidence — #288 (head 4f48282 + test-audit fixes)

**Tier:** High-assurance · **Base:** 03ec349 · **Head:** 4f48282 (fixes on top)

## Setup

Three sub-agents (edge-case hunter, coverage analyst, quality reviewer) ran in
parallel against the new test files + sources.

## Verdict

Quality grade **A** (deterministic, isolated, well-named, meaningful
assertions, real regression pins). All 4 acceptance criteria have purpose-built
tests. No blockers. 16 → 23 tests after fixes.

## Findings → decisions

| # | Sev | Finding | Decision |
|---|-----|---------|----------|
| 1 | 🟡 | Sync-throw operation + queued follower unpinned in fifo-lock tests | **FIXED** — added "keeps the queue alive when an operation throws synchronously". |
| 2 | 🟠 | Never-resolving op wedges all modules (no watchdog) | **DEFERRED** — inherent to single-connection design; timeouts risk 500ing the ~100 ms account bcrypt tx. Tracked in #322. |
| 3 | 🟠 | ALS guard bypassable via promise created outside the run context | **DOCUMENTED** in fifo-lock docstring as a best-effort guard (no realistic caller does this; the unlocked-view pattern is the escape hatch). |
| 4 | 🟡 | Module-level ALS store false-positives across INDEPENDENT lock instances | **FIXED** — guard now stores the lock INSTANCE (per-lock check); added test "does not flag independent lock instances as reentrant". |
| 5 | 🟠 | Swallowed ROLLBACK failure → next tx joins the un-rolled-back tx | **DISMISSED** — pre-existing accepted pattern (the #249 lesson: guard ROLLBACK so a failing COMMIT surfaces the original error; a closed connection is the only realistic trigger and the next tx would fail anyway). |
| 6 | 🟠 | Join-surface race (tx opened outside the lock absorbs a concurrent tx) | **DISMISSED** — by design: every real transaction opener holds the connection lock; only test harnesses open BEGINs behind its back. Documented. |
| 7 | 🟡 | Callback that COMMITs internally → repo's final COMMIT throws | **DISMISSED** — caller misuse of the API contract; not a guard-worthy path. |
| 8 | 🟡 | `deletePayment` on missing id untested | **FIXED** — added no-op test. |
| 9+15 | 🟠 | Equal-capacity boundary (2500+2500 vs 5000) + PAID transition never asserted | **FIXED** — added "lets equal-capacity payments both succeed exactly at the boundary" (asserts both fulfill, remaining 0, status PAID). |
| 10 | 🟠 | Capacity-1 boundary untested | **FIXED** — added "capacity of one: concurrent unit payments allocate exactly once". Loser is rejected with `PaymentInvoiceNotReceivedError` (winner transitions the invoice to PAID — the deterministic, correct rejection). |
| 11 | 🟠 | Decimal float dust in remaining_amount | **VERIFIED NON-ISSUE for the proposed case** — `99.99 − 3×33.33` lands exactly on 0 in JS; dust can occur for other values (pre-existing, not transaction-model). Noted in #322. |
| 12 | 🟠 | Negative allocations pass the module's sum check | **VERIFIED COVERED UPSTREAM** — wire contract uses `z.number().positive()` on amounts. Service-boundary defense-in-depth noted in #322. |
| 13 | 🟠 | BEGIN IMMEDIATE cross-process write reservation unpinned (test comment overstated it) | **FIXED** — added two-connection file-DB test ("BEGIN IMMEDIATE holds the SQLite write reservation against a second connection", `timeout: 0` connections like the bootstrap test); exact-cap test comment corrected to attribute in-process serialization to the lock. |
| 14 | 🟡 | Cross-module only the account-ABORT path pinned | **FIXED** — added "queues a payment transaction behind a COMMITTING account transaction". |
| Q2 | 🟡 | Setup duplication (4× inline createPayment literal, 2× invoice INSERT) | **FIXED** — extracted `paymentInput()` helper in the adapter suite (module suite already had one). |

## Coverage analysis summary

- Criterion 1 (connection-wide serialization): SATISFIED — cross-module pin
  (account tx open across await, abort/commit variants), same-repo serialization.
- Criterion 2 (BEGIN IMMEDIATE + exact-cap): SATISFIED — exact-cap
  `Promise.allSettled` invariant + separate two-connection reservation test.
- Criterion 3 (rollback/busy/join): SATISFIED — rollback, outer-owns-rollback,
  join, lock-release-after-failure, serialization, plus the SQLITE_BUSY
  reservation test.
- Criterion 4 (shared primitive): SATISFIED — fifo-lock unit tests pin FIFO,
  release-after-rejection, error isolation, sync-throw, reentrancy guard,
  per-instance independence.

## Residuals (tracked in #322)

Float dust in remaining_amount (other decimal values), negative-allocation
service-boundary validation, hung-op watchdog, swallowed-ROLLBACK semantics.

---
## Post-evidence delta (renamed to final HEAD c5bceee)

The test-audit reviewed 4f48282 + fixes. Delta since: code-review comment fix
(invoice constructor, cosmetic). Test-audit findings unaffected.
