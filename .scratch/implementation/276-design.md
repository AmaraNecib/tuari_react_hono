# Issue #276 — Web perf: shell fires ~14 parallel RPC calls — switch to the single `workspaceSnapshot()` RPC

## Tier

**Standard** (UI/query-layer refactor; no authz/security/financial logic).

## Base

- Target branch: `develop`
- Base SHA: `256f24a34cf77ed527177ee640e74c1039028dbb` (origin/develop @ fetch)
- Worktree branch: `refactor/issue-276-workspace-snapshot`

## Problem

`useCompositeWorkspaceQuery` (apps/web/src/features/app-shell/workspace-queries.ts)
mounts 12 individual `useQuery`s (roles, employees, projects, warehouses,
externalCounterparties, manager/project/warehouse assignments, salaryPayments,
employeeStateHistory, projectManagerOwnershipHistory,
warehouseManagerOwnershipHistory), firing ~12 parallel RPCs on every workspace
page load. A single `workspaceSnapshot()` RPC already exists (used by
`useDemoWorkspaceQuery`) and returns the exact `WorkspaceSnapshot` shape.

## Design

### 1. Composite → single snapshot query (workspace-queries.ts)

Rewrite `useCompositeWorkspaceQuery` to mount **one** query:

```ts
export function useCompositeWorkspaceQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.workspaceSnapshot,
    enabled,
    queryFn: () => rpcClient.workspaceSnapshot(),
  })
}
```

Return type is the `useQuery` result (`{ data, isPending, isError, refetch, ... }`);
the only consumers are `home-view.tsx` (`data` / `isPending` / `refetch`), so the
shape stays compatible.

Behavior notes:
- `data.debtAccounts` / `data.debtEntries` now carry **real** server data instead
  of the hard-coded `[]` the composite used to fabricate. Verified: nothing in the
  shell (derived builders, selection, breadcrumbs, page-content) reads
  `workspace.debtAccounts` / `workspace.debtEntries` — the debts feature owns that
  data via `@/features/debts/*`. No consumer change.
- The roles in the snapshot come from the server's `roleModule.list()` overlay
  (with permissions). The legacy `rbacRolesList → rolesList` client fallback in
  `useRolesQuery` was specific to the individual roles query; the snapshot RPC is
  already the deployed path (used by `useDemoWorkspaceQuery`), so no fallback is
  lost for the shell. `useRolesQuery` stays exported (still used by tests /
  mock-dashboard seam).

### 2. Snapshot key joins the key vocabulary (workspace-keys.ts)

Add a flat, user-scoped key that keeps the **existing** snapshot key shape
`["phase1", "workspace", userId]` (unchanged from `demoWorkspaceQueryKey`, so
sign-out/reset `removeQueries({ queryKey: workspaceQueryPrefix })` at
workspace-mutations.ts:187 keeps working):

```ts
workspaceSnapshot: (userId: UserId = ANONYMOUS) => ["phase1", "workspace", userId] as const,
```

`demoWorkspaceQueryKey` becomes an alias of `workspaceQueryKeys.workspaceSnapshot`
(workspace-queries.ts) — one key, no drift. `workspaceQueryPrefix`
(`["phase1", "workspace"]`) moves its source of truth to workspace-keys.ts and is
re-exported from workspace-queries.ts (same pattern as
`workspaceDomainQueryPrefix`), so existing importers
(`workspace-mutations.ts`, `mock-dashboard.ts`) are untouched.

### 3. Invalidation: refresh the snapshot when a snapshot-backed domain changes

Mutations already invalidate individual domain keys through the single seam
`invalidateWorkspaceDomains`. Since the composite no longer mounts those domain
queries, the **snapshot** must be invalidated in parallel whenever a mutation
touches a domain the snapshot covers, otherwise the shell goes stale.

Implementation: a `SNAPSHOT_BACKED_DOMAINS` set (the 12 domains the snapshot
covers) in workspace-keys.ts; `invalidateWorkspaceDomains` additionally
invalidates `workspaceQueryKeys.workspaceSnapshot(userId)` when any requested
domain is snapshot-backed, and additionally invalidates the
`["phase1","workspace"]` prefix in the unknown-userId branch (consistent with the
existing "safe over-invalidation that can never miss" contract).

