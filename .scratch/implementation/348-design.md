# Issue #348 — Plain sync writers lack a tripwire (deferred D1 from #322)

**Tier:** Standard (defense-in-depth completion of #322's High-assurance review;
financial-integrity adjacency, but no new authz/crypto/debt logic — mechanical
wrap of existing writers behind the existing tripwire primitive).
**Base:** `develop` (merge-base of `refactor/issue-348`)
**Branch:** `refactor/issue-348`

## Problem

#322 wrapped every explicit `db.transaction()` writer under
`runSyncTransaction` (the `FifoLock.runSync` tripwire) and added the
connection-wide FIFO lock. The #322 High-assurance debate finding **D1**
enumerated the remaining **plain sync `.run()` writers** in company/inventory/
invoice that never pass through `runSync`:

- **company** (`sqlite-company.repository.ts`): `createRole`, `updateRole`,
  `deleteRole`, `upsertEmployee`, `createExternalCounterparty`,
  `createDebtAccount`, `updateDebtAccount`, `createDebtEntry`,
  `voidDebtEntry`, `updateDebtEntryBalanceAfter`, `createManagerAssignment`,
  `endManagerAssignment`, `createProjectAssignment`, `endProjectAssignment`,
  `createWarehouseAssignment`, `endWarehouseAssignment`, `createSalaryPayment`,
  and the private history writers (`insertStateHistory`,
  `endActiveStateHistory`, `reassignWorkers`, and the project/warehouse
  ownership-history helpers added after #322).
- **inventory** (`sqlite-inventory.repository.ts`): `createItemDefinition`,
  `updateItemDefinition`, `createInvoiceGroup`, `updateInvoiceGroupPayment`,
  `createEntry`, `createAssetUnit`, `updateAssetUnitLocation`,
  `createConsumableBalance`, `updateConsumableBalanceQuantity`,
  `deleteConsumableBalance`, `createMovement`, `createAttachment`.
- **invoice** (`invoice.repository.ts`): `updateStatus`,
  `markReceivedWithDebtAccount`.

**Mechanism (why it matters):** a bare statement executed on the shared
better-sqlite3 connection while another flow's transaction is open does not
crash — it **joins** that transaction. If the outer transaction ROLLBACKs, the
writer's data is silently rolled back with it. Today this is unreachable
(invariant D: no locked transaction spans a real event-loop yield, verified in
#322), but it is a defense-in-depth hole: if a future `await` ever sneaks back
into a locked transaction, these writers absorb silently with **no** tripwire.
D1 disposition: "wrap the remaining plain writers with
`this.connectionLock.runSync(...)` (cheap, mechanical)".

## Design

### Decision: wrap every enumerated plain sync writer in `runSyncTransaction`

```ts
// Before (silent join possible):
this.db.insert(schema.role).values({ ... }).run();

// After (tripwire: free/own-run → execute now, foreign-held → FifoLockBusyError):
runSyncTransaction(this.connectionLock, this.raw, () => {
  this.db.insert(schema.role).values({ ... }).run();
});
```

`runSyncTransaction(lock, raw, fn)` → `lock.runSync(() => raw.transaction(fn)())`.
Semantics (already implemented and tested in `fifo-lock.ts`, issue #322):

1. **Lock free** → execute immediately (standalone transaction).
2. **Inside this lock's own `run`** (AsyncLocalStorage match) → execute
   immediately: the caller owns the open transaction and the writer
   deliberately joins it (the payment/invoice join-outer pattern — e.g.
   `invoice-debt.port.ts` calls `repository.createDebtEntry` /
   `updateDebtAccount` inside its own `runSyncTransaction`, and the payment
   module calls `invoiceRepo.updateStatus` inside `lock.run`).
3. **Inside this lock's own `runSync`** (nested wrap) → executes immediately
   via the fallback path (`activeCount === 0` while our synchronous section
   runs; sync code cannot interleave): the inner `raw.transaction()` becomes a
   SAVEPOINT inside the outer transaction — correct join.
4. **Another flow holds the lock** (`activeCount > 0`, not our own context)
   → **throw `FifoLockBusyError`** instead of silently joining. This is the
   tripwire: the write fails loudly and is debuggable.

Private helpers are wrapped too (they are in D1's enumeration), even though all
current callers are already inside a wrapped context — this makes the
"every sync writer runs under the lock" claim structural, not call-graph
dependent. Nested wraps are SAVEPOINTs inside the enclosing transaction, which
is functionally correct (verified against the existing integration tests'
join-outer cases).

### Rejected alternative: connection-level detection interceptor

The acceptance allows "a detection mechanism flags joins". A connection-level
guard (wrap `raw.prepare`/`exec`, throw when `raw.inTransaction && !ownContext`
for write statements) was considered and **rejected**:

- It touches the shared connection primitive used by every module, including
  better-auth (documented in #322 as unwrappable/residual D2) and plain SELECT
  flows — high false-positive risk that requires statement-text parsing to
  distinguish writes from reads.
- The reviewer's own recommendation (D1) was the per-site wrap; the wrap is
  one-line-per-site, behavior-preserving, and closes the hole.

The wrap satisfies the acceptance's first clause: **every sync writer in the
three modules now runs under `runSyncTransaction`.**

### Out of scope (documented residuals from #322, unchanged)

- better-auth session writes (D2) — protected only by invariant D; unwrappable.
- Payment module's `createPayment`/`createAllocation` raw inserts — always
  called inside the module's own `connectionLock.run` create flow; already
  serialized (reviewed and accepted in #322/#339).

## Changes

1. `apps/api/src/modules/company/adapters/sqlite-company.repository.ts` —
   wrap 24 write sites (17 public writers + 7 private helpers).
2. `apps/api/src/modules/inventory/adapters/sqlite-inventory.repository.ts` —
   wrap 12 writers.
3. `apps/api/src/modules/invoice/adapters/invoice.repository.ts` — wrap
   `updateStatus` and `markReceivedWithDebtAccount`.
4. `apps/api/src/tests/integration/transaction-lock-guard.test.ts` — new
   describe block: for each previously-unwrapped writer, assert it throws
   `FifoLockBusyError` while a foreign flow holds the connection, then
   succeeds and is durable once the connection is free (mirrors the existing
   #322 cases).

No changes to `fifo-lock.ts` (the primitive already covers all four cases).

## Tests

- **Unit/integration (vitest):** extend `transaction-lock-guard.test.ts` with
  tripwire cases for the issue's named writers: `createRole`, `upsertEmployee`,
  `createDebtAccount`, `createDebtEntry`, `voidDebtEntry`,
  `createManagerAssignment`, `createSalaryPayment` (company);
  `createItemDefinition`, `createInvoiceGroup` (inventory);
  `updateStatus`, `markReceivedWithDebtAccount` (invoice, async → rejection).
  Existing suites (`sqlite-company.repository.test.ts`, invoice/payment module
  tests, `invoice-payment-workflow.test.ts`) already exercise the wrapped
  writers' happy paths — they must stay green, proving the wrap is
  behavior-preserving in the free-lock and join-outer cases.
- **No new Playwright E2E:** this is an API-internal concurrency guard with no
  user-visible flow change; the E2E suites (`invoice-payment-workflow`,
  `inventory-transfer-workflow`) run the same code paths and are regression
  evidence that the wraps do not alter behavior.

## Risks

- **Nested SAVEPOINTs** from private helpers wrapped inside already-wrapped
  public methods — functionally correct; negligible overhead for the
  single-user desktop workload.
- **Join-outer regression:** a wrapped writer called from inside another
  module's open transaction must still join, not throw. Covered by the
  existing integration cases (invoice-debt port joins `lock.run`; payment
  `recordInvoicePayment` joins) plus the full module suites.
- **Behavior change:** none beyond the intended busy-throw and one positive
  side effect — multi-statement writers that previously autocommitted
  statement-by-statement are now atomic: `upsertEmployee` (employee insert +
  state history) and `reassignWorkers` (the whole reassignment loop) now
  commit or roll back as one unit. This is strictly safer (no partial
  writes) and was already the semantic of every other wrapped multi-statement
  writer.

## Acceptance

- Every sync writer enumerated in D1 runs under `runSyncTransaction` (grep
  audit: no unwrapped `this.db.insert/update/delete(...).run()` or
  `this.raw.prepare(...).run()` remains in the three modules).
- Tripwire tests pass for the named writers; full suite green.
