# Items catalog pagination — design record

- Ticket: owner item 4 — items catalog (دليل العناصر) has no pagination (~10-12
  items today, hundreds expected).
- Worktree: `worktrees/feat-items-pagination`, branch `feat/items-catalog-pagination`.
- Base ref: `develop` (local), base SHA `22495413b7d792e20afcce24a94d6c84c61dd523`.
- Mode: local-only (lane; parent owns push/PR).
- Review tier: Standard.

## Problem

`apps/web/src/features/inventory/inventory-item-definitions-page.tsx` renders
`listQuery.data.items` directly into a `<Table>` with no windowing. The app
already has one pagination primitive family in `features/shared/`:

- `table-pagination-controls.tsx` — `TablePaginationControls` (page/size/range UI).
- `table-primitives.tsx` — `usePaginatedRows` (slice + page reset/clamp).

The invoices page (`inventory-invoices-page.tsx`) is the reference consumer.

## Decision: client-side pagination, reusing the shared primitives

**Do not add a paged API read. Page on the client.**

Reasons:

1. `inventoryItemDefinitionsList` is an unpaged read end to end — contract
   (`inventoryItemDefinitionListInputSchema` has only `itemType`/`isActive`
   filters), handler, `InventoryService.listItemDefinitions`, and the
   repository all return the complete array. Adding server paging means new
   contract fields, handler plumbing, service/repository `LIMIT/OFFSET`,
   response-shape change, and API tests — a wide, cross-package surface for a
   UI-only ask.
2. The same query result is consumed as a full list elsewhere:
   `home-view-page-content-detail-pages.tsx` maps `inventoryItemDefinitions`
   items into the home view's `stockItems`. Changing the endpoint to return a
   page would silently truncate the stock-item selector unless a second
   unpaged endpoint were introduced.
3. The existing convention for unpaged list endpoints is already client-side
   pagination — `inventoryInvoiceGroupsList` is unpaged and
   `inventory-invoices-page.tsx` pages it with `usePaginatedRows` +
   `TablePaginationControls`. Items follow the same path; this adds no second
   pagination UI and no new API contract.

Cost accepted: the browser still receives the full catalog. That is the
status quo for this endpoint, and it is consistent with invoices. If the
catalog later grows enough that the payload matters, the follow-up is a
separate paged endpoint (not a behavior change to this one).

## Interface / behavior changes

- `InventoryItemDefinitionsPage` gains `usePaginatedRows({ rows: items })`
  (default page size 10, matching the shared control).
- The table body maps `pagedRows` instead of `items`.
- `TablePaginationControls` renders below the table when `items.length >
  pageSize`, matching the invoices page's "only show the bar when there is
  more than one page" rule.
- No new i18n keys: the control reuses `tables.range`, `tables.rowsPerPage`,
  `tables.previous`, `tables.next`.
- No search/sort/filter on this page today, so none can be broken by paging.
  `usePaginatedRows`'s clamp-on-shrink effect still handles the derived case
  where the underlying list changes under the user (page resets/clamps).

## Tests

`apps/web/src/features/inventory/inventory-item-definitions-page.test.tsx`
(jsdom, mocked `./inventory-hooks`, seeded fixture of 34 items):

- only the first page of rows renders; range copy matches the fixture;
- Next/Previous navigate and update the visible rows;
- page-size control switches to 25 and the range/rows update;
- page clamps when the underlying list shrinks (the filter-analog path);
- empty state still renders when the list is empty (and no pagination bar).

## Risks / migration

- None to persistence or API. The change is presentational on one page.
- Tracked build artifacts must be restored to HEAD before commit.

## Verification (on this branch)

All commands run from the worktree root; `@tuari/contracts` was built first so
cross-package typecheck had its declarations.

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/web test --maxWorkers=2 inventory-item-definitions-page` | 6/6 pass |
| `pnpm --filter @tuari/web test --maxWorkers=2` | 729/730 pass; the one failure is pre-existing |
| `pnpm typecheck` | pass (4/4 packages) |
| `pnpm lint` | pass (all repo checks + turbo lint) |
| `pnpm check:unslop` | PASS |
| scoped coverage (`--coverage.include` page + control) | page 54% overall (create form paths pre-date this change); `table-pagination-controls.tsx` 100% stmts |

**Pre-existing failure waiver**: `date-picker-screens.test.tsx > TransferItemDialog
submits the picked day for a transfer (#428) > passes the canonical picked day as
occurredAt` fails with "No QueryClient set". Proven on the base by
`git stash push -u`, re-running the file, and confirming the identical failure at
base SHA `22495413`; it is unrelated to this change (the file is untouched here).

**Test-audit / code-review**: the lane brief specified the command checklist
above and prohibited hosted review; a local self-review of `git diff` covered the
edge cases (empty list, list shrink after navigation, page-size reset to page 1,
last-page Next disabled) and found no actionable issue.

