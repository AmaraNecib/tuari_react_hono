import { AppDate } from "@/components/app-date"
import { MoneyValue } from "@/features/shared/money-value"
import { TablePaginationControls } from "@/features/shared/table-pagination-controls"
import {
  AppShellEmptyStateRow,
  AppShellTableFrame,
  AppShellTableHead,
  AppShellTableHeaderCell,
  AppShellTableRow,
  TableQueryState,
} from "@/features/shared/table-primitives"
import { useEmployeeEarningsQuery } from "@/features/employees/employee-earnings-queries"
import { useSalaryRoutePagination, type SalaryRoutePagination } from "@/features/app-shell/salary-route-pagination"
import type { EmployeeEarning } from "@tuari/contracts"
import { useTranslation } from "react-i18next"

export type EmployeeEarningsHistoryProps = {
  employeeId?: string
  /** Known display names. Missing identities render as their IDs, never guessed labels. */
  employeeNames?: Readonly<Record<string, string>>
  projectNames?: Readonly<Record<string, string>>
  routePagination?: SalaryRoutePagination
}

/** Read-only view of server-approved earnings. Segment order and exact amounts come from the approval record. */
export function EmployeeEarningsHistory({ employeeId, employeeNames, projectNames, routePagination }: EmployeeEarningsHistoryProps) {
  const { t } = useTranslation()
  const query = useEmployeeEarningsQuery(employeeId)
  const earnings = query.data?.items ?? []
  const rows = useSalaryRoutePagination(earnings, routePagination, query.data !== undefined)
  const currencyLabel = t("detailPages.salary.currency")
  const showEmployeeIdentity = !employeeId
  const columnCount = showEmployeeIdentity ? 5 : 4

  return (
    <div className="space-y-4">
      <TableQueryState query={query} resource={t("earnings.historyResource")}>
        <AppShellTableFrame>
          <table className="min-w-full">
            <caption className="sr-only">{t("earnings.historyTitle")}</caption>
            <AppShellTableHead>
              <tr>
                {showEmployeeIdentity ? <AppShellTableHeaderCell>{t("earnings.historyEmployee")}</AppShellTableHeaderCell> : null}
                <AppShellTableHeaderCell>{t("earnings.historyPeriod")}</AppShellTableHeaderCell>
                <AppShellTableHeaderCell>{t("earnings.total")}</AppShellTableHeaderCell>
                <AppShellTableHeaderCell>{t("earnings.unallocated")}</AppShellTableHeaderCell>
                <AppShellTableHeaderCell>{t("earnings.projectRows")}</AppShellTableHeaderCell>
              </tr>
            </AppShellTableHead>
            <tbody>
              {rows.pagedRows.length ? rows.pagedRows.map((earning) => (
                <EarningHistoryRow key={earning.id} earning={earning} currencyLabel={currencyLabel} showEmployeeIdentity={showEmployeeIdentity} employeeNames={employeeNames} projectNames={projectNames} />
              )) : (
                <AppShellEmptyStateRow colSpan={columnCount}>{t("earnings.historyEmpty")}</AppShellEmptyStateRow>
              )}
            </tbody>
          </table>
        </AppShellTableFrame>
      </TableQueryState>
      {earnings.length > 0 ? (
        <TablePaginationControls
          page={rows.page}
          pageSize={rows.pageSize}
          totalCount={earnings.length}
          onPageChange={rows.setPage}
          onPageSizeChange={rows.setPageSize}
        />
      ) : null}
    </div>
  )
}

function EarningHistoryRow({ earning, currencyLabel, showEmployeeIdentity, employeeNames, projectNames }: {
  earning: EmployeeEarning
  currencyLabel: string
  showEmployeeIdentity: boolean
  employeeNames?: Readonly<Record<string, string>>
  projectNames?: Readonly<Record<string, string>>
}) {
  const { t } = useTranslation()

  return (
    <AppShellTableRow>
      {showEmployeeIdentity ? <td className="px-4 py-3 text-start text-[12px] text-ink-3"><bdi dir="auto">{employeeNames?.[earning.employeeId] ?? earning.employeeId}</bdi></td> : null}
      <td className="px-4 py-3 text-start text-[13px] text-ink-2">
        <div className="flex items-center gap-2" dir="rtl">
          <AppDate value={earning.periodStart} />
          <span aria-hidden="true">–</span>
          <AppDate value={earning.periodEnd} />
        </div>
        <p className="mt-1 text-[11px] text-ink-4">
          {t("earnings.historyApprovedAt")} <AppDate value={earning.approvedAt} />
        </p>
      </td>
      <td className="px-4 py-3 text-start">
        <MoneyValue exact value={earning.totalAmount} currencyLabel={currencyLabel} />
      </td>
      <td className="px-4 py-3 text-start">
        <div className="space-y-1">
          <MoneyValue exact value={earning.unallocatedAmount} currencyLabel={currencyLabel} />
        </div>
      </td>
      <td className="px-4 py-3 text-start">
        {earning.segments.length ? (
          <ol className="space-y-2">
            {earning.segments.map((segment) => (
              <li key={segment.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]">
                <bdi dir="auto" className="font-medium text-ink">{projectNames?.[segment.projectId] ?? segment.projectId}</bdi>
                <span className="text-ink-3">{t("earnings.days")}: {segment.days}</span>
                <MoneyValue exact value={segment.amount} currencyLabel={currencyLabel} />
              </li>
            ))}
          </ol>
        ) : (
          <span className="text-[12px] text-ink-4">{t("earnings.historyNoSegments")}</span>
        )}
      </td>
    </AppShellTableRow>
  )
}
