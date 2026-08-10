# #288 — Harden shared-connection transaction model (design)

**Tier:** High-assurance (payment capacity allocation is financial; transaction
integrity on the shared connection).

**Base:** `03ec349643901a2802338d8e19b730b28e5eb841` (origin/develop @ 03ec349).

## Problem

The API runs every module on ONE better-sqlite3 connection, but each module
owns its own FIFO lock — so the *BEGIN* of one module's transaction is not
serialized against another's:

1. **Cross-module lock independence** — `DrizzleAccountRepository.withTransaction`
   (`BEGIN IMMEDIATE`), `PaymentRepositoryImpl.runInTransaction` (deferred
   `BEGIN`), `SqliteRecoveryKeyPort.withTransaction` (`BEGIN IMMEDIATE`),
   `InvoiceRepository.runInTransaction` (deferred `BEGIN`), and
   `SqliteBootstrapPort.createFirstUser` (`BEGIN IMMEDIATE`, **no lock at all**)
   all open transactions on the shared connection behind *per-module* locks.
   The account tx holds `BEGIN IMMEDIATE` open across a slow `password.verify`
   (bcrypt). A concurrent payment `runInTransaction` in that window hits
   `cannot start a transaction within a transaction` (better-sqlite3 throws on
   a raw `exec("BEGIN")` while `inTransaction`) → spurious 500. Conversely a
   payment tx can absorb another module's write through the `raw.inTransaction`
   join path and roll it back silently.
2. **Deferred `BEGIN` in payment/invoice adapters** — validation reads
   (invoice capacity) run without the SQLite write reservation, then the
   transaction upgrades at first write. On a multi-process host (or if the
   per-module serialization ever regresses) two payments could validate a stale
   `remaining_amount` then serialize → double allocation.
3. **Payment sqlite adapter has zero tests** (`payment/adapters/payment.repository.ts`,
   excluded from the `**/adapters/**` coverage policy, exercised nowhere —
   module tests use the in-memory adapter). Financially-adjacent tx code.
4. **Hand-rolled FIFO locks** — the same promise-chain mutex is copy-pasted in
   account repo, recovery-key port, payment adapter **and** invoice adapter
   (4 copies), with subtle divergence (deferred vs `BEGIN IMMEDIATE`, join
   check present/absent, bootstrap has none).

## Fix

### 1. Shared FIFO primitive — `infrastructure/database/fifo-lock.ts`

```ts
export interface FifoLock {
  run<T>(operation: () => Promise<T>): Promise<T>;
}
export function createFifoLock(): FifoLock;
```

Promise-chain FIFO mutex extracted from the existing copies: each `run` chains
onto the previous tail, releases in `finally` (so a rejecting operation never
poisons the chain). This is the canonical pattern already proven in
`sqlite-recovery-key.port.ts` / `account.repository.ts`.

**Loudly non-reentrant** (debate finding 8): a nested `run` called while an
operation is executing throws immediately instead of deadlocking — a nested
`run` that is awaited would wait on a tail that can only resolve after the
outer operation finishes, i.e. a permanent hang blocking every transaction
app-wide. Components that need transaction-scoped callbacks hand out an
unlocked view (recovery-key `unlocked()`) rather than nesting `run`.

### 2. One connection-wide lock in the composition root

`dependencies.ts` creates **one** `connectionLock = createFifoLock()` and
injects it into every component that opens a transaction on the shared
connection. Each holds the lock for the **whole** transaction lifecycle
(`BEGIN` → callback → `COMMIT`/`ROLLBACK`), so at most one transaction can be
open on the connection at any time. No cross-module `BEGIN` collisions.

Constructor changes (lock becomes a required param — the same connection-wide
instance in production; tests pass their own per-connection instance):

| Class | Signature | Sites to update |
|---|---|---|
| `DrizzleAccountRepository` | `(db, lock)` | `dependencies.ts`, `account.repository.test.ts` |
| `PaymentRepositoryImpl` | `(db, lock)` | `dependencies.ts` |
| `InvoiceRepository` | `(rawDb, drizzleDb, lock)` | `dependencies.ts`, `invoice.module.test.ts` |
| `SqliteRecoveryKeyPort` | `(db, raw, lock)` | `dependencies.ts`, `auth/test-helpers/recovery-key-env.ts` |
| `SqliteBootstrapPort` | `(db, raw, lock)` | `dependencies.ts`, `sqlite-bootstrap.port.test.ts` (×3) |

Each module's hand-rolled lock (`lockTail`/`serialized`/`transactionChain`) is
deleted and replaced by `this.connectionLock.run(...)`. The recovery-key port
routes **all** public methods through the shared lock (preserving its
documented "no port call joins an open transaction" guarantee, now
connection-wide). Bootstrap wraps only `createFirstUser` (its reads stay
unlocked).

