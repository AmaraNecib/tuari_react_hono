# 236 — Deepen the workspace data layer: one query-key seam

Part of #235 (map: ship the 2026-08-03 web-layer deepenings). Grilling decision
record — resolved with `/grilling` (issue carries `wayfinder:grilling`).

## Decision

**(a) Centralize the key factory + typed invalidation in the workspace module;
the inventory / employee-debt / debts features keep their hooks and *consume*
the factory.** Not (b) absorption: absorbing ~440 lines of inventory +
employee-debt hooks into the workspace module would create a ~900-line
god-module and fight #240's plan (mock-dashboard → domain API layer).

## Interface (the "one query-key seam")

### New module: `apps/web/src/features/app-shell/workspace-keys.ts`

Pure module — no React, no hooks; `queryClient` is an accepted dependency.

- `workspaceQueryKeys` — single key factory, one namespace
  `["phase1","workspace-domain",<domain>,<userId>]`, **every key user-scoped**.
  Replaces `workspaceDomainQueryKeys`, `inventoryKeys`, `employeeDebtKeys`.

  Flat (userId-only) entries — union is `WorkspaceDomain`:
  `employees`, `projects`, `warehouses`, `debtsSummary`, `debtsDetail`,
  `systemLog`, `roles`, `managerAssignments`, `projectAssignments`,
  `warehouseAssignments`, `salaryPayments`, `externalCounterparties`,
  `debtAccounts`, `inventoryItems`, `inventoryInvoices`,
  `inventoryOutboundTransfers`, `employeeStateHistory`,
  `projectManagerOwnership`, `warehouseManagerOwnership`.

  Parameterized entries (invalidated directly at mutation sites):
  `inventoryInvoiceGroup(userId, invoiceId)`, `inventoryAsset(userId, assetId)`,
  `inventoryLocationContents(userId, { warehouseId?, projectId? })`,
  `employeeDebtAccount(userId, employeeId)`.

  Deleted: the dead `inventory` domain (invalidated, never queried).

- `invalidateWorkspaceDomains(queryClient, userId, domains)` where
  `domains: Partial<Record<WorkspaceDomain, true>>` and `WorkspaceDomain` is
  **derived from the factory** (`Parameters<entry>["length"] extends 1`), so
  the invalidation vocabulary cannot drift from the keys. Owns the
  `userId === null → invalidate whole prefix` fallback once. Replaces both
  `invalidateAll` and `invalidateWorkspaceDomains` in workspace-mutations —
  including the untyped inventory string mirror (`["inventory", domain]`) that
  produced the stale-inventory-dropdown bug.

- `workspaceDomainQueryPrefix` moves here (re-exported for compat).

### `workspace-queries.ts` (hooks)

- `useWorkspaceScopedQuery({ key, queryFn, enabled?, ...useQueryOptions })` —
  the **one** session gate: resolves `userId` from `useSessionQuery()`, scopes
  the key, applies `enabled: Boolean(user) && (enabled ?? true)`. Every
  session-gated hook (30 gate copies today) collapses to a 3-line call.
  Param'd keys pass a closure: `key: (userId) => keys.inventoryAsset(userId, id)`.
