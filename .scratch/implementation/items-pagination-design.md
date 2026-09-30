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
- `TablePaginationControls` renders whenever `items.length > 0` (see the
  review note below on the page-size trap), matching the
  `warehouses-section.tsx` consumers that keep the bar visible on a single
  page. The empty state still hides it.
- After a successful create, an effect follows the new row to the page it
  lands on. The catalog is ordered by `name`, so the created row can insert on
  any page; without this the operator stays on an unchanged page and the only
  evidence the create worked is the toast.
- No new i18n keys: the control reuses `tables.range`, `tables.rowsPerPage`,
  `tables.previous`, `tables.next`.
- No search/sort/filter on this page today, so none can be broken by paging.
  `usePaginatedRows`'s clamp-on-shrink effect still handles the derived case
  where the underlying list changes under the user.

## Tests

`apps/web/src/features/inventory/inventory-item-definitions-page.test.tsx`
(jsdom, mocked `./inventory-hooks`, seeded fixture of 34 items):

- only the first page of rows renders; exact row count (header + 10) and the
  range copy match the fixture;
- Next/Previous navigate and update the visible rows;
- page-size control switches to 25 and the range/rows update;
- page-size control stays reachable when the chosen size collapses the list to
  one page (the review F1 fix);
- the bar renders with disabled navigation at exactly one page (10 items);
- page clamps when the underlying list shrinks to a later page (34 → 12);
- page clamps to page 1 when the list shrinks below one page (34 → 3);
- a created definition that sorts to the top of page 1 is followed there after
  the refetch (the review F2 fix);
- empty state still renders when the list is empty (and no pagination bar).

F1 and F2 tests were verified to fail on the pre-fix production file (10/10
pass with the fix; 4 fail with only the production file reverted).

## Risks / migration

- None to persistence or API. The change is presentational on one page.
- Tracked build artifacts must be restored to HEAD before commit.

## Verification (on this branch)

All commands run from the worktree root; `@tuari/contracts` was built first so
cross-package typecheck had its declarations.

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/web test --maxWorkers=2 inventory-item-definitions-page` | 10/10 pass |
| `pnpm --filter @tuari/web test --maxWorkers=2` | full suite; see `.scratch/reviews/442/` |
| `pnpm typecheck` | pass (4/4 packages) |
| `pnpm lint` | pass (all repo checks + turbo lint) |
| `pnpm check:unslop` | PASS |
| scoped coverage (`--coverage.include` page + control) | page + control; see report |

**Pre-existing failure waiver**: `date-picker-screens.test.tsx > TransferItemDialog
submits the picked day for a transfer (#428) > passes the canonical picked day as
occurredAt` fails with "No QueryClient set". Proven on the base by
`git stash push -u`, re-running the file, and confirming the identical failure at
base SHA `22495413`; it is unrelated to this change (the file is untouched here).

## Review findings (aggressive local review, PR #442)

Full reports: `.scratch/reviews/442/<HEAD>-debate.md`,
`<HEAD>-code-review.md`, `<HEAD>-test-audit.md`.

| # | Finding | Severity | Verdict |
| --- | --- | --- | --- |
| F1 | `items.length > pageSize` gate hid the whole control, so picking 50 (with 34 items) stranded the operator at 50 rows/page with no way back | Major | **Fixed** (gate now `items.length > 0`); test fails pre-fix |
| F2 | A created definition inserts in name order, so it could land off-page; the operator saw an unchanged page and only a toast as proof | Major | **Fixed** (follow the new row to its page); test fails pre-fix |
| F3 | `usePaginatedRows` clamps in a `useEffect`, so a cross-page shrink paints one empty control-less frame | Minor | **Filed** (shared-hook paint timing; parent decision) |
| F4 | No `resetPageDeps`; a future filter would land on the clamped last page instead of page 1 | Minor | **Dismissed** — filtering would happen before `rows` reaches the hook; no filter exists (critic score 2/10) |
| F5 | Page-size `NativeSelect` has no `aria-label` | Minor | **Filed** — shared control, pre-existing, not introduced here |
| F6 | Test isolation used `clearAllMocks` (kept implementations across tests) | Minor | **Fixed** (`resetAllMocks` + seed in `beforeEach`) |
| F7 | Bar-gate boundary at exactly `pageSize` untested | Minor | **Fixed** (exactly-one-page test) |
| F8 | Shrink below one page untested | Minor | **Fixed** (34 → 3 test) |
| F9 | No exact rendered-row-count assertion | Minor | **Fixed** (header + 10 rows) |
| F10 | Loading/`isError` renders the empty state | Minor | **Filed** — pre-existing (`data?.items ?? []` unchanged by this PR), repo-wide convention |
| F11 | Duplicated `onPageSizeChange` reset closure across consumers | Minor | **Dismissed** — matches the reference consumer; the architecture standard governs the primitives, not the closure |
| F12 | Design-doc filename has no issue id | Cosmetic | **Dismissed** — local owner item has no issue number |

Client-side paging and reuse of the shared pair were both endorsed (no fork, no
new keys, honest trade-off); the only wrong-row/data-loss class found was F2.

