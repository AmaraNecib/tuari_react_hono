## Detail ids whose record is NOT in the composite snapshot must be forwarded explicitly through the home-view seam (💡 Design Principle)

Issue #30: `/invoices/$invoiceId` rendered an empty main after invoice create —
the router passed `invoiceId` to `HomeView`, but `HomeView` never forwarded it
to `HomeViewPageContent` (employees/projects/warehouses/counterparties flow as
`selectedX` lookups resolved from the composite workspace snapshot; invoices
are NOT in that snapshot — the details page owns its fetch via
`useInventoryInvoiceGroupQuery`). The `invoice-details` case rendered `null`
when `selectedInvoiceId` was unset, so the details view never mounted and the
`inventoryInvoiceGroupsGet` RPC never fired (Playwright trace: create RPC
200 → zero further requests).

Two-part rule:
1. For detail pages that fetch their own RPC (not in the composite snapshot),
   thread the route param id through the same home-view seam as the sibling
   lookups — the prop already exists downstream; the caller must pass it.
2. A route `case` that returns `null` when its id is missing silently renders
   an empty main. Use the `MissingRecordState` fallback (back label + target)
   every sibling detail page uses, so a broken/id-less route can never look
   like success.

