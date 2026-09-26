import { useTranslation } from "react-i18next"

import { useDebtsSummaryQuery } from "@/features/debts/debts-queries"
import {
  useInventoryInvoiceGroupsQuery,
  useInventoryItemDefinitionsQuery,
} from "@/features/inventory/inventory-hooks"
import { PageHeader, StatBand } from "@/features/shared/page-primitives"

import { buildDashboardBusinessCounters } from "./dashboard-metrics"

type DashboardSectionProps = {
  metrics: {
    workers: number
    projects: number
    warehouses: number
    roles: number
    counterparties: number
  }
  labels: {
    title: string
    description: string
    workers: string
    projects: string
    warehouses: string
    roles: string
    invoices: string
    outstandingDebts: string
    items: string
    counterparties: string
  }
}

/** Dashboard section showing overview metrics and quick actions. */
/**
 * @description Component
 */
export function DashboardSection({ metrics, labels }: DashboardSectionProps) {
  const { t } = useTranslation()

  // Feature-scoped aggregates (issue #23): debts + inventory totals come from
  // the existing narrow queries so they stay fresh after their own mutations
  // (the debts feature documents reading debtsSummary instead of the snapshot
  // for exactly this reason). The section is lazy-loaded, so these RPCs fire
  // only when the dashboard page is shown.
  const debtsSummaryQuery = useDebtsSummaryQuery()
  const invoiceGroupsQuery = useInventoryInvoiceGroupsQuery()
  const itemDefinitionsQuery = useInventoryItemDefinitionsQuery()

  const { openInvoices, outstandingDebtsDzd, items } = buildDashboardBusinessCounters({
    debtsSummary: debtsSummaryQuery.data,
    invoiceGroups: invoiceGroupsQuery.data?.items,
    itemDefinitions: itemDefinitionsQuery.data?.items,
  })

  // Density-first stat cards must never claim zero for data that is still
  // loading or failed to load (a busy account showing "0 د.ج" is a lie).
  // Placeholders keep the band stable without a retry surface here:
  // "…" while pending, "—" on error-with-no-data, the real value otherwise.
  // NB: isError alone is NOT enough — a background refetch that fails after
  // data has loaded keeps the retained data, so only replace it with "—"
  // when there is genuinely nothing to show (data === undefined).
  const invoicesValue =
    invoiceGroupsQuery.isError && invoiceGroupsQuery.data === undefined
      ? "—"
      : invoiceGroupsQuery.isPending
        ? "…"
        : openInvoices
  const itemsValue =
    itemDefinitionsQuery.isError && itemDefinitionsQuery.data === undefined
      ? "—"
      : itemDefinitionsQuery.isPending
        ? "…"
        : items
  const debtsValue =
    debtsSummaryQuery.isError && debtsSummaryQuery.data === undefined
      ? "—"
      : debtsSummaryQuery.isPending
        ? "…"
        : `${outstandingDebtsDzd.toLocaleString("ar-DZ")} د.ج`

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("detailPages.shell.itemsGuide")}
        title={labels.title}
      />

      <StatBand
        stats={[
          { label: labels.workers,         value: metrics.workers,         tone: metrics.workers > 0 ? "good" : "neutral" },
          { label: labels.projects,        value: metrics.projects,        tone: metrics.projects > 0 ? "good" : "neutral" },
          { label: labels.warehouses,      value: metrics.warehouses,      tone: metrics.warehouses > 0 ? "good" : "neutral" },
          { label: labels.roles,           value: metrics.roles,           tone: "neutral" },
          { label: labels.invoices,         value: invoicesValue, tone: openInvoices > 0 ? "good" : "neutral" },
          { label: labels.outstandingDebts, value: debtsValue,    tone: outstandingDebtsDzd > 0 ? "good" : "neutral" },
          { label: labels.items,            value: itemsValue,    tone: items > 0 ? "good" : "neutral" },
          { label: labels.counterparties,  value: metrics.counterparties,  tone: metrics.counterparties > 0 ? "good" : "neutral" },
        ]}
      />

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <a
          href="/projects/create"
          className="flex flex-col items-center gap-2 p-4 rounded-xl border border-line hover:bg-surface-2 transition-colors"
        >
          <span className="text-2xl">📋</span>
          <span className="text-sm font-medium">{t("dashboard.quickActions.addProject")}</span>
        </a>
        <a
          href="/warehouses/create"
          className="flex flex-col items-center gap-2 p-4 rounded-xl border border-line hover:bg-surface-2 transition-colors"
        >
          <span className="text-2xl">🏭</span>
          <span className="text-sm font-medium">{t("dashboard.quickActions.addWarehouse")}</span>
        </a>
        <a
          href="/invoices/create"
          className="flex flex-col items-center gap-2 p-4 rounded-xl border border-line hover:bg-surface-2 transition-colors"
        >
          <span className="text-2xl">📄</span>
          <span className="text-sm font-medium">{t("dashboard.quickActions.addInvoice")}</span>
        </a>
        <a
          href="/outbound-transfers/create-v2"
          className="flex flex-col items-center gap-2 p-4 rounded-xl border border-line hover:bg-surface-2 transition-colors"
        >
          <span className="text-2xl">🔄</span>
          <span className="text-sm font-medium">{t("dashboard.quickActions.newTransfer")}</span>
        </a>
      </div>
    </div>
  )
}