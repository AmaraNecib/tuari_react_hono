# Code Review — Issue #276 (workspace snapshot consolidation)

- Fixed point: `git diff 256f24a...e18bf85`
- Commits: bfe2ed7 (impl), de0ac4f (e2e hardening), e18bf85 (demo alias dedup)

## Standards axis

Standards sources: AGENTS.md (commit discipline, scratch lifecycle),
docs/engineering-workflow.md, the module's own "one query-key seam" doc
(workspace-keys.ts header: pure module, keys + invalidation centralized,
"accept dependencies, don't create them").

Findings:

1. **Duplicated Code — resolved during review.** `useCompositeWorkspaceQuery`
   and `useDemoWorkspaceQuery` initially had identical bodies after the
   consolidation; collapsed into one implementation with
   `useDemoWorkspaceQuery = useCompositeWorkspaceQuery` (e18bf85). No
   remaining duplicate logic.
2. **Middle Man — judged not a smell.** `useCompositeWorkspaceQuery` is now a
   thin wrapper over `useWorkspaceScopedQuery`, but it is the public seam
   `home-view.tsx` consumes and the `mock-dashboard`/fixture seam depends on;
   it also owns the `{ enabled = true }` default and the issue rationale doc.
   Removing it would break the shell contract for zero gain.
3. **Mysterious Name — none.** `SNAPSHOT_BACKED_DOMAINS`,
   `snapshotInvalidation`, `workspaceSnapshot` key are self-describing.
4. **Primitive Obsession / Data Clumps — none introduced.**
5. **Shotgun Surgery / Divergent Change — none.** The change is confined to
   the workspace key/query modules + tests, all one concern.
6. **Note (pre-existing, not introduced here):** the `WorkspaceDomain` mapped
   type collapses to `never` (optional tuple elements make
   `Parameters<F>["length"]` `0 | 1`, so `extends 1` is always false), which
   silently widens `invalidateWorkspaceDomains`'s domains record to `{}`.
   `SNAPSHOT_BACKED_DOMAINS` is therefore typed `ReadonlySet<string>` with a
   source comment; the membership is pinned by unit tests. Candidate for a
   follow-up issue.
7. Repo standards: no `git add -A`, explicit staging; pure-module key factory
   untouched in spirit; comments follow the existing style (Arabic copy
   untouched). Tooling (eslint/prettier/tsc) all clean.

## Spec axis

Spec source: issue #276 body + task brief ("switch the shell composite to the
single workspaceSnapshot() RPC", ~14 parallel calls → 1).

1. **Composite now mounts one query calling `rpcClient.workspaceSnapshot()`** —
   the 12 individual list queries (roles, employees, projects, warehouses,
   externals, 3× assignments, salary payments, state history, 2× ownership
   history) are gone from the shell-load path. ✅
2. **No scope creep.** The individual hooks (`useRolesQuery`,
   `useEmployeesQuery`, … `useSystemLogQuery`, `useEmployeesPagedQuery`)
   remain exported and untouched — global search, employees-section
   pagination, and the inventory/debts feature queries still need them. The
   demo query was unified with the composite only because it is the same RPC
   (removes duplicated code, does not change behavior). ✅
3. **Necessary correctness work, not creep:** mutations invalidate through
   `invalidateWorkspaceDomains`; since the composite no longer mounts the
   per-domain queries, the snapshot key must be invalidated in parallel or the
   shell would go stale. Implemented centrally inside the existing seam
   (auto-include when a snapshot-backed domain changes; prefix coverage for
   the unknown-userId branch). Behavior-preserving: previously such mutations
   refetched the individual lists; now they refetch the snapshot in one RPC. ✅
4. **Data-shape delta accepted:** `debtAccounts`/`debtEntries` now carry real
   server data instead of `[]`. No consumer reads them off the workspace
   object (grep-verified: derived builders/selection/breadcrumbs only use the
   other 12 fields); the debts feature owns its data via `@/features/debts/*`.
   ✅
5. **Legacy roles fallback:** the shell previously ran
   `rbacRolesList → rolesList` (permissions-less) as a client fallback. The
   snapshot RPC is server-side authoritative (overlays `roleModule.list()`)
   and is the already-deployed path used by the demo query; client/server ship
   together. Documented residual, not a regression. ✅

## Summary

- Standards: 0 actionable findings after the in-review dedup fix (1
  judgement-call note on the pre-existing `WorkspaceDomain` type, deferred).
- Spec: 0 actionable findings — the issue's acceptance criterion is met with
  no scope creep.