- All hooks consume `workspaceQueryKeys` via the wrapper. Not gated (stays):
  `useAuthSetupStatusQuery` (pre-auth), `useDemoWorkspaceQuery` (mock seam,
  #240 scope).
- Deleted dead exports: workspace-side `useInventoryItemDefinitionsQuery`,
  `useInventoryInvoiceGroupsQuery` (no consumers; inventory-hooks owns those
  names).
- `workspaceQueryPrefix`, `demoWorkspaceQueryKey`, `useDemoWorkspaceQuery`
  stay (mock seam, #240 scope).

### `workspace-mutations.ts`

- `invalidateAll`/`invalidateWorkspaceDomains` → `invalidateWorkspaceDomains`
  from workspace-keys. Call sites become domains-records (e.g.
  `{ warehouses: true, employees: true, projects: true }`). Param'd-key
  invalidations use factory calls directly.
- `getCachedSessionUserId` **fixed** (pre-existing bug surfaced by this
  refactor): it read `orpc.session.key()`, which generates `[["session"], {}]`
  while the mounted session query lives at `[["session"], { type: "query" }]`
  (`queryOptions().queryKey`) — so it always returned `null`. The base
  workspace mutations masked this via the `userId === null` prefix-wide
  fallback; the typed inventory invalidations (no fallback) exposed it as a
  stale item-definitions list. Fix: read
  `orpc.session.queryOptions().queryKey` (drift-proof — same expression the
  session query mounts with). Regression-tested in
  `inventory-hooks.test.tsx`.

### Consumers

- `inventory-hooks.ts` / `employee-debt-hooks.ts`: delete local
  `inventoryKeys` / `employeeDebtKeys`; import keys from workspace-keys; each
  query hook wraps in `useWorkspaceScopedQuery` (gains the session gate);
  mutations invalidate via the typed helper / factory with resolved userId.
- `debts-queries.ts`: import `workspaceQueryKeys` from workspace-keys (1 line);
  hooks gain the wrapper.
- `mock-dashboard.ts`: 1-line re-export update (keys now from workspace-keys).

## Dependencies

- `@tanstack/react-query` (existing), `@/features/session/use-session-query`
  (existing), `@/lib/orpc-client` (existing). No new packages. Import graph:
  workspace-keys → none; workspace-queries → workspace-keys; mutations /
  inventory / debts / employee-debt → workspace-keys + workspace-queries. No
  cycles.

## Planned tests

- **Unit (new) `workspace-keys.test.ts`**: one key per endpoint (duplicates
  gone — `warehouses`/`projects`/`externalCounterparties`/`inventoryItems`/
  `inventoryInvoices` each appear exactly once); all keys user-scoped;
  param'd key shapes; `invalidateWorkspaceDomains` maps a domains-record to
  exact `invalidateQueries` calls; `userId === null` → prefix-wide; empty
  record → no-op.
- **Unit (new) wrapper tests** in `workspace-queries.test.ts`: gate composes
  `enabled`; userId-scoped key passed to `useQuery`.
- **Unit (updated)**: `workspace-mutations.test.ts` (domains-record calls),
  `debts-queries.test.ts` / `inventory-hooks.test.ts` / existing fixtures stay
  green (hook names unchanged).
- **E2E (extended)**: the fixed stale-dropdown flow — create a warehouse via
  the workspace flow, assert it appears in the inventory warehouse selector
  (previously archived/created warehouses missed the `["inventory",…]`
  invalidation). Implemented in an existing spec (`warehouses.spec.ts` or
  `inventory.spec.ts`) — behavior-preservation default; no new spec file.
  Also: `foundation-smoke.spec.ts` bootstrap now pre-seeds the user-journey
  tour before the first `page.goto` (pre-existing flake: the tour's z-50
  backdrop intercepted the settings click).

## Risks

- Cache-key churn is safe per the issue (keys are internal to React Query) as
  long as invalidation stays consistent — the typed helper makes that a
  compile-time property. The sign-out cleanup now covers inventory/employee-debt
  caches (leak fixed) — behavior change, intended.
- Inventory/debt hooks gain the session gate (queries disable until the session
  resolves) — consistent with the load-bearing workspace semantics; routes are
  auth-protected, so no user-visible regression.
- `WorkspaceDomain` derivation uses `Parameters<entry>["length"] extends 1` —
  a future flat key must keep the `(userId?)` arity; the unit test pins the
  flat-set membership.

## Coordination (shared files with #240 / #237 / #217)

- Land #236 first on develop. #236's touches to shared files are localized:
  - `mock-dashboard.ts`: 1-line re-export update (keys from workspace-keys) —
    #240 rewrites the file wholesale; trivial rebase.
  - `debts-queries.ts`: 1 import line — no other ticket touches it.
  - `workspace-queries.ts` / `workspace-mutations.ts`: key/gate wiring only.
    #240 folds `requireEntitySuccess` (untouched here), #237 adds the audit
    system-log hook (non-overlapping region), #217 edits home-view files +
    `debtEntries` line 424 (untouched here).
- #236 does NOT preempt #240 scope: no `requireEntitySuccess` fold, no
  mock-dashboard rename, no `AppMutationError` move.

## Done-when mapping

- Decision recorded: this doc. ✓
- One key namespace per endpoint; invalidation type-checked, no string-literal
  mirror: `WorkspaceDomain`-derived helper. ✓
- Every hook consumes the factory; session gate lives once: wrapper. ✓
- `pnpm typecheck && pnpm test && pnpm lint` green.
