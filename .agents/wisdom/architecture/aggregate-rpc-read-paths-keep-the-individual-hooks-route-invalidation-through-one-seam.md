## Aggregate-RPC read paths: keep the individual hooks, route invalidation through one seam (💡 Design Principle)

#276's snapshot consolidation kept `useRolesQuery`/`useEmployeesQuery`/etc.
exported (global search, sections, debts/inventory features still use them)
and made `invalidateWorkspaceDomains` the single seam that auto-invalidates
the snapshot whenever a snapshot-backed domain changes. New domains are
covered by updating one set + a unit test pinning membership, instead of
hunting every call site.

**Always**: when introducing an aggregate read, don't delete the granular
hooks other features depend on. Keep them as the query vocabulary and add
the aggregate as a new key. Route snapshot invalidation through ONE
documented seam with a pinned-domain set so future domains can't be
forgotten.

