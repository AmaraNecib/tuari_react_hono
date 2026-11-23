## E2E `page.goto` is a full reload: it wipes the React Query cache and cannot pin an invalidation seam (🟡 Minor)

On #236, an E2E asserted a created warehouse appears in the inventory transfer
selector after `page.goto("/outbound-transfers/create")`, but a full document
reload discards the in-memory cache, so the page refetches from the server and
the assertion passes even if the mutation's invalidation is completely broken.
The test still proves shared key/endpoint coupling (one source of truth), but
not the invalidation. The invalidation seam is only pinned by unit integration
tests that mount hooks over a real QueryClient (seed session → mutate →
assert the mounted query refetches).

**Always**: to pin cache-invalidation behavior, use client-side navigation in
E2E (SPA link click) or, better, a unit integration test with a real
QueryClient. A `page.goto`-based assertion should be worded as a
shared-key/single-source-of-truth check, not an invalidation check.