This is behavior-preserving by construction: previously a mutation invalidating
`employees` refetched the composite's employeesList; now it refetches the whole
snapshot in one RPC (strictly fewer requests).

Debts mutations that also invalidate `employees`/`externalCounterparties` now
refetch the snapshot instead of those individual lists — same data freshness,
fewer RPCs.

### 4. Untouched

- The individual hooks (`useRolesQuery`, `useEmployeesQuery`, …,
  `useEmployeesPagedQuery`, `useSystemLogQuery`) stay — still used by global
  search (home-view-signed-in-shell), employees-section pagination,
  inventory/debts feature queries, and the mock-dashboard seam.
- `useDemoWorkspaceQuery` stays (aliased to the same query).
- No API/contract/server changes — `workspaceSnapshot` already exists.

## Planned tests

### Unit (vitest)

1. `workspace-queries.test.ts`
   - `useCompositeWorkspaceQuery` calls `rpcClient.workspaceSnapshot()` once and
     mounts under `["phase1", "workspace", <userId>]` (session-scoped, enabled).
   - `useCompositeWorkspaceQuery` stays disabled until the session resolves.
   - `demoWorkspaceQueryKey` === `workspaceQueryKeys.workspaceSnapshot(...)` and
     equals `["phase1", "workspace", userId]`.
2. `workspace-keys.test.ts`
   - `workspaceSnapshot` joins the flat `WorkspaceDomain` vocabulary (the pinned
     flat-factory list test updated).
   - `invalidateWorkspaceDomains` with a snapshot-backed domain also invalidates
     the snapshot key (known user).
   - Snapshot is **not** invalidated for a debts-only domain set
     (`debtsSummary`/`debtsDetail` only).
   - Unknown-userId branch also invalidates the `["phase1","workspace"]` prefix.

### Playwright E2E (tests/e2e/workspace-snapshot.spec.ts)

- Sign in via the existing `bootstrapOrSignIn` helper, then on the dashboard:
  - assert the dashboard heading renders (existing coverage style);
  - count RPC requests: exactly **one** `/rpc/workspaceSnapshot` request fired
    after sign-in;
  - assert **zero** requests to the individual list endpoints
    (`employeesList`, `projectsList`, `warehousesList`,
    `externalCounterpartiesList`, `managerAssignmentsList`,
    `projectAssignmentsList`, `warehouseAssignmentsList`,
    `salaryPaymentsList`, `employeeStateHistoryList`,
    `projectManagerOwnershipHistoryList`, `warehouseManagerOwnershipHistoryList`,
    `rbacRolesList`) while on the dashboard with search closed.

## Risks

- **Cache staleness**: if a future mutation invalidates a snapshot-backed domain
  without going through `invalidateWorkspaceDomains`, the shell could go stale.
  Mitigation: the snapshot auto-invalidation lives inside the one documented
  seam; covered by unit tests; the E2E asserts the fresh-load path.
- **Behavior delta on `debtAccounts`/`debtEntries`**: now real data instead of
  `[]`. No consumer reads them from the workspace object today (verified by
  grep); type-compatible.
- **Legacy roles fallback loss**: the shell no longer runs the
  `rbacRolesList → rolesList` client fallback. The snapshot RPC is
  server-side authoritative and already deployed; client/server ship together.
- **Extra snapshot refetch on debt mutations**: preserves prior freshness
  semantics with strictly fewer RPCs (1 vs 2-3).

## Owned paths

- `apps/web/src/features/app-shell/workspace-queries.ts`
- `apps/web/src/features/app-shell/workspace-keys.ts`
- `apps/web/src/features/app-shell/workspace-queries.test.ts`
- `apps/web/src/features/app-shell/workspace-keys.test.ts`
- `tests/e2e/workspace-snapshot.spec.ts` (new)
- `.scratch/implementation/276-design.md`
- `.scratch/reviews/276/`
