## Every new transaction-bearing method must acquire the write reservation up front: plain db.transaction() re-opens the stale-read TOCTOU (🟠 Major)

On #289, `deleteIfUnallocated` (the new atomic guarded delete) was written with
`this.db.transaction(fn)`. Better-sqlite3's DEFAULT is a DEFERRED BEGIN. The
debate critic (sev 6) caught that cross-process, a deferred BEGIN lets the
guard's existence/COUNT reads run against a pre-create snapshot; when the
concurrent create commits, the write-upgrade can succeed against the FRESH
snapshot while the COUNT was computed on the STALE one, and the subsequent
DELETE cascade-removes the fresh allocations, exactly the gap-4 corruption the
guard exists to prevent. `runInTransaction` had the fix all along
(`BEGIN IMMEDIATE`); the new method silently regressed to the vulnerable
pattern because it was modeled on the OLD `deletePayment`, not on the repo's
own transaction discipline. Fix: `transaction.immediate()`.

**Always**: when adding ANY new method that opens a transaction in this
codebase, grep the sibling transaction code first and match its write
reservation (`transaction.immediate()` / explicit `BEGIN IMMEDIATE`), never
plain `db.transaction()`. A guard's reads are only trustworthy if they run
under the reservation they protect.

