## Deterministic concurrency tests for single-connection ports (🟡 Minor)

Concurrency tests over better-sqlite3 are deterministic, not flaky, because
the driver is one synchronous connection: the FIFO-locked port serializes
flows, so the *outcome* is invariant under any microtask interleaving (only
*which* caller wins varies). Pattern used for RecoveryKeyPort (#195):
`Promise.all([consume, consume])` then assert `results.filter(Boolean)` length
=== 1; `Promise.allSettled([0,1,2].map(() => generateKeys()))` then assert the
pool is exactly the cap. These tests fail against an unguarded port, so they
pin the invariant, not an implementation detail.

Also: when a test-audit hunter needs to prove a rollback/leak, inject failure
with a wrapper port or a throwing `withTransaction` callback (gated test).
Don't rely on timing. And `allSettled` + exact-assertion beats `≤ bound`:
it catches both overshoot *and* under-production.

**Always**: assert the invariant (exactly one winner, exact cap), not a bound;
use `Promise.allSettled` so a rejected branch is visible as a failed assertion
instead of an unhandled rejection.

