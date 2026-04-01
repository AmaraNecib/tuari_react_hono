import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Contact, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { Surface } from "@/features/shared/page-primitives"
import { cn } from "@/lib/utils"

import { getDebtBalanceMeta, formatDebtMoney } from "./debt-utils"

type FilterKey = "all" | "owed-to-us" | "owed-by-us" | "settled"

type DebtHubRow = {
  accountId: string
  balanceDzd: number
  caseCount: number
  openCaseCount: number
  name: string
  partyId: string
  phone: string
  status: "OPEN" | "SETTLED"
  type: "worker" | "external"
}

function HubStatCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <Surface className="rounded-[22px] px-5 py-4" variant="card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-2 font-mono text-xl font-semibold", valueClassName)} dir="ltr">
        {value}
      </p>
    </Surface>
  )
}

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        "rounded-full border px-4 py-1.5 text-sm transition-colors",
        active
          ? "border-primary/30 bg-primary/10 font-medium text-primary"
          : "border-border/60 text-muted-foreground hover:bg-muted/40",
      )}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export function DebtsHubPage({
  onCreateDebt,
  onManageExternalPersons,
  onOpenExternalPerson,
  onOpenWorker,
  rows,
  totals,
}: {
  onCreateDebt: () => void
  onManageExternalPersons: () => void
  onOpenExternalPerson: (counterpartyId: string) => void
  onOpenWorker: (employeeId: string) => void
  rows: DebtHubRow[]
  totals: { openCount: number; owedByUsDzd: number; owedToUsDzd: number }
}) {
  const { t } = useTranslation()
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")

  const filterLabels: Record<FilterKey, string> = {
    all: t("detailPages.debt.filter.all"),
    "owed-to-us": t("detailPages.debt.filter.owedToUs"),
    "owed-by-us": t("detailPages.debt.filter.owedByUs"),
    settled: t("detailPages.debt.filter.settled"),
  }

  const filteredRows = rows.filter((row) => {
    if (activeFilter === "owed-to-us") return row.balanceDzd > 0
    if (activeFilter === "owed-by-us") return row.balanceDzd < 0
    if (activeFilter === "settled") return row.status === "SETTLED"
    return true
  })

  return (
    <RecordPageFrame
      backHref="/"
      backLabel={t("detailPages.debt.hub.backLabel")}
      title={t("detailPages.debt.hub.title")}
      description={t("detailPages.debt.hub.description")}
    >
      <div className="flex flex-wrap gap-3">
        <Button onClick={onCreateDebt}>
          <Plus className="me-2 size-4" />
          {t("detailPages.debt.newDebt")}
        </Button>
        <Button variant="outline" onClick={onManageExternalPersons}>
          <Contact className="me-2 size-4" />
          {t("sections.externalPersons.label")}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <HubStatCard label={t("detailPages.debt.hub.statsOpenCount")} value={String(totals.openCount)} />
        <HubStatCard
          label={t("detailPages.debt.hub.statsOwedToUs")}
          value={`${t("detailPages.debt.currency")} ${formatDebtMoney(totals.owedToUsDzd)}`}
          valueClassName="text-emerald-700 dark:text-emerald-300"
        />
        <HubStatCard
          label={t("detailPages.debt.hub.statsOwedByUs")}
          value={`${t("detailPages.debt.currency")} ${formatDebtMoney(-totals.owedByUsDzd)}`}
          valueClassName="text-rose-700 dark:text-rose-300"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "owed-to-us", "owed-by-us", "settled"] as FilterKey[]).map((f) => (
          <FilterPill
            key={f}
            active={activeFilter === f}
            label={filterLabels[f]}
            onClick={() => setActiveFilter(f)}
          />
        ))}
      </div>

      <Surface className="overflow-hidden" variant="table">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.hub.tableParty")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.hub.tableType")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.hub.tablePhone")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.hub.tableCases")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.hub.tableBalance")}</th>
                <th className="px-4 py-3 text-end font-medium">{t("detailPages.debt.hub.tableMeta")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => {
                  const balanceMeta = getDebtBalanceMeta(row.balanceDzd, t)

                  return (
                    <tr
                      key={row.accountId}
                      className="cursor-pointer border-t border-border/60 bg-background/75 transition-colors hover:bg-muted/30"
                      onClick={() =>
                        row.type === "worker"
                          ? onOpenWorker(row.partyId)
                          : onOpenExternalPerson(row.partyId)
                      }
                    >
                      <td className="px-4 py-4 text-end font-medium text-foreground">{row.name}</td>
                      <td className="px-4 py-4 text-end text-muted-foreground">
                        {row.type === "worker" ? t("detailPages.debt.hub.typeInternal") : t("detailPages.debt.hub.typeExternal")}
                      </td>
                      <td className="px-4 py-4 text-end text-foreground">
                        <bdi dir="ltr">{row.phone}</bdi>
                      </td>
                      <td className="px-4 py-4 text-end text-foreground">
                        {row.openCaseCount} / {row.caseCount}
                      </td>
                      <td className={cn("px-4 py-4 text-end font-mono", balanceMeta.textClassName)} dir="ltr">
                        {t("detailPages.debt.currency")} {formatDebtMoney(row.balanceDzd)}
                      </td>
                      <td className="px-4 py-4 text-end">
                        <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", balanceMeta.badgeClassName)}>
                          {balanceMeta.shortLabel}
                        </span>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>
                    {t("detailPages.debt.hub.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Surface>
    </RecordPageFrame>
  )
}
