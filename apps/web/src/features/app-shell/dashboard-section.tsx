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
export function DashboardSection({ metrics, labels }: DashboardSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-8">
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
    </div>
  )
}
