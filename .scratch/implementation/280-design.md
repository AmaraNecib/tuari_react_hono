# Issue #280 — Web perf: debounce Ctrl+K search + lazy Fuse index

**Tier:** Standard (code + UI + tests) → Guard Phase 1 → quality check → test audit → code-review → Guard Phase 2 → push + PR → CI → Greptile.

**Base:** `origin/develop @ 256f24a34cf77ed527177ee640e74c1039028dbb` (HEAD == merge-base).

## Problem (verified on develop)

`home-view-signed-in-shell.tsx`:
- `:284` — `fuse.search(searchQuery).slice(0, 20)` runs **synchronously on every keystroke** with no debounce.
- `:236-251` — the search corpus is rebuilt from 7 queries on every refetch, and `:255-281` rebuilds a new `Fuse` index on every `allSearchItems` change (even while the dialog is closed — the corpus/index memo runs unconditionally).
- `:101-102` — `useInventoryItemDefinitionsQuery()` / `useInventoryInvoiceGroupsQuery()` are **not** gated on `searchOpen` (the other 5 queries already are), so the shell eagerly fetches the full inventory + invoices just to power Ctrl+K.

## Fix

1. **Debounce the fuzzy search 175 ms** (within the issue's 150–200 ms window) via a new `useDebouncedValue` hook; `fuse.search` consumes the debounced query.
2. **Build the corpus + Fuse index lazily** — only while the dialog is open (`searchOpen` gate around the whole corpus/index/results memo).
3. **Gate inventory + invoice queries on `searchOpen`** by giving `useInventoryItemDefinitionsQuery` / `useInventoryInvoiceGroupsQuery` an `{ enabled }` option (they already route through `useWorkspaceScopedQuery`, which supports `enabled`).
4. **Reset `searchQuery` on open/close** so a reopened dialog never flashes stale debounced results.

Server-side search for large datasets: explicitly deferred (out of scope; issue lists it as "later").

## Public API / components

### New: `apps/web/src/hooks/use-debounced-value.ts`
```ts
export function useDebouncedValue<T>(value: T, delayMs: number): T
```
Returns `value` after `delayMs` of stability (standard trailing-edge debounce). Each change of `value`/`delayMs` restarts the timer; unmount clears it.

### Changed: `apps/web/src/features/inventory/inventory-hooks.ts`
- `useInventoryItemDefinitionsQuery(options?: { enabled?: boolean })`
- `useInventoryInvoiceGroupsQuery(options?: { enabled?: boolean })`
Both pass `enabled` through to `useWorkspaceScopedQuery` (default `true`, preserving all existing call sites).

### Changed: `apps/web/src/features/app-shell/home-view-signed-in-shell.tsx`
- `const debouncedSearchQuery = useDebouncedValue(searchQuery, 175)`
- One `useMemo` gated on `searchOpen` produces `{ allSearchItems, fuse, searchResults }`:
  - `searchOpen === false` → empty results, no corpus, no `Fuse` instance.
  - empty `debouncedSearchQuery.trim()` → page categories (expanded items), same as today.
  - otherwise → `fuse.search(debouncedSearchQuery).slice(0, 20)`.
- Query gating: inventory + invoices get `{ enabled: searchOpen }`.
- `setSearchQuery("")` on close and on open.

## Dependencies

None new. `fuse.js` already a dependency. Hook uses only `useState`/`useEffect`.

## Planned tests

### Unit — `apps/web/src/hooks/use-debounced-value.test.ts` (new)
- returns the initial value immediately
- does not emit the new value before the delay
- emits the new value after the delay elapses
- rapid successive changes restart the timer (only latest value emitted)
- unmount clears the pending timer (no state update after unmount)
- uses `vi.useFakeTimers()` + `renderHook` (pattern already used in the repo)

### Unit — `apps/web/src/features/app-shell/home-view.test.tsx` (extend)
- Ctrl+K / search button opens the dialog and shows page categories
- typing a query does NOT update results before the debounce window; results appear after it (fake timers)
- deleting the query restores categories immediately
- search corpus queries are `enabled: false` while closed and `enabled: true` while open (lazy fetching + lazy index observable at the seam)
- inventory/invoices query mocks receive `enabled: false` while closed (fixture tracks the option)

### E2E — `tests/e2e/search.spec.ts` (new)
- sign in → create a warehouse → open Ctrl+K search → type the warehouse name → the warehouse row appears in results → Enter navigates to the warehouse detail page
- debounce is exercised implicitly (type + wait for result)

## Implementation risks

- **Debounce lag UX**: a 175 ms trailing edge shows the previous query's results briefly. Standard search UX; mitigated by the immediate categories branch on empty query and query reset on open/close.
- **Mock surface changes**: `workspace-fixtures.tsx` mocks for `useEmployeesQuery`/`useProjectsQuery`/`useWarehousesQuery`/`useDebtAccountsQuery`/`useExternalCounterpartiesQuery` and the two inventory hooks must accept `{ enabled }` and expose an `enabled` tracker + searchable fixture data. Mock return shapes stay `{ data: { items } }`, so existing tests are unaffected.
- **Parallel worktree overlap**: #276 (workspace-snapshot) may touch `workspace-queries.ts` and possibly the shell. This change owns `home-view-signed-in-shell.tsx` (search regions), `inventory-hooks.ts`, and the new hook; it does NOT touch `workspace-queries.ts`. Rebase conflicts, if any, are resolved by the parent.

## Ownership (parallel-worktree protocol)

Owned by this agent:
- `apps/web/src/features/app-shell/home-view-signed-in-shell.tsx`
- `apps/web/src/features/inventory/inventory-hooks.ts`
- `apps/web/src/hooks/use-debounced-value.ts` (new)
- `apps/web/src/hooks/use-debounced-value.test.ts` (new)
- `apps/web/src/features/app-shell/__test-utils__/workspace-fixtures.tsx`
- `apps/web/src/features/app-shell/home-view.test.tsx`
- `tests/e2e/search.spec.ts` (new)
- `.scratch/implementation/280-design.md`, `.scratch/reviews/280/`

Forbidden (never edit): `.agents/wisdom/*`, root `package.json`, `pnpm-lock.yaml`, `tsconfig*`, `.github/workflows/*`, root `.scratch/*`.
