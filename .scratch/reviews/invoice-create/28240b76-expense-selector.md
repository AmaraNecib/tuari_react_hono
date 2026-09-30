# Expense selector — active-only usage seam (PR #463, parent-directed)

Final code SHA: `28240b7689cb4c37bfede999c7bdace5bfdc190f`
Base: `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`

## The defect

`home-view-page-content-detail-pages.tsx` mapped the UNPAGED
`inventoryItemDefinitionsList` straight to the expense dialog's `stockItems`
options with no `isActive` filter, so the dialog offered ARCHIVED definitions.
The design pass called this a papercut and claimed the rule was already "any
active definition"; it was not.

## The fix

- `ExpenseFormDialog` now renders the shared `ItemOptionPicker` with
  `usage={{ surface: "STOCK_REFERENCE" }}` — kind-agnostic, active-only, paged,
  with the search input and load-more affordance. No kind control is needed
  because that usage admits both kinds.
- `useInventoryItemDefinitionQuery(id)` resolves an edit's stored `stockItemId`
  back to a definition so the current selection (including an archived one)
  still renders; this is the real id-only hydration caller the earlier
  design-pass note anticipated. The invoice row still holds its option and does
  not use it.
- `ItemOptionPicker` gained an optional `emptyLabel` so the optional expense
  reference keeps its "بدون" clear option.
- `ExpensesPage` no longer takes a `stockItems` prop, and the home-view detail
  page no longer reads the unpaged list for expenses.

## Tests

- `expense-form-dialog.test.tsx`: the picker is fed by STOCK_REFERENCE (both
  kinds offered, the archived fixture absent); an archived reference still
  displays when editing. Red-proved by swapping the usage to
  `INVOICE_LINE/ASSET` — the wiring assertion fails.
- The server-side active-only exclusion is pinned by the API equivalence test
  (`STOCK_REFERENCE` excludes both archived fixtures) and the contract test.
- Full web suite 851 passed; full E2E 69 passed; API touched suites 524 passed;
  typecheck and lint green.

## Remaining unpaged consumers (reported, not expanded)

- **`outbound-transfer-create-page.tsx` — SELECTION purpose.** It reads
  `useInventoryItemDefinitionsQuery()` and feeds `itemDefinitions` into
  `ItemListEditor` to choose items for an outbound transfer. This is the same
  class of defect as the expense selector and is NOT fixed here; reported to the
  parent per instruction.
- `inventory-item-definitions-page.tsx` — the catalog page; archived rows are
  shown deliberately with a status column. Not a selection.
- `dashboard-section.tsx` — a count of definitions. Not a selection.
- `home-view-signed-in-shell.tsx` — the Ctrl+K global search corpus. Search
  results, not a form selection; archived names surfacing in search is arguably
  correct (the catalog lists them). Reported for awareness.
