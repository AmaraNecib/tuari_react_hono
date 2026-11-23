## Async ports over a synchronous driver lose implicit atomicity (🟠 Major)

`RecoveryKeyService` was fully synchronous (better-sqlite3). Its invariants, one-time-use (read + guarded update) and max pool 5 (count + inserts), were
enforced *by the event loop*: two calls could never interleave. Porting it to
an async `RecoveryKeyPort` (per the issue's Promise signatures) split those
flows across `await` points, so two concurrent consumers could both read
AVAILABLE and both "succeed", and two concurrent generate calls could insert 6
keys. The debate (critic) caught the first; the test audit (edge-case hunter)
empirically caught a nastier variant: a `consumeKey` write could join an open
`generateKeys` transaction on the shared connection and be *silently rolled
back* by its failure. The consumed key became AVAILABLE again.

Fix pattern (issue #195): (1) guarded check-and-set: `updateKeyStatus`
returns `Promise<boolean>` with `WHERE id = ? AND status = 'AVAILABLE'`, so a
stale writer is a 0-row no-op; (2) serialize **every** port method through a
promise-chaining FIFO lock, and give `withTransaction`'s callback an unlocked
tx-scoped view (the `AccountRepositoryTransaction` pattern) so its internal
calls don't deadlock; (3) `withTransaction` owns BEGIN IMMEDIATE/COMMIT/ROLLBACK
(better-sqlite3 transactions are sync-only, the bootstrap.service pattern),
and the lock guarantees no other port call runs inside the open transaction.

**Always**: when converting a sync service to an async port, audit every
read-modify-write and multi-statement flow for interleaving. "Same logic,
await it" is not behavior-preserving. Add the atomic primitive at the port
level (guarded CAS / serialized transaction), and pin each invariant with a
deterministic concurrency test.