The existing `raw.inTransaction` **join check stays** in account/recovery-key
(and is added to payment/invoice `runInTransaction` for family consistency):
an externally-opened transaction (test, future bypass) is joined — the outer
flow owns `COMMIT`/`ROLLBACK`. With the connection lock this can only fire for
transactions opened behind the lock's back; tests pin both behaviors.

### 3. `BEGIN IMMEDIATE` everywhere

Payment and invoice `runInTransaction` switch from deferred `BEGIN` to
`BEGIN IMMEDIATE`: the write reservation is acquired at `BEGIN`, so the
capacity-validation reads are protected from the start. On the single
in-process connection the FIFO lock already serializes; `BEGIN IMMEDIATE` is
defense-in-depth for a second process touching the same file (write lock held
from BEGIN). `deletePayment`'s sync `db.transaction()` runs under the
connection lock too.

Also (debate findings 4/6/3): `SqliteBootstrapPort.createFirstUser` gains the
family join check (join an externally-opened transaction instead of
BEGINning a second one) and guards its `ROLLBACK`; the recovery-key port's
`ROLLBACK` is guarded too. `createDatabaseConnection` sets
`busy_timeout = 5000` so a genuinely-contended write lock (second process)
waits rather than surfacing an instant `SQLITE_BUSY` as a spurious 500.

### 4. Known residuals (documented, out of scope)

- **Unlocked sync writers can be absorbed into an open async transaction.**
  `company` / `inventory` / `invoice` adapters use sync `db.transaction()` in
  many places (better-sqlite3 nests these as **savepoints** inside an open
  transaction — no crash, but the writes JOIN the open transaction and are
  silently rolled back if it fails). Routing all of them through the
  connection lock would change every sync `withTransaction<T>(): T` to
  `Promise<T>` and ripple through all company services — a separate refactor.
  The five async transaction openers (this issue's scope) are the ones that
  hold transactions open across `await`s. Tracked as a follow-up issue.
- **A never-settling transaction op blocks all transactions app-wide** (no
  timeout on the primitive). Inherent to the single-connection design; the
  reentrancy guard catches programming errors; timeouts on transactions are
  deliberately avoided (the account bcrypt window legitimately takes ~100 ms).
  Tracked with the absorb residual.

## Tests

**Unit — the primitive** (`infrastructure/database/fifo-lock.test.ts`):
- FIFO ordering (second queued op does not start until first finishes)
- lock released after a rejecting operation (chain stays usable)
- exact serialization invariant (no interleaving of ops)

**Unit — payment sqlite adapter** (`payment/adapters/payment.repository.test.ts`,
real `:memory:` connection + `schemaStatements`):
- commit on success (payment + allocation visible after)
- rollback on failure (no partial rows)
- **join**: external `BEGIN IMMEDIATE` → `runInTransaction` joins; outer
  `COMMIT` persists the writes, outer `ROLLBACK` undoes them
- **busy**: while another raw transaction is open *behind the lock's back*,
  a second `exec("BEGIN")` on the same connection must surface a clear error,
  never silently corrupt
- concurrent `runInTransaction` serialization (both succeed, deterministic)
- `deletePayment` removes payment + allocations atomically
- CRUD round-trip (create/findPaged/findAllocations)

**Unit — cross-module serialization** (same file or
`payment/adapters/payment.repository.test.ts` + account repo sharing ONE lock):
- account `withTransaction` held open across an `await` + concurrent payment
  `runInTransaction` → payment queues and succeeds after commit; **no**
  "cannot start a transaction within a transaction" (this FAILS against the
  old per-module locks — the gap-1 regression pin)

**Integration — exact-cap allocation** (`payment/payment.module.sqlite.test.ts`:
real sqlite `PaymentRepositoryImpl` + in-memory invoice repo/debt port):
- concurrent `paymentModule.create` against a shared 5000-capacity invoice →
  exactly one succeeds, one rejects with `PaymentInvoiceOverAllocationError`,
  final `remaining_amount` is exact (no double allocation)
- mid-flow failure (second invoice over-allocated) rolls back ALL writes:
  no payment row, no allocation row, invoice untouched

**Existing suites kept green**: account repo join/rollback/lock-release tests,
recovery-key port tests, bootstrap port tests (incl. the 2-connection
`SQLITE_BUSY` test — its own connections use `timeout: 0`, unaffected by the
factory `busy_timeout`), invoice `runInTransaction` serialization test.

**Primitive tests**: FIFO ordering, release-after-rejection, error isolation,
reentrancy guard (debate finding 8).

## Risks

- Constructor signature changes ripple to 5 test/helper files (mechanical).
- Holding the connection lock across a slow account tx (bcrypt ~100 ms)
  delays other modules' transactions instead of failing them — the intended
  tradeoff (previously a spurious 500; now a short queue).
- `BEGIN IMMEDIATE` takes the SQLite write reservation earlier — on a single
  connection under the FIFO lock this changes nothing observable; it is the
  multi-process safety guarantee.
