# Issue #177 — Phase 4 debts: workspace query segmentation for the debts domain

**Issue:** #177 · **Tier:** Standard · **Base:** `f93c37c` (origin/develop)
**Source:** `plans/005-security-maintainability-hardening/completion-notes.md` Phase 4 (PARTIAL — "debts remains")

## Problem

Phases 3a–3c (god-object splits) are merged (PR #179); `useDemoWorkspaceQuery`
is already legacy-only. The last Phase 4 gap is the **debts domain**: its
consumers still read from the cross-domain composite snapshot
(`useCompositeWorkspaceQuery` → `buildHomeViewDerived` →
`buildDebtDerivedCollections`) instead of the narrow per-domain debts queries.
This is broken in two observable ways:

1. **Data gap** — `useCompositeWorkspaceQuery` hardcodes `debtEntries: []`
   (it never fetches debt entries). Debt ledgers on the employee/external
   detail pages are always empty in production; entries vanish on refetch.
2. **Stale invalidation** — every debts mutation invalidates the
   `debtsSummary` / `debtsDetail` workspace-domain keys, but the composite
   reads `debtAccounts` (a different key, only invalidated by non-debts
   mutations). After creating an account/entry, the hub and detail pages go
   stale until a manual refetch.

## Target (per issue Phase 4)

> Each consumer points at its narrow domain query … shrink the snapshot fetch
> to only what truly needs cross-domain data. Migration is feature-by-feature:
> `employees` → `projects` → `warehouses` → `debts` → `inventory`.

This PR completes the `debts` leg: debts consumers use `debtsSummary` +
`debtsDetail`-scoped queries; the composite stops fetching debt data.

## Design

The debts feature owns its data access in a new deep module
`apps/web/src/features/debts/debts-queries.ts` (mirrors the existing
`features/inventory/inventory-hooks.ts` and `features/debts/employee-debt-hooks.ts`
precedent). Query keys stay in `workspace-queries.ts`
(`workspaceDomainQueryKeys`) as the single source of truth so every mutation's
`invalidateWorkspaceDomains(...)` keeps working unchanged.

### 1. `apps/web/src/features/debts/debts-queries.ts` (new)

- **`useDebtsSummaryQuery({ enabled })`** — moved from `workspace-queries.ts`
  (dead code there today). Same query key
  (`workspaceDomainQueryKeys.debtsSummary(userId)`), same RPC
  (`rpcClient.debtsSummary()`).
- **`useDebtPartyDetailQuery(partyType, partyId, { enabled })`** — new.
  Query key `[...workspaceDomainQueryKeys.debtsDetail(userId), partyType, partyId]`
  (a prefix of the `debtsDetail` key every debts mutation invalidates).
  Composes `rpcClient.debtPartyDetail(...)` (accounts + party meta) with
  `rpcClient.debtEntriesList({ debtAccountId })` per account →
  `{ party, accounts, entriesByAccountId }`.
- **`buildDebtsHubRows(summary, externalCounterparties)`** — pure builder,
  behavior-preserving port of the hub rows/totals currently computed by
  `buildDebtDerivedCollections`: worker rows = summary parties of type
  INTERNAL_WORKER; external rows = **all** base counterparties enriched with
  their party summary (zero-account externals stay visible, as today);
  totals = openCount (non-zero balance) + owedToUs/owedByUs sums; rows sorted
  by |balance| desc then Arabic name. Unit-tested.
- **`buildExternalCounterpartyRows(summary, externalCounterparties)`** — pure
  builder for the externals list: base counterparty + party summary join →
  `{ id, fullName, note, phone, openCaseCount, totalBalanceDzd, totalCaseCount }`.
  Unit-tested.

### 2. `apps/web/src/features/app-shell/workspace-queries.ts`

- Remove the now-dead `useDebtsSummaryQuery` (moved to the debts feature).
- Shrink `useCompositeWorkspaceQuery`: drop `useDebtAccountsQuery` from the
  fan-out. Keep `externalCounterparties` (the shell still needs it for
  `buildHomeViewSelection` → external-details header + breadcrumb). Keep
  `debtAccounts: []` / `debtEntries: []` in the assembled snapshot only for
  `WorkspaceSnapshot` type compatibility — nothing reads them anymore.

### 3. `apps/web/src/features/app-shell/home-view-derived.ts`

- Drop the `buildDebtDerivedCollections` spread; expose
  `externalCounterparties: workspace.externalCounterparties` (raw
  `ExternalCounterparty[]` — selection/breadcrumbs only need id + fullName).
- Delete `home-view-derived-debts.ts` (no remaining consumers).

### 4. `apps/web/src/features/app-shell/home-view-page-content-detail-pages.tsx`

Wire each debts consumer to its narrow query (hooks called at component top,
gated by `enabled: page === …`):

| Route | Query | Replaces |
|---|---|---|
| `debts` (hub) | `useDebtsSummaryQuery` + `buildDebtsHubRows(summary, derived.externalCounterparties)` | `derived.debtHubRows` / `derived.debtTotals` |
| `externals` | `buildExternalCounterpartyRows(summary, derived.externalCounterparties)` | `derived.externalCounterparties` enrichment |
| `debt-create` | `externalCounterparties={derived.externalCounterparties}` (raw, matches `ExternalCounterparty[]` prop) | enriched list |
| `employee-details` (debts tab) | `useDebtPartyDetailQuery("INTERNAL_WORKER", employeeId, { enabled: tab === "debts" })` | `derived.debtAccountsByWorkerId` + `derived.debtEntriesByAccountId` |
| `external-details` | `useDebtPartyDetailQuery("EXTERNAL_COUNTERPARTY", id, { enabled: selected })` | `derived.debtAccountsByExternalCounterpartyId` + `derived.debtEntriesByAccountId` |

### 5. `apps/web/src/features/app-shell/workspace-mutations.ts`

- `useCreateExternalCounterpartyMutation` and `useCreateDebtAccountMutation`:
  add `"externalCounterparties"` to the workspace-domain invalidation list
  (the externals list + debt-create read `derived.externalCounterparties`).
  Debts mutations already invalidate `debtsSummary`/`debtsDetail` — no change
  there.

### 6. Tests

- **New unit tests** `debts-queries.test.ts` — `buildDebtsHubRows` +
  `buildExternalCounterpartyRows` (empty summary, zero-account externals,
  multi-account party, totals semantics, sorting).
- **Fixtures** `__test-utils__/workspace-fixtures.tsx` — mock
  `@/features/debts/debts-queries` (mirrors the inventory-hooks mock) so no
  existing test can hit the network if a debts page renders.
- **Playwright** `tests/e2e/debts.spec.ts` — strengthen: create external
  counterparty → open its detail page → create account with an opening
  balance → assert the ledger shows the entry and the hub reflects the
  balance (exercises the new party-detail query end-to-end).

## Risks

- **Behavior preservation of the hub rows**: the old worker rows filtered
  `roleKey === "worker"` and `caseCount > 0`; summary parties are only
  created for parties **with** accounts, and `debtPartyDetail` enforces
  worker role server-side, so `parties.filter(INTERNAL_WORKER)` is
  equivalent. Zero-account externals are preserved via the explicit join.
- **N+1 entries fetch** in `useDebtPartyDetailQuery` (one
  `debtEntriesList` per account). Acceptable for a per-party detail view; the
  alternative (server-side entries in `debtPartyDetail`) changes the RPC
  contract, out of scope.
- **Fixture coverage**: no existing test renders `debts`/`externals`/detail
  routes through `renderWorkspace`, but the new hooks must be mocked anyway
  to keep the offline test harness hermetic.

## Out of scope

- API contract changes (`debtPartyDetail` including entries).
- `inventory` leg of Phase 4 (already feature-scoped via inventory-hooks).
- Removing `useDemoWorkspaceQuery`/`workspaceSnapshot` entirely (legacy
  entry points still reference it).
