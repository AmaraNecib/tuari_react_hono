## A too-broad invalidation fallback masks a broken key: the E2E suite caught it (🟠 Major)

On #236 the null-userId prefix-wide fallback in the invalidation helper masked
`getCachedSessionUserId` always returning null (see architecture.md). The
workspace flows kept working (over-invalidation); the inventory item-definitions
create flow went stale (narrow direct invalidation, no fallback) and only the
Playwright E2E suite caught it. The unit tests were green because the mock
harness set the session cache at the same (wrong) key the helper read.

**Always**: after changing cache keys or invalidation wiring, run the full E2E
suite even when all unit tests pass. A self-consistent unit mock cannot detect
a key that never matches the real mounted query. And when a helper has a
fallback path, add a direct unit test for the primary path (the #236 fix has
one: "does not resolve from bare orpc.session.key()").
