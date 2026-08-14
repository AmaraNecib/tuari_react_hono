# Issue #322 — Sync db.transaction() writers absorbed into open async transactions

**Tier:** High-assurance (financial record integrity — invoice debts, payments,
salary records; deferred from #288's High-assurance debate).
**Base:** `develop` @ `bb144f3a3a22fe5f72904aaafa511b16a9e4dec2`
**Branch:** `refactor/issue-322`

## Problem

#288 added a connection-wide FIFO lock (`apps/api/src/infrastructure/database/fifo-lock.ts`)
serializing the five ASYNC transaction openers (account, payment, invoice,
recovery-key, bootstrap). But many writers still run through better-sqlite3's
SYNC `db.transaction()` **without** the lock:

| Site | File | Count |
|---|---|---|
| Company repo | `modules/company/adapters/sqlite-company.repository.ts` | `withTransaction` + 11 `raw.transaction()` |
| Inventory repo | `modules/inventory/adapters/sqlite-inventory.repository.ts` | `withTransaction` + `createOutboundTransfer` |
| Invoice debt port | `modules/invoice/adapters/invoice-debt.port.ts` | `createInvoiceDebt`, `recordInvoicePayment` |
| Invoice repo | `modules/invoice/adapters/invoice.repository.ts` | `create`, `update`, `delete` |
| Update history | `modules/update/adapters/sqlite-update-history.port.ts` | plain writes |
| better-auth | `infrastructure/auth/auth.ts` (drizzleAdapter) | session writes (unwrappable) |

**Mechanism:** when an async transaction is open on the shared connection and
yields to the event loop (the account bcrypt window, ~100ms), a sync writer
runs. better-sqlite3 turns its `transaction()` into a SAVEPOINT (no crash) or,
for plain writes, just joins the open transaction. If the outer transaction
ROLLBACKs, the sync writer's committed-looking data is silently rolled back
with it.

**Why #288 didn't fix it:** routing the sync `withTransaction<T>(): T` through
the promise-based lock changes the return type to `Promise<T>` and ripples
through every company/inventory service (all sync). The issue's acceptance
criteria explicitly allow a detection mechanism or a documented equivalent.

## Design

Three complementary layers (defense in depth):

### A. `FifoLock.runSync` — synchronous guarded section (the detection mechanism)

New primitive on `fifo-lock.ts`:

```ts
interface FifoLock {
  run<T>(op: () => Promise<T>): Promise<T>;
  /** Sync critical section: run now, join our own tx, or throw if another flow holds the connection. */
  runSync<T>(op: () => T): T;
}
```

Semantics, decided by an `activeCount` (incremented when a `run` operation
actually starts, decremented in `finally`) + the existing AsyncLocalStorage
reentrancy check:

1. **Inside our own `run`** (ALS store === this lock): execute directly —
   the caller owns the open transaction and the writer deliberately joins it
   (join-outer pattern used by payment/invoice module flows). No throw, no
   savepoint change.
2. **Lock held by another context** (`activeCount > 0`, not the holder): throw
   a descriptive error ("connection busy: another transaction is open").
   **This is the detection mechanism** — a loud failure instead of a silent
   absorb. Sync code cannot interleave with anything, so check+execute is
   atomic w.r.t. the event loop (no race in the free case).
3. **Lock free**: execute directly.

Nested sync transactions (company repo calls `createManagerAssignment` inside
`createEmployeesBatch`, inventory service nests `withTransaction`) remain
better-sqlite3 SAVEPOINTs — unaffected.

### B. Optional bounded wait (secondary acceptance item)

`createFifoLock({ timeoutMs })`: a queued `run` waits at most `timeoutMs` for
its turn; on timeout it rejects with a descriptive error and abandons the slot
(the operation never executes, the chain still releases). The account bcrypt
window (~100ms) is far below any sane timeout; default is unbounded (current
behavior preserved). This bounds the blast radius of a never-settling
transaction op.

### C. Route every sync transaction site through `runSync`

- **`SqliteCompanyRepository`** — private `runSyncTransaction(fn)` =
  `this.connectionLock.runSync(() => this.raw.transaction(fn)())`; applied to
  `withTransaction` + all 11 `raw.transaction()` sites. Constructor gains an
  **optional** `connectionLock` (default `createFifoLock()`), so the ~15 direct
  test constructions keep compiling; the composition root injects the shared
  instance.
- **`DrizzleInventoryRepository`** — same helper for `withTransaction` +
  `createOutboundTransfer`; `createInventoryRepository(rawDb, lock?)`.
- **`createSqliteInvoiceDebtPort`** — deps gain `lock: FifoLock`; wrap the two
  `db.transaction()` sites (`createInvoiceDebt` standalone, `recordInvoicePayment`
  nested inside the payment/invoice `runInTransaction` — the ALS check handles
  both correctly).
- **`InvoiceRepository`** — already receives `connectionLock`; wrap
  `create`/`update`/`delete` raw.transaction sites with `runSync` (they run
  standalone from `receive`/`markPaid`/module CRUD, and can also be nested).
- **`SqliteUpdateHistoryPort`** — wrap the plain INSERT in `runSync` for
  consistency (free → write; own-run → join; foreign-held → throw).
- **Payment `deletePayment`** already uses FIFO `connectionLock.run` — correct,
  unchanged.
- **better-auth session writes** — cannot be wrapped (drizzleAdapter owns the
  connection). Protection is the invariant in (D): no locked transaction is
  ever open across a real event-loop yield, so better-auth writes can never
  join one. Documented residual with rationale.

### D. Eliminate the only real await inside a locked transaction

The account phone-change flow verifies the password (bcrypt, ~100ms) INSIDE
`withTransaction` — the only locked tx that yields the event loop (bootstrap/
recovery-key/payment/invoice tx callbacks are sync db ops → microtask-only).

`AccountService.updateCurrentProfile` restructured:
1. Read the credential hash **before** the tx (new unlocked
   `findCredentialPasswordByUserId` on the `AccountRepository` interface — the
   tx-scoped variant already exists).
2. Verify the password **outside** the lock (bcrypt runs without holding the
   connection).
3. Enter `withTransaction` with the pre-verified result; the phone-uniqueness
   check stays **inside** the tx (atomic under the lock), then update + history.

Net effect: no locked tx holds the connection across a real yield → sync
writers and better-auth never run while a transaction is open (zero absorb
window, no user-visible 500s from (A)'s throw path). (A) remains as a tripwire
for future regressions (a future `await` inside a locked tx makes the next sync
writer throw loudly instead of silently corrupting).

### E. Wiring

`dependencies.ts` threads the shared `connectionLock` into
`createCompanyRepository(sharedDatabase, appConfig, connectionLock)`,
`createInventoryRepository(sharedDatabase, connectionLock)`, and
`createSqliteInvoiceDebtPort({ db, repository, lock: connectionLock })`,
plus the already-locked five async openers and
`SqliteUpdateHistoryPort(sharedDatabase, connectionLock)`.
`config/database.ts` + `company.repository.ts` factories gain optional lock
params threaded through `buildSqliteCompanyRepository`.

## Planned tests

### Unit — `fifo-lock.test.ts`
1. `runSync` executes when the lock is free.
2. `runSync` executes when called inside a `run` (own-run join, ALS).
3. `runSync` throws when another operation holds the lock (gated promise);
   queue stays usable after release.
4. `runSync` on an independent lock instance is not blocked by another lock.
5. Timeout: `createFifoLock({ timeoutMs: 20 })` — queued run rejects after
   ~20ms while holder sleeps; holder's own run unaffected; queue usable after.

### Unit — `sqlite-company.repository.test.ts`
6. `createEmployee` runs normally when the lock is free.
7. Deterministic absorb-prevention: hold a foreign `connectionLock.run` open
   with a gate, call `repo.createEmployee(...)` from outside → asserts it
   THROWS (does not silently join); after release the call succeeds.
8. Nested writes inside `withTransaction` still work (SAVEPOINT join).

### Unit — `account.service.test.ts`
9. Phone-change flow: password verify happens OUTSIDE the transaction — while
   a gated verify is pending, a sync `runSync` on the shared lock must NOT
   throw (proves the lock is not held during bcrypt); uniqueness check still
   runs inside the tx.

### Integration
10. Composition-root-level: hold the shared lock with a gated op (BEGIN
    IMMEDIATE open), then a company service mutation (sync) → throws; after
    release it succeeds.

### E2E (Playwright)
No user-facing flow changes. The bug is a concurrency race under a real await
that a deterministic E2E cannot reproduce; the acceptance criteria are met by
the detection mechanism + window elimination, pinned by the deterministic
unit/integration tests above. Decision documented in the PR.

## Risks

- **ALS own-run detection is best-effort** (documented in fifo-lock.ts): a
  sync writer reached through a promise created OUTSIDE the run's async context
  bypasses the "own-run" check and would hit the throw path. No realistic
  caller does this; the escape hatch remains the unlocked-view pattern.
- **Throw path UX**: a request colliding with an open async tx now fails loudly
  instead of silently corrupting. After (D) this path is unreachable in
  practice; it exists as the regression tripwire.
- **Signature ripple**: constructor/factory changes touch ~15 test call sites —
  mitigated by optional lock params defaulting to a fresh per-instance lock
  (harmless for sequential tests; production injects the shared instance).
- **bcrypt moved out of the tx**: semantics preserved (401/409 still thrown
  before any write; uniqueness re-checked inside the tx). The only behavioral
  difference is the atomicity window of the verify-vs-update pair, which the
  single-user desktop workload makes immaterial.
