## Consolidating N queries into one snapshot RPC: every invalidation site must invalidate the snapshot too (🟠 Major)

#276 replaced the shell's ~12 individual `useQuery`s with a single
`workspaceSnapshot()` RPC. Most mutation invalidations route through
`invalidateWorkspaceDomains`, which was extended to also invalidate the
snapshot key, but `useResetWorkspaceMutation` (workspace-mutations.ts)
invalidated only `workspaceDomainQueryPrefix`, NOT the snapshot prefix, so
the dashboard stayed stale after a workspace reset. Greptile round 2 caught
it as a real P1 regression introduced by the consolidation. Fix: reset also
invalidates the snapshot prefix + a unit test pinning it.

**Always**: when replacing N parallel queries with an aggregate snapshot
RPC, audit EVERY site that invalidates any of the N keys (reset, sign-out,
sign-in, mutations), not just the obvious refetch path. The E2E "zero
individual RPCs" assertion catches over-fetching but NOT stale-cache
under-invalidation; add a reset/sign-out flow test that asserts fresh data.

