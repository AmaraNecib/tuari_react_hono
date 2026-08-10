# Debate evidence — #288 (head 05cd9ac + fixes)

**Tier:** High-assurance · **Base:** 03ec349 · **Head:** 05cd9ac (fixes on top)

## Setup

Critic + defender sub-agents ran in parallel against `git diff 03ec349...HEAD`
and the design doc `.scratch/implementation/288-design.md`.

## Critic findings → decisions

| # | Sev | Finding | Decision |
|---|-----|---------|----------|
| 1 | 8 | Shared-lock reentrancy converts silent-absorb into a permanent hang (no guard anywhere; a nested `run` deadlocks silently) | **FIXED** — `FifoLock` now throws loudly on reentrant `run` via `AsyncLocalStorage` (real async-context guard; the first boolean-flag attempt false-positived on legitimate FIFO interleaving — caught by the existing recovery-key concurrency tests — and was replaced). Current codebase has no real nesting (verified by full suite); guard is defense-in-depth. |
| 2 | 7 | Unlocked sync writers (company/invoice-debt/inventory/update-history/better-auth) can be absorbed into open async txs and silently rolled back | **DEFERRED** (out of scope) — documented in design doc + PR; follow-up issue created. Routing sync `withTransaction<T>(): T` through an async lock changes return types repo-wide. |
| 3 | 6 | `BEGIN IMMEDIATE` + no `busy_timeout` = instant SQLITE_BUSY on cross-process write overlap; "multi-process safety" claim overstated | **FIXED** — `createDatabaseConnection` sets `busy_timeout = 5000`; comment/design wording corrected to "defense-in-depth for a second process" (app is single-process today; bootstrap's deliberate BUSY propagation unchanged — its 2-connection test uses its own `timeout: 0` connections). |
| 4 | 5 | FIFO has no timeout — one never-settling op wedges all modules (blast radius grew from one module to the whole DB) | **DEFERRED** — inherent to the single-connection design; timeouts risk 500ing the legitimate ~100 ms account bcrypt tx. Tracked with #2 in the follow-up issue. |
| 5 | 4 | Bootstrap `createFirstUser` lacks the join check the other four got; its ROLLBACK is unguarded | **FIXED** — join check added (conflict path also respects nesting: no COMMIT when joined), ROLLBACK guarded. |
| 6 | 3 | Recovery-key port ROLLBACK unguarded (error masking, family inconsistency) | **FIXED** — guarded with try/catch like account/payment/invoice. |
| 7 | 3 | Unlocked payment CRUD methods are join surface (safe today only because writes are invoked solely inside `runInTransaction`) | **FIXED** — class-level doc comment pins the invariant ("writes only inside the tx; never call from an unrelated module's open transaction"). |
| 8 | 2 | Stale/misleading comments (account join-check cites bootstrap as joiner; bootstrap "never yield to another writer" predates the lock; fifo-lock "deadlock by design" weak) | **FIXED** — comments updated; bootstrap now genuinely joins (finding 5), so the account comment is accurate again. |

## Defender highlights (validated)

- One shared lock in the composition root is the correct seam (lock scope ==
  resource scope: the single connection).
- `BEGIN IMMEDIATE` with honest single-process/multi-process framing.
- Join checks retained and extended; primitive minimal and unpoisonable.
- Recovery-key routing all methods through the shared lock preserves its
  documented join-prevention guarantee connection-wide.
- Bootstrap wrap closes a genuinely unguarded BEGIN.
- Residual (sync `db.transaction()` users) acceptable: savepoints nest, no
  crash; only async tx openers hold txs across `await`s; scope discipline.

## Deferred follow-up

- **Issue created:** residual absorb of unlocked sync writers into open async
  transactions + hung-op blast radius (no lock timeout).

---
## Post-evidence delta (renamed to final HEAD c5bceee)

The debate reviewed 05cd9ac. Delta since: test-audit fix round (per-instance
reentrancy guard, capacity-boundary tests, BEGIN IMMEDIATE reservation test),
code-review comment fix (invoice constructor). No debate-class findings were
introduced by those commits; they were caught and fixed by the subsequent
test-audit and code-review passes (evidence files below).
