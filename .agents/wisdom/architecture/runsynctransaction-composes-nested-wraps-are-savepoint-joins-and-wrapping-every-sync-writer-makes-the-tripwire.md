## runSyncTransaction composes: nested wraps are SAVEPOINT joins, and wrapping EVERY sync writer makes the tripwire structural (💡 Design Principle)

On #348 (the D1 deferral from #322), the remaining plain sync `.run()` writers
in company/inventory/invoice were wrapped in `runSyncTransaction`. Two
composability facts made the mechanical wrap safe:

1. **Nested wraps inside an already-wrapped context are SAVEPOINTs, not
   deadlocks.** `runSync` does NOT set the AsyncLocalStorage run-context (only
   `run` does), so a nested `runSyncTransaction` inside our own `runSync`
   executes immediately via the `activeCount === 0` fallback; inside our own
   `run` it executes via the ALS match. Either way the inner
   `raw.transaction()` becomes a better-sqlite3 SAVEPOINT inside the outer
   transaction and commits/rolls back with it. This is how the invoice-debt
   port's `runSyncTransaction` calling `repository.createDebtEntry`
   (itself wrapped) keeps working, and how the payment module's
   `lock.run` flow calling `invoiceRepo.updateStatus` still joins.
2. **Wrap the private helpers too.** D1 explicitly enumerated
   `insertStateHistory`, `endActiveStateHistory`, `reassignWorkers`, and the
   ownership-history helpers even though every caller was already inside a
   wrapped public method. Wrapping them makes "every sync write runs under the
   lock" a structural property of the file, not a call-graph accident. A
   future unwrapped caller of a private helper can't silently bypass the
   tripwire.

**Always**: when closing a "route everything through X" finding, wrap every
write site in the module, including private helpers reachable only from
wrapped methods, and pin the tripwire behavior with integration tests
(busy-throw while a foreign flow holds the lock, durable success when free,
join-outer inside our own `lock.run`, and "busy attempt leaves no trace" for
multi-statement writers).

