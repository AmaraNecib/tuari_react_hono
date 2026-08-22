# Issue #30 — Details route `/invoices/:id` renders empty main after invoice create

- mode: local-only (GitHub remote unavailable; source of truth = local checkout)
- ticket #30 (pipeline crew lane), branch `fix/issue-30-invoice-details`
- base SHA: `389336a` (origin/develop @ post #29/#31/#32 merges)
- review tier: Standard

## Problem

After a successful invoice create, the app navigates to
`/invoices/$invoiceId` ("تفاصيل الفاتورة" breadcrumb renders) but the detail
view renders an EMPTY main and never issues `inventoryInvoiceGroupsGet`
(Playwright trace: create RPC 200 → zero further requests).

`InventoryInvoiceDetailsPage` is the only missing piece — the sibling detail
pages (employee/project/warehouse/external) already render via the home-view
seam; invoices do not.

## Diagnosis (root cause)

The id flows through the router correctly up to `HomeView`, then is dropped:

```
InvoiceDetailsRouteComponent (router.tsx)
  → <HomeView invoiceId={invoiceId} page="invoice-details" />        ✅
  → HomeViewPageContent …                                            ❌ invoiceId NOT forwarded
  → HomeViewPageDetailContent selectedInvoiceId={invoiceId}          (prop declared, always undefined)
  → case "invoice-details": selectedInvoiceId ? <InventoryInvoiceDetailsPage/> : null  → null
```

- `router.tsx` `InvoiceDetailsRouteComponent` passes `invoiceId` to `HomeView`. ✅
- `HomeView` (home-view.tsx) renders `<HomeViewPageContent …>` WITHOUT
  `invoiceId` — every other detail id is covered because employees/projects/
  warehouses/external counterparties live in the composite workspace snapshot
  and are resolved by `buildHomeViewSelection` into `selectedEmployee` et al.
  Invoices are NOT part of the composite snapshot (the details page fetches
  its own data via `useInventoryInvoiceGroupQuery` → `inventoryInvoiceGroupsGet`),
  so the raw `invoiceId` must be forwarded directly.
- `HomeViewPageContentProps` already declares `invoiceId?: string` and
  `HomeViewPageContent` already forwards it as `selectedInvoiceId` — the seam
  is designed to carry it; the caller just never passes it.
- `home-view-page-content-detail-pages.tsx` case `"invoice-details"` renders
  `null` when `selectedInvoiceId` is unset — unlike every sibling detail page
  which falls back to `MissingRecordState`.

## Fix (routing/home-view seam only — no parallel RPC surface)

1. `home-view.tsx`: pass `invoiceId={invoiceId}` into `<HomeViewPageContent …>`.
2. `home-view-page-content-detail-pages.tsx`: replace the `: null` fallback in
   `case "invoice-details"` with `MissingRecordState` (back to
   `workspaceRoutes.invoices()`, title "تفاصيل الفاتورة"), matching the other
   detail pages so an id-less route can never silently render an empty main.

No API changes, no new RPCs, no changes to the details page itself.

## Tests

### Unit/integration (vitest, apps/web)

Extend `__test-utils__/workspace-fixtures.tsx`:
- `renderWorkspace` gains `invoiceId?: string` (passed to `HomeView`) and
  `invoiceGroupDetail?: InventoryInvoiceGroupDetail` (fixture data).
- `useInventoryInvoiceGroupQuery` mock records the requested `invoiceId` in a
  `searchState`-style slot and returns `mockState.invoiceGroupDetail`;
  expose a `getInvoiceGroupQueryState()` accessor and a reset for it.

New tests in `home-view.test.tsx`:
- route id → mounted query + rendered invoice: with
  `page="invoice-details"` + `invoiceId="invoice-1"` + a populated
  `InventoryInvoiceGroupDetail`, assert the details UI renders (invoice
  number heading, entry item, totals, movements surface, attachments
  surface) AND that `useInventoryInvoiceGroupQuery` was requested with
  `"invoice-1"` (the exact wiring the bug broke).
- missing record / id-less route: `invoice-details` without an id shows the
  missing-record fallback and "العودة" navigates to `/invoices` (guards
  against a future empty main).

### E2E (Playwright, tests/e2e/inventory-invoice-create.spec.ts)

Extend the existing create spec's second test: after the save + navigation,
assert the details view actually renders the created invoice (proof that
`inventoryInvoiceGroupsGet` fired): the unique line-item name (`itemName`)
appears on the details page, the "العودة إلى الفواتير" action renders, and the
"سجل الحركات" section renders. Keep the DB-seam warehouse assertions. Update
the stale comment that claimed the details view cannot be asserted.

## Risks / notes

- `HomeViewPageContent` receives `invoiceId` only in the details route; other
  routes pass `undefined` and the `invoice-details` case is unreachable there.
- The `invoices` list page `onOpen` already navigates via
  `goToInvoiceDetails`; unchanged.
- Breadcrumbs are static for `invoice-details`; unchanged.
- Base SHA: fixed `389336a`; review tier: Standard (feature-implement).