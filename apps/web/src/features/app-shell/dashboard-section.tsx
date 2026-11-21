import { useTranslation } from "react-i18next"

import { Money, sumMoneyHistory } from "@tuari/contracts"
import { useExactDebtSummary } from "@/features/debts/debts-exact-queries"
import { useExactInventoryDefinitions, useExactInventoryInvoices } from "@/features/inventory/inventory-exact-queries"
import { CurrencyRun } from "@/features/shared/money-value"
import { financialClient } from "@/lib/orpc-client"
import { PageHeader, StatBand } from "@/features/shared/page-primitives"

function formatDashboardMoney(value: string): string {
  const [whole = "0", cents = ""] = value.split(".")
  const fraction = cents.replace(/0+$/, "")
  const groupedWhole = new Intl.NumberFormat("ar-DZ").format(BigInt(whole))
  return fraction ? `${groupedWhole}.${fraction}` : groupedWhole
}

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

  // Load exact debt and inventory aggregates only when the lazy dashboard appears.
  // Their user-scoped queries invalidate after their own commands.
  const debtsSummaryQuery = useExactDebtSummary(financialClient.debts)
  const invoiceGroupsQuery = useExactInventoryInvoices(financialClient.inventory)
  const itemDefinitionsQuery = useExactInventoryDefinitions(financialClient.inventory)

  const openInvoices = invoiceGroupsQuery.data?.filter(invoice => invoice.remainingDebtDzd !== "0.00").length ?? 0
  const outstandingDebtsDzd = sumMoneyHistory(debtsSummaryQuery.data?.accounts
    .filter(account => account.status === "OPEN")
    .map(account => Money.parse(account.currentBalance)) ?? [])
  const outstandingDebtsPositive = !outstandingDebtsDzd.startsWith("-") && outstandingDebtsDzd !== "0.00"
  const items = itemDefinitionsQuery.data?.length ?? 0

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
        : <CurrencyRun amount={formatDashboardMoney(outstandingDebtsDzd)} currencyLabel="د.ج" />

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
          { label: labels.outstandingDebts, value: debtsValue,    tone: outstandingDebtsPositive ? "good" : "neutral" },
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