import type { DebtsSummary, InventoryInvoiceGroup, InventoryItemDefinition } from "@tuari/contracts"

/**
 * Dashboard business counters (issue #23).
 *
 * Pure aggregation over the outputs of the EXISTING feature-scoped queries
 * (debts summary, inventory invoice groups, inventory item definitions) —
 * no new query path. The snapshot-backed counterparty count lives in
 * `home-view-derived.metrics` (workspace snapshot), so it is not repeated
 * here.
 *
 * Semantics deliberately mirror the debts finance service
 * (apps/api/src/modules/company/finance.service.ts, accountOutstanding:
 * `status === "OPEN" ? currentBalance : 0`):
 *  - outstanding debt balance = Σ `currentBalance` over accounts whose
 *    `status === "OPEN"` (finance.service sums the same predicate for
 *    accountOutstanding), so settled accounts never leak into the total;
 *  - open invoices = invoice groups with `remainingDebtDzd > 0`, the same
 *    "UNPAID" partition the invoices page applies.
 */
export function buildDashboardBusinessCounters({
  debtsSummary,
  invoiceGroups,
  itemDefinitions,
}: {
  debtsSummary: DebtsSummary | undefined
  invoiceGroups: InventoryInvoiceGroup[] | undefined
  itemDefinitions: InventoryItemDefinition[] | undefined
}) {
  const outstandingDebtsDzd =
    debtsSummary?.debtAccounts.reduce(
      (sum, account) => sum + (account.status === "OPEN" ? account.currentBalance : 0),
      0,
    ) ?? 0

  const openInvoices =
    (invoiceGroups ?? []).filter((invoice) => invoice.remainingDebtDzd > 0).length

  const items = itemDefinitions?.length ?? 0

  return { openInvoices, outstandingDebtsDzd, items }
}