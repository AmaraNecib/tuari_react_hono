# Issue #23 — Dashboard business counters (open invoices, debt balance, items, counterparties)

- **mode**: remote-ok — parent owns push/PR; lane pushes branch only
- **base SHA**: `389336a` (origin/develop @ #29/#31/#32 merges)
- **branch**: `fix/issue-23-dashboard-counters`
- **review tier**: Standard

## Problem

The dashboard stat band (`apps/web/src/features/app-shell/dashboard-section.tsx`)
shows only active workers, active projects, current warehouses, and available
roles. A busy account shows no financial/inventory totals on the day-start
summary. Add four high-value counters in the same stat-card surface:
**open invoices**, **outstanding debt balance**, **item count**,
**counterparty count**.

## Design

### Where each counter comes from (no parallel query paths)

| Counter | Source | Path |
| --- | --- | --- |
| Counterparties | `workspace.externalCounterparties` (snapshot) | extend `buildHomeViewDerived.metrics` — snapshot-backed domain, invalidated with the composite (issue #276) |
| Open invoices | `useInventoryInvoiceGroupsQuery` (existing, inventory-hooks) | invoice groups with `remainingDebtDzd > 0` (same "UNPAID" semantics as `inventory-invoices-page.tsx`) |
| Outstanding debt balance | `useDebtsSummaryQuery` (existing, debts-queries) | Σ `currentBalance` over `status === "OPEN"` accounts (same semantics as finance.service line 943) |
| Item count | `useInventoryItemDefinitionsQuery` (existing, inventory-hooks) | `items.length` |

Debt balance deliberately reads the feature-scoped `debtsSummary` query, NOT
the snapshot: the debts feature documented that debts mutations invalidate the
narrow `debtsSummary` key rather than the composite, so aggregating from the
narrow query stays fresh (debts-queries.ts header comment). Invoices/items are
not in the workspace snapshot at all — the existing inventory hooks are the
only sanctioned path.

The seam extension is limited to what the snapshot genuinely backs
(`counterparties`); the other three aggregate from the existing narrow
queries inside the lazy dashboard section, matching the pattern of
`DebtsHubPage` / `InventoryInvoicesPage`.

### Changes

1. **`apps/web/src/features/app-shell/home-view-derived.ts`**
   - `metrics` gains `counterparties: workspace.externalCounterparties.length`
   - `HomeViewDerived` type updates automatically (ReturnType).

2. **`apps/web/src/features/app-shell/dashboard-metrics.ts`** (new, pure)
   - `buildDashboardBusinessCounters({ debtsSummary, invoiceGroups, itemDefinitions })`
     → `{ openInvoices, outstandingDebtsDzd, items }`. Pure + unit-testable.

3. **`apps/web/src/features/app-shell/dashboard-section.tsx`**
   - mounts the three existing hooks (`useDebtsSummaryQuery`,
     `useInventoryInvoiceGroupsQuery`, `useInventoryItemDefinitionsQuery`)
   - `metrics` prop gains `counterparties`; `labels` gains
     `invoices`, `outstandingDebts`, `items`, `counterparties`
   - renders 8 stat cards (grid already 2×4, same visual language).

4. **`apps/web/src/features/app-shell/home-view-copy.ts`**
   - `metrics` copy type + builder gain the 4 labels, reusing EXISTING i18n
     keys (zero new strings → no parallel ar.ts edit conflicts):
     - `invoices` → `shell.invoices` (الفواتير)
     - `outstandingDebts` → `dashboardPage.outstandingDebts` (الديون المتبقية)
     - `items` → `shell.itemsGuide` (دليل العناصر)
     - `counterparties` → `sections.externals.label` (الجهات الخارجية)

5. **`apps/web/src/features/app-shell/home-view-page-content-sections.tsx`**
   - pass the 4 new labels + `derived.metrics.counterparties` into
     `DashboardSection`.

### Tests (unit/integration only — no Playwright; lane #30 owns E2E)

- `home-view-derived-composition.test.ts` — extend the `metrics` pin with
  `counterparties`; add a fixture with externalCounterparties to make it
  non-vacuous.
- `dashboard-metrics.test.ts` — open-invoice filter, OPEN-only debt sum,
  settled/zero filtering, empty-state zeros.
- `dashboard-section.test.tsx` — render 8 cards with mocked hooks/i18n;
  assert labels + values incl. formatted debt balance.

## Risks / notes

- Debt balance consumers must not drift from the debts module semantics —
  `dashboard-metrics.ts` sums only OPEN accounts, matching finance.service.
- No `ar.ts` additions (reuse only), so no merge conflicts with parallel
  i18n lanes.
- DashboardSection remains lazy → inventory/debt RPCs fire only when the
  dashboard page is shown.
- StatBand `value` accepts `string | number` — debt balance rendered with
  `د.ج` suffix like dashboard-overview.tsx.