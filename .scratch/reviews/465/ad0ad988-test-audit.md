# Test audit — `ad0ad988` (the stale-stock invalidation fix)

Focused audit of the tests added by this diff. The change is one invalidation
helper plus four call sites; the risk is a missing or mis-keyed invalidation,
which only a mounted-query integration test can catch (a `page.goto` E2E reload
would wipe the cache and pass regardless — see `.agents/wisdom/testing.md`).

## Coverage of the changed behavior

| Stock-changing mutation | Test case | Sequence pinned |
| --- | --- | --- |
| consumable transfer | "refreshes the picker after a consumable transfer into the source" | empty → transfer into `wh-1` → item offered |
| asset transfer | "refreshes the picker after an asset transfer between locations" | empty → unit moved to `wh-1` → item offered |
| outbound transfer | "refreshes the picker after an outbound transfer consumes stock" | empty → outbound from `wh-1` → item offered |
| invoice create (receipt) | "refreshes the picker after a purchase receipts stock at the source" | empty → receipt at `wh-1` → item offered |

Each case asserts `mocks.options` is called twice, so an accidental extra
refetch of the same query would also be visible, and the read must show the new
item — not merely refetch.

## Meaningful assertions / edge cases

- **Stale-window realism:** the real `QueryClient` uses `staleTime: 30_000`, the
  app's value, so a pass means invalidation, not `staleTime: 0`.
- **Primary path:** the session cache is seeded at
  `orpc.session.queryOptions().queryKey` with `user-1`, so the mutation resolves
  the same userId the mounted read keyed on. A test that relied on the
  null-userId prefix-wide fallback would pass even with a broken narrow key; this
  one does not.
- **All four mutations:** a regression that drops the helper from any one of the
  four fails a named test, not a single shared assertion.

## Gaps (accepted for this diff)

- No E2E test. The behavior is cache-internal; an E2E would need client-side
  navigation to avoid the `page.goto` cache wipe. The existing outbound page
  test already pins the read/rule seam; this diff only changes who invalidates
  the read.
- The test does not cover the `userId === null` fallback; that path is already
  covered by the item-definitions create suite ("still refreshes the list when
  the mutation runs before the session cache resolves").
- No test asserts that a stock change in warehouse B refreshes warehouse A's
  cached page more broadly than necessary; over-fetch is accepted (see the
  code review), so excluding it is intentional.

No shallow/tautological assertions found. The four new tests fail on the
pre-fix production file (4 failed / 9 passed) and pass after it (13 passed).
