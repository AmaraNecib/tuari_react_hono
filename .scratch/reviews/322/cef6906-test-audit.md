# Issue #322 — Test Audit Evidence

**Issue:** #322 — API: unlocked sync db.transaction() writers can be absorbed into open async transactions
**Tier:** High-assurance
**Base:** `bb144f3a` — **Head:** `cef6906` (audit ran on `cef6906`; findings applied in the following commit)

## Process

Three parallel sub-agents (edge-case hunter, coverage analyst, quality reviewer)
over the four changed test files + the changed source + the design doc.

## Verdict

**No blockers. No red (would-break) findings.** All issue "Done when" clauses
have at least one deterministic test:
- (a) detection mechanism / writers under the lock — primitive, adapter, and
  service-layer tests (fifo-lock runSync modes, company guard, integration).
- (b) absorb window eliminated — account real-repo lock-window test.
- (c) timeout bound — fifo-lock timeout tests + composition-root wiring.

Grades: fifo-lock A, company A−, account B+ (→ improved), integration B.

## Findings applied (this commit)

| # | Source | Finding | Fix |
|---|---|---|---|
| 1 | Hunter | Precedence inversion (runSync jumps queued-but-unstarted run) documented but unpinned | Added pinning test `runSync runs ahead of a queued-but-unstarted run`. |
| 2 | Hunter | Busy-throw tests never assert zero writes after the throw | Company test now asserts `COUNT(*) FROM employee === 0` after `FifoLockBusyError`. |
| 3 | Hunter | Own-run join only tested synchronously; production join-outer crosses an await | Added `runSync still joins our own run across an await hop` (ALS propagation after a real yield). |
| 5 | Hunter | Multi-timeout abandonment + never-executes + FIFO-after not tested | Added `timed-out operations never execute; multiple abandoned slots keep the queue FIFO`. |
| 8 | Hunter | Timeout rejects with generic Error (undistinguishable from fatal) | Added `FifoLockTimeoutError`; tests assert it. |
| 11/12 | Hunter/Quality | `rawDb.close()` inline (leak on failure); name-only path never asserts bcrypt skipped | Moved DB lifecycle to `beforeEach`/`afterEach`; added `skips the bcrypt verify entirely for name-only updates`. |
| — | Quality | Duplicate fifo-lock "queue alive after throwing" tests | Merged into one. |

## Residuals documented (not fixed)

- **Coverage (medium)**: guard path exercised under a held foreign lock only on
  the company adapter; inventory/invoice/debt adapters route through the same
  shared `runSyncTransaction` util and are covered by their existing module
  tests (including the join-outer path). A per-adapter wiring test for each
  was judged repetitive given the single shared util.
- **Coverage (low)**: composition-root lock sharing not asserted (the lock is
  deliberately not exposed on `AppDependencies`); verified by review.
- Uniqueness-inside-tx is proven only via the mock-based 409 test — the real
  transaction section is synchronous (no yield), so it is unobservable from
  outside by design (that is the point of the fix).
- better-auth writes remain unwrappable; protected by invariant (D) — no test,
  documented residual.
- No Playwright E2E — deliberate (the race is not deterministically
  reproducible via a browser; covered by deterministic unit/integration tests).
