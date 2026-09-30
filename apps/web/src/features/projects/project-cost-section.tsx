import { useTranslation } from "react-i18next"
import { useNavigate } from "@tanstack/react-router"

import type { ProjectCost } from "@tuari/contracts"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadErrorSurface } from "@/features/shared/load-error-surface"
import { Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { formatAlgeriaDate } from "@/lib/algeria-time"
import { navigateToWorkspaceRoute, workspaceRoutes } from "@/router/navigation"

import { useProjectCostQuery } from "./project-cost-queries"

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)
}

function formatDay(iso: string) {
  return formatAlgeriaDate(new Date(iso))
}

/**
 * The project page's cost breakdown (issue #414, screen "P").
 *
 * One total with four labelled sources (expenses tagged to the project,
 * salaries by allocated days, charged stock, material charged to the project),
 * the rows behind each source, and the project's CURRENT asset inventory value
 * shown separately — parked tools are inventory value, never cost. Material
 * charged to the project is the NET of the movements in and out, so the list
 * shows each movement's direction.
 */
export function ProjectCostSection({
  projectId,
  onOpenItems,
}: {
  projectId: string
  onOpenItems?: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const query = useProjectCostQuery(projectId)

  const money = (value: number) => `${formatNumber(value)} ${t("detailPages.project.cost.currency")}`

  if (query.isPending) {
    return (
      <Surface variant="panel" className="p-6">
        <p className="text-sm text-ink-3">{t("common.loading")}</p>
      </Surface>
    )
  }

  if (query.isError || !query.data) {
    return (
      <LoadErrorSurface
        message={t("detailPages.project.cost.loadError")}
        retryLabel={t("common.retry")}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const data: ProjectCost = query.data
  const total = data.totalDzd
  const percentOf = (value: number) => (total > 0 ? Math.max(0, Math.round((value / total) * 100)) : 0)

  const sources = [
    { key: "expenses", label: t("detailPages.project.cost.sources.expenses"), value: data.parts.expensesDzd, bar: "bg-chart-1" },
    { key: "salaries", label: t("detailPages.project.cost.sources.salaries"), value: data.parts.salariesDzd, bar: "bg-chart-2" },
    { key: "stock", label: t("detailPages.project.cost.sources.stock"), value: data.parts.stockDzd, bar: "bg-chart-3" },
    { key: "materials", label: t("detailPages.project.cost.sources.chargedMaterials"), value: data.parts.chargedMaterialsDzd, bar: "bg-chart-4" },
  ]

  // A total of zero can still hide real activity (a negative material net
  // cancelling an expense), so show the breakdown whenever any part is nonzero.
  const hasCost = total !== 0 || sources.some((source) => source.value !== 0)
  const materialNetIsNegative = data.parts.chargedMaterialsDzd < 0
  const hasParked = data.parkedInventory.assets.length > 0

  return (
    <div className="space-y-6">
      <Surface variant="card" className="p-5">
        <SurfaceHeader title={t("detailPages.project.cost.total")} />
        <p className="mt-2 font-mono text-3xl font-semibold text-ink" dir="ltr">
          {money(total)}
        </p>

        <ul className="mt-5 space-y-3">
          {sources.map((source) => {
            const percent = percentOf(source.value)
            return (
              <li key={source.key} className="flex items-center gap-3 text-sm">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${source.bar}`} aria-hidden="true" />
                <span className="w-40 shrink-0 text-ink-2">{source.label}</span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className={`block h-full rounded-full ${source.bar}`}
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span className="w-10 shrink-0 text-left text-xs text-ink-3">
                  {t("detailPages.project.cost.share", { percent })}
                </span>
                <span className="w-28 shrink-0 text-left font-mono text-ink" dir="ltr">
                  {money(source.value)}
                </span>
              </li>
            )
          })}
          {materialNetIsNegative ? (
            <li className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
              <span aria-hidden="true">⚠</span>
              <span>{t("detailPages.project.cost.materials.negative")}</span>
            </li>
          ) : null}
        </ul>
      </Surface>

      {!hasCost ? (
        <Surface variant="panel">
          <EmptyState
            title={t("detailPages.project.cost.empty.title")}
            description={t("detailPages.project.cost.empty.description")}
            action={{
              label: t("detailPages.project.cost.empty.addExpense"),
              onClick: () => void navigateToWorkspaceRoute(navigate, workspaceRoutes.expenses()),
            }}
            secondaryAction={{
              label: t("detailPages.project.cost.empty.moveTool"),
              onClick: () => {
                if (onOpenItems) onOpenItems()
                else void navigateToWorkspaceRoute(navigate, workspaceRoutes.projectTab(projectId, "items"))
              },
            }}
          />
          <div className="flex justify-center pb-6">
            <button
              type="button"
              className="text-sm text-ink-3 underline underline-offset-4 hover:text-ink"
              onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.salaries())}
            >
              {t("detailPages.project.cost.empty.payWage")}
            </button>
          </div>
        </Surface>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Surface variant="card" className="p-5">
            <SurfaceHeader title={t("detailPages.project.cost.expenses.title")} />
            {data.expenses.length === 0 ? (
              <p className="mt-3 text-sm text-ink-3">{t("detailPages.project.cost.expenses.empty")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {data.expenses.map((expense) => (
                  <li key={expense.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{expense.whatFor ?? t("expenses.noDescription")}</span>
                      <span className="text-xs text-ink-3">
                        {formatDay(expense.expenseDate)}
                        {expense.responsibleWorkerName ? ` · ${expense.responsibleWorkerName}` : ""}
                        {expense.sellerName ? ` · ${expense.sellerName}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-ink" dir="ltr">{money(expense.amountDzd)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          <Surface variant="card" className="p-5">
            <SurfaceHeader title={t("detailPages.project.cost.salaries.title")} />
            {data.salaries.length === 0 ? (
              <p className="mt-3 text-sm text-ink-3">{t("detailPages.project.cost.salaries.empty")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {data.salaries.map((salary) => (
                  <li key={salary.paymentId} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{salary.employeeName ?? t("common.none")}</span>
                      <span className="text-xs text-ink-3">
                        {t("detailPages.project.cost.salaries.days", { count: salary.days })} · {formatDay(salary.paymentDate)}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-ink" dir="ltr">{money(salary.amountDzd)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          <Surface variant="card" className="p-5">
            <SurfaceHeader title={t("detailPages.project.cost.stock.title")} />
            {data.stock.length === 0 ? (
              <p className="mt-3 text-sm text-ink-3">{t("detailPages.project.cost.stock.empty")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {data.stock.map((charge) => (
                  <li key={charge.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{charge.assetName ?? t("common.none")}</span>
                      <span className="text-xs text-ink-3">{formatDay(charge.placedAt)}</span>
                    </span>
                    <span className="shrink-0 font-mono text-ink" dir="ltr">{money(charge.amountDzd)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          <Surface variant="card" className="p-5">
            <SurfaceHeader title={t("detailPages.project.cost.materials.title")} />
            {data.materialMovements.length === 0 ? (
              <p className="mt-3 text-sm text-ink-3">{t("detailPages.project.cost.materials.empty")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {data.materialMovements.map((movement) => (
                  <li key={movement.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{movement.itemName ?? t("common.none")}</span>
                      <span className="text-xs text-ink-3">
                        {movement.direction === "IN"
                          ? t("detailPages.project.cost.materials.in")
                          : t("detailPages.project.cost.materials.out")}
                        {" · "}
                        {formatNumber(movement.quantity)}
                        {movement.unit ? ` ${movement.unit}` : ""}
                        {movement.unitPriceDzd != null ? ` · ${money(movement.unitPriceDzd)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-ink" dir="ltr">
                      {movement.direction === "IN" ? "+" : "−"} {money(movement.valueDzd)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </div>
      )}

      <Surface variant="panel" className="p-5">
        <SurfaceHeader
          title={t("detailPages.project.cost.parked.title")}
          description={t("detailPages.project.cost.parked.description")}
        />
        <p className="mt-3 font-mono text-lg font-semibold text-ink" dir="ltr">
          {money(data.parkedInventory.totalDzd)}
        </p>
        {!hasParked ? (
          <p className="mt-2 text-sm text-ink-3">{t("detailPages.project.cost.parked.empty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {data.parkedInventory.assets.map((asset) => (
              <li key={asset.assetUnitId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ink">{asset.assetName ?? t("common.none")}</span>
                <span className="shrink-0 font-mono text-ink" dir="ltr">{money(asset.purchasePriceDzd)}</span>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  )
}
