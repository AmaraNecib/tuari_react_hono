import { useTranslation } from "react-i18next"

import { PageHeader, StatBand } from "@/features/shared/page-primitives"

type DashboardSectionProps = {
  metrics: {
    workers: number
    projects: number
    warehouses: number
    roles: number
  }
  labels: {
    title: string
    description: string
    workers: string
    projects: string
    warehouses: string
    roles: string
  }
}

/** Dashboard section showing overview metrics and quick actions. */
/**
 * @description Component
 */
export function DashboardSection({ metrics, labels }: DashboardSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("detailPages.shell.itemsGuide")}
        title={labels.title}
      />

      <StatBand
        stats={[
          { label: labels.workers,    value: metrics.workers,    tone: metrics.workers > 0 ? "good" : "neutral" },
          { label: labels.projects,   value: metrics.projects,   tone: metrics.projects > 0 ? "good" : "neutral" },
          { label: labels.warehouses, value: metrics.warehouses, tone: metrics.warehouses > 0 ? "good" : "neutral" },
          { label: labels.roles,      value: metrics.roles,      tone: "neutral" },
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
