import { useTranslation } from "react-i18next"
import { useNavigate } from "@tanstack/react-router"

import { UnitPrice, type ProjectCost } from "@tuari/contracts"

import { CurrencyRun, MoneyValue } from "@/features/shared/money-value"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadErrorSurface } from "@/features/shared/load-error-surface"
import { Surface, SurfaceHeader } from "@/features/shared/page-primitives"
import { AppDate } from "@/components/app-date"
import { navigateToWorkspaceRoute, workspaceRoutes } from "@/router/navigation"

import { useProjectCostQuery } from "./project-cost-queries"

function formatDay(iso: string) {
  return <AppDate value={iso} />
}

function formatQuantity(value: string) {
  const [whole = "", fraction] = value.split(".")
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const trimmedFraction = fraction?.replace(/0+$/, "")
  return trimmedFraction ? `${groupedWhole}.${trimmedFraction}` : groupedWhole
}

function percentOf(value: string, total: string) {
  const amountMinor = BigInt(value.replace(".", ""))
  const totalMinor = BigInt(total.replace(".", ""))
  if (totalMinor <= 0n || amountMinor <= 0n) return 0
  if (amountMinor >= totalMinor) return 100

  // Round only the bounded display ratio; monetary inputs stay in integer cents.
  return Number((amountMinor * 100n + totalMinor / 2n) / totalMinor)
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

  const money = (value: string, aggregate = false, signed = false) => (
    <MoneyValue exact value={value} aggregate={aggregate} signed={signed} currencyLabel={t("detailPages.project.cost.currency")} />
  )

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
  const total = data.totalAmount
  const sources = [
    { key: "expenses", label: t("detailPages.project.cost.sources.expenses"), value: data.parts.expensesAmount, bar: "bg-chart-1" },
    { key: "salaries", label: t("detailPages.project.cost.sources.salaries"), value: data.parts.salariesAmount, bar: "bg-chart-2" },
    { key: "stock", label: t("detailPages.project.cost.sources.stock"), value: data.parts.stockAmount, bar: "bg-chart-3" },
    { key: "materials", label: t("detailPages.project.cost.sources.chargedMaterials"), value: data.parts.chargedMaterialsAmount, bar: "bg-chart-4" },
  ]

  const hasCost = total !== "0.00" || sources.some((source) => source.value !== "0.00")
  const materialNetIsNegative = data.parts.chargedMaterialsAmount.startsWith("-") && data.parts.chargedMaterialsAmount !== "-0.00"
  const hasParked = data.parkedInventory.assets.length > 0

  return (
    <div className="space-y-6">
      <Surface variant="card" className="p-5">
        <SurfaceHeader title={t("detailPages.project.cost.total")} />
        <p className="mt-2 font-mono text-3xl font-semibold text-ink" dir="ltr">
          {money(total, true)}
        </p>

        <ul className="mt-5 space-y-3">
          {sources.map((source) => {
            const percent = percentOf(source.value, total)
            return (
              <li key={source.key} className="grid min-w-0 grid-cols-[0.625rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-sm sm:flex sm:gap-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${source.bar}`} aria-hidden="true" />
                <span className="min-w-0 text-ink-2 sm:w-40 sm:shrink-0">{source.label}</span>
                <span className="col-span-2 row-start-2 h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className={`block h-full rounded-full ${source.bar}`} style={{ width: `${percent}%` }} />
                </span>
                <span className="col-start-3 row-start-2 shrink-0 text-left text-xs text-ink-3 sm:w-10">
                  {t("detailPages.project.cost.share", { percent })}
                </span>
                <span className="col-start-3 row-start-1 shrink-0 text-left font-mono text-ink sm:w-28" dir="ltr">
                  {money(source.value, true)}
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
                    <span className="shrink-0 font-mono text-ink" dir="ltr">{money(expense.amount)}</span>
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
                  <li key={salary.segmentId} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{salary.employeeName ?? t("common.none")}</span>
                      <span className="text-xs text-ink-3">
                        {t("detailPages.project.cost.salaries.days", { count: salary.days })} · {formatDay(salary.approvedAt)}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-ink" dir="ltr">{money(salary.amount)}</span>
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
                    <span className="shrink-0 font-mono text-ink" dir="ltr">{money(charge.amount)}</span>
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
                        {formatQuantity(movement.quantity)}
                        {movement.unit ? ` ${movement.unit}` : ""}
                        {movement.unitPrice != null ? <> · <CurrencyRun amount={UnitPrice.parse(movement.unitPrice).format()} currencyLabel={t("detailPages.project.cost.currency")} /></> : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-ink" dir="ltr">
                      {movement.direction === "OUT" ? "−" : null}{money(movement.valueAmount, false, movement.direction === "IN")}
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
          {money(data.parkedInventory.totalAmount, true)}
        </p>
        {!hasParked ? (
          <p className="mt-2 text-sm text-ink-3">{t("detailPages.project.cost.parked.empty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {data.parkedInventory.assets.map((asset) => (
              <li key={asset.assetUnitId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ink">{asset.assetName ?? t("common.none")}</span>
                <span className="shrink-0 font-mono text-ink" dir="ltr">{money(asset.purchaseAmount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  )
}
