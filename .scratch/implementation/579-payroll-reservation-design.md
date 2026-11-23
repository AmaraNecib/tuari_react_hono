# #579 payroll outer write reservation

## Scope and authority

Worktree `D:/worktrees/tuari_react_hono/t3-dba78405-3e328e7d133b9b3c`.
Base `0616a62deea5482e411e3687681b5d4f9d9b9655`.
Mode `focused-local / CI-final-pending`. High-assurance financial correction,
not a routine-review trial task. Parent owns the fresh combined-delta review,
publication and hosted gates. No children, push, PR or merge in this lane.

The approved seam is `PayrollService.recordCash` through the real cash, source
and finance repositories on one connection/FIFO. Writable scope is the cash
transaction wrapper, its direct native tests, the caller matrix and this note.
The recovery worker owns aggregate lifecycle, service/error contracts and UI.
No schema, calculation, dependency or fallback changes are needed here.

## Finding and decision

Hosted claim: 'Payroll reserves writes too late. This wrapper starts the outer transaction with deferred BEGIN; finance nested .immediate only creates a savepoint and cannot change that outer mode. Receipt and source reads therefore happen before reserving write lock. Another connection committing between under WAL can cause SQLITE_BUSY_SNAPSHOT instead of waiting. Start payroll commands with immediate outer transaction and cover realrepositories with two-connectiontest.'

`recordCash` calls `ExactFinanceService.runAggregate`, which opens the cash
participant transaction before the finance transaction and receipt SELECT.
The cash wrapper used `runSyncTransaction`, whose default is deferred. Finance
already uses immediate transactions, but nesting cannot upgrade the outer mode.
Use the existing connection/FIFO and native `transaction(...).immediate()` in
this wrapper only. Retain async/thenable rejection and native savepoint joins.
Do not globally change `runSyncTransaction` or unrelated payroll adapters.

A write reservation means SQLite excludes another writer before command reads.
It is not a FIFO queue shared across processes. The FIFO protects ownership of
the local connection; SQLite's reservation protects the file. No money terms,
receipt identities, command fingerprinting or domain contracts change.

Architecture: no seam moved. The adapter hides native reservation/savepoint
rules behind the same transaction interface. Deleting that wrapper would move
those rules into payroll callers. Reuse the existing native immediate pattern;
no new transaction abstraction or worker production code is warranted.

## Deterministic proof

The existing file-backed plain/keyed fixture provides actual ledger DDL,
a schema-valid employee earning, UUID audit actors and real finance/payroll
repositories. A worker thread opens a separate native connection to that file,
with matching cipher/key configuration and a bounded 80 ms busy timeout.
Shared-memory command/result barriers run a complete competing immediate write
attempt while the synchronous test callback blocks. There are no timing sleeps
or event-loop-dependent IPC callbacks.

Observation hooks delegate to the real receipt/source methods. A competing
write must report SQLITE_BUSY before the receipt SELECT, after that SELECT and
after the actual source read. It must commit after rollback and after success.
The expected-red run with the unchanged wrapper instead observed `committed`
before the receipt read on both drivers. This independently detects a missing
reservation without requiring an incidental snapshot-upgrade error.

An injected cash insert failure must roll back accounts, entries, command
receipts, cash headers and allocations together. Retrying writes the worked
35000.00 earning / 25000.00 payment / 10000.00 remainder. Replaying returns the
same cash with exactly one aggregate receipt, one cash row and two entries.
Nested savepoint rollback, own-FIFO joins, foreign-FIFO rejection, thenable
rejection and outer rollback retain direct native coverage.

## Documentation and proof boundaries

`index.ts` selects `createFreshExactAppDependencies`. Its fresh schema plan
includes cash and offset slices. The caller matrix now describes that current
startup path instead of opt-in isolated tables. It does not claim current-head
CI, installed-shell, conversion or release acceptance.

Focused proof covers the cash repository, payroll service, native offset callers,
API types, scoped ESLint and diff checks. Exact commands, durations and logs stay
ignored under `.scratch/reviews/579-reservation/`. No full suite or browser run.
The first API typecheck exposed stale shared contracts output. API dependencies
were relinked to this tree's contracts package, then its own ignored dist was
built through the heavy queue. No shared dist was overwritten or package added.

Applied wisdom: immediate reservation before guards; nested native savepoint
composition; FIFO foreign-flow exclusion; real keyed native factory tests.
The single-connection concurrency lesson is insufficient for a WAL race, so
this proof deliberately uses two connections and barriers instead. Async-port
conversion guidance is not applied because these ports remain synchronous.
