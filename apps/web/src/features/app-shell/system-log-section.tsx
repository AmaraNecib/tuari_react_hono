import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import type { SystemLogEntry } from "@tuari/contracts"

import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/form-controls"
import { formatDateTimeInAlgeria } from "@/lib/algeria-time"
import { cn } from "@/lib/utils"

import {
  AppShellEmptyStateRow,
  AppShellFilterShell,
  DateRangeFilter,
  AppShellTableFrame,
  AppShellTableHead,
  AppShellTableHeaderCell,
  AppShellTableRow,
  usePaginatedRows,
} from "./app-shell-table-primitives"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { TablePaginationControls } from "./table-pagination-controls"

function getActionTypeLabel(t: (key: string) => string, actionType: SystemLogEntry["actionType"]) {
  const map: Record<SystemLogEntry["actionType"], string> = {
    ACCOUNT_UPDATED: t("systemLog.accountUpdated"),
    DEBT_ACCOUNT_CREATED: t("systemLog.debtAccountCreated"),
    DEBT_ENTRY_RECORDED: t("systemLog.debtEntryRecorded"),
    DEBT_SETTLED: t("systemLog.debtSettled"),
    EMPLOYEE_CREATED: t("systemLog.employeeCreated"),
    EMPLOYEE_UPDATED: t("systemLog.employeeUpdated"),
    INVENTORY_ITEM_CREATED: "إنشاء تعريف عنصر",
    PROJECT_MANAGER_CHANGED: t("systemLog.projectManagerChanged"),
    SALARY_PAYMENT_RECORDED: t("systemLog.salaryPaymentRecorded"),
    WAREHOUSE_MANAGER_CHANGED: t("systemLog.warehouseManagerChanged"),
    WORKPLACE_ASSIGNED: t("systemLog.workplaceAssigned"),
  }

  return map[actionType]
}

function getEntityTypeLabel(t: (key: string) => string, entityType: SystemLogEntry["entityType"]) {
  const map: Record<SystemLogEntry["entityType"], string> = {
    ACCOUNT: t("systemLog.entityAccount"),
    DEBT_ACCOUNT: t("systemLog.entityDebtAccount"),
    DEBT_ENTRY: t("systemLog.entityDebtEntry"),
    EMPLOYEE: t("systemLog.entityEmployee"),
    EXTERNAL_COUNTERPARTY: t("systemLog.entityExternalCounterparty"),
    INVENTORY_ITEM: "تعريف عنصر",
    MANAGER_ASSIGNMENT: t("systemLog.entityManagerAssignment"),
    PROJECT: t("systemLog.entityProject"),
    PROJECT_ASSIGNMENT: t("systemLog.entityProjectAssignment"),
    SALARY_PAYMENT: t("systemLog.entitySalaryPayment"),
    WAREHOUSE: t("systemLog.entityWarehouse"),
    WAREHOUSE_ASSIGNMENT: t("systemLog.entityWarehouseAssignment"),
  }

  return map[entityType]
}

function parseDetailLines(detail: string | null | undefined) {
  if (!detail) {
    return []
  }

  const normalized = detail
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.includes("تم إنشاء حساب دين"))

  if (normalized.length > 1) {
    return normalized.map((line) => line.replace(/^•\s*/, ""))
  }

  return normalized.length === 1 ? [normalized[0]!.replace(/^•\s*/, "")] : []
}

function parseDetailTokens(line: string) {
  const structuredPrefixes = [
    "تم ",
    "تمت ",
    "نوع الحركة",
    "القيمة",
    "الرصيد",
    "الحالة",
    "المبلغ المدفوع",
  ]

  if (!structuredPrefixes.some((prefix) => line.startsWith(prefix))) {
    return [line]
  }

  return line
    .split(/\s+[•—]\s+/)
    .map((part) => part.trim())
    .filter((part) => !part.startsWith("نوع الحركة"))
    .filter((part) => part.length > 0)
}

function getDetailTokenClassName(token: string) {
  if (token.startsWith("القيمة") || token.startsWith("الرصيد")) {
    return "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200 font-mono font-semibold"
  }

  if (token.startsWith("نوع الحركة") || token.startsWith("الحالة")) {
    return "border-sky-300 bg-sky-100 text-sky-950 dark:border-sky-800 dark:bg-sky-950/35 dark:text-sky-200 font-semibold"
  }

  if (token.startsWith("تم ") || token.startsWith("تمت ")) {
    return "border-violet-300 bg-violet-100 text-violet-950 dark:border-violet-800 dark:bg-violet-950/35 dark:text-violet-200 font-semibold"
  }

  return "border-border bg-muted/80 text-foreground dark:bg-muted/45 dark:text-muted-foreground font-medium"
}

function SystemLogDetailsCell({ detail }: { detail: string | null | undefined }) {
  const lines = parseDetailLines(detail)

  if (lines.length === 0) {
    return <span>—</span>
  }

  return (
    <div className="space-y-2">
      {lines.map((line, lineIndex) => {
        const tokens = parseDetailTokens(line)

        return (
          <div key={`${line}-${lineIndex}`} className="flex flex-wrap gap-2">
            {tokens.map((token, tokenIndex) => (
              <span
                key={`${token}-${tokenIndex}`}
                className={cn(
                  "inline-flex min-h-8 items-center rounded-xl border px-3 py-1.5 text-[12px] leading-5 shadow-[0_1px_0_rgba(255,255,255,0.55)_inset] dark:shadow-none",
                  getDetailTokenClassName(token),
                )}
              >
                {token}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** System log section with filtered activity list. */
export function SystemLogSection({
  entries,
  filters,
  isError = false,
  isLoading = false,
  onFiltersChange,
  title,
}: {
  entries: SystemLogEntry[]
  filters: {
    actionType?: SystemLogEntry["actionType"]
    actorQuery?: string
    actorUserId?: string
    entityType?: SystemLogEntry["entityType"]
    fromDate?: string
    toDate?: string
  }
  onFiltersChange: (filters: {
    actionType?: SystemLogEntry["actionType"]
    actorQuery?: string
    actorUserId?: string
    entityType?: SystemLogEntry["entityType"]
    fromDate?: string
    toDate?: string
  }) => void
  isError?: boolean
  isLoading?: boolean
  title: string
}) {
  const { t } = useTranslation()

  const actorOptions = useMemo(
    () =>
      Array.from(
        new Map(
          entries
            .filter((entry) => entry.actorUserId)
            .map((entry) => [entry.actorUserId!, entry.actorLabel ?? entry.actorUserId!]),
        ).entries(),
      ),
    [entries],
  )

  const actorQuery = filters.actorQuery?.trim().toLowerCase() ?? ""
  const filteredEntries = actorQuery
    ? entries.filter((entry) =>
        [entry.actorLabel, entry.actorCurrentLabel, entry.actorUserId]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(actorQuery)),
      )
    : entries
  const { page, pageSize, pagedRows: pagedEntries, setPage, setPageSize } = usePaginatedRows({
    rows: filteredEntries,
    resetPageDeps: [filters.actionType, filters.actorQuery, filters.actorUserId, filters.entityType, filters.fromDate, filters.toDate],
  })

  return (
    <RecordPageFrame title={title}>
        <AppShellFilterShell>
          <label className="flex flex-col gap-2 min-w-[10rem]">
            <span className="text-sm font-medium text-foreground">{t("systemLog.actor")}</span>
            <NativeSelect value={filters.actorUserId ?? "ALL"} onChange={(event) => onFiltersChange({ ...filters, actorUserId: event.target.value === "ALL" ? undefined : event.target.value })}>
              <option value="ALL">{t("systemLog.actorAll")}</option>
              {actorOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-2 min-w-[14rem]">
            <span className="text-sm font-medium text-foreground">{t("systemLog.actorSearch")}</span>
            <Input
              value={filters.actorQuery ?? ""}
              placeholder={t("systemLog.actorSearchPlaceholder")}
              onChange={(event) => onFiltersChange({ ...filters, actorQuery: event.target.value || undefined })}
            />
          </label>
          <label className="flex flex-col gap-2 min-w-[10rem]">
            <span className="text-sm font-medium text-foreground">{t("systemLog.action")}</span>
            <NativeSelect value={filters.actionType ?? "ALL"} onChange={(event) => onFiltersChange({ ...filters, actionType: event.target.value === "ALL" ? undefined : (event.target.value as SystemLogEntry["actionType"]) })}>
              <option value="ALL">{t("systemLog.actionAll")}</option>
              {["ACCOUNT_UPDATED", "DEBT_ENTRY_RECORDED", "DEBT_SETTLED", "EMPLOYEE_CREATED", "EMPLOYEE_UPDATED", "INVENTORY_ITEM_CREATED", "WORKPLACE_ASSIGNED", "PROJECT_MANAGER_CHANGED", "WAREHOUSE_MANAGER_CHANGED", "SALARY_PAYMENT_RECORDED"].map((value) => (
                <option key={value} value={value}>
                  {getActionTypeLabel(t, value as SystemLogEntry["actionType"])}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-2 min-w-[10rem]">
            <span className="text-sm font-medium text-foreground">{t("systemLog.entity")}</span>
            <NativeSelect value={filters.entityType ?? "ALL"} onChange={(event) => onFiltersChange({ ...filters, entityType: event.target.value === "ALL" ? undefined : (event.target.value as SystemLogEntry["entityType"]) })}>
              <option value="ALL">{t("systemLog.entityAll")}</option>
              {["ACCOUNT", "DEBT_ACCOUNT", "DEBT_ENTRY", "EMPLOYEE", "EXTERNAL_COUNTERPARTY", "INVENTORY_ITEM", "PROJECT", "WAREHOUSE", "MANAGER_ASSIGNMENT", "PROJECT_ASSIGNMENT", "WAREHOUSE_ASSIGNMENT", "SALARY_PAYMENT"].map((value) => (
                <option key={value} value={value}>
                  {getEntityTypeLabel(t, value as SystemLogEntry["entityType"])}
                </option>
              ))}
            </NativeSelect>
          </label>
          <DateRangeFilter
            fromLabel={t("systemLog.dateFrom")}
            toLabel={t("systemLog.dateTo")}
            fromDate={filters.fromDate ?? ""}
            toDate={filters.toDate ?? ""}
            onFromDateChange={(value) => onFiltersChange({ ...filters, fromDate: value || undefined })}
            onToDateChange={(value) => onFiltersChange({ ...filters, toDate: value || undefined })}
          />
        </AppShellFilterShell>

        <AppShellTableFrame>
            <table className="min-w-full text-sm">
              <AppShellTableHead>
                <tr>
                  <AppShellTableHeaderCell>{t("systemLog.createdAt")}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{t("systemLog.actor")}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{t("systemLog.action")}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{t("systemLog.target")}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{t("systemLog.entityId")}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{t("systemLog.summary")}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{t("systemLog.details")}</AppShellTableHeaderCell>
                </tr>
              </AppShellTableHead>
              <tbody>
                {isLoading ? (
                  <AppShellEmptyStateRow colSpan={7}>{t("systemLog.loading")}</AppShellEmptyStateRow>
                ) : isError ? (
                  <AppShellEmptyStateRow colSpan={7}>{t("systemLog.loadError")}</AppShellEmptyStateRow>
                ) : pagedEntries.length > 0 ? (
                  pagedEntries.map((entry) => (
                    <AppShellTableRow key={entry.id} className="align-top">
                      <td className="px-4 py-4 text-start text-muted-foreground">{formatDateTimeInAlgeria(new Date(entry.createdAt))}</td>
                      <td
                        className="px-4 py-4 text-start text-muted-foreground"
                        title={entry.actorCurrentLabel && entry.actorCurrentLabel !== entry.actorLabel ? `${t("systemLog.currentActorName")}: ${entry.actorCurrentLabel}` : undefined}
                      >
                        {entry.actorLabel ?? t("systemLog.actorUnknown")}
                      </td>
                      <td className="px-4 py-4 text-start text-foreground">{getActionTypeLabel(t, entry.actionType)}</td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{entry.entityLabel ?? t("systemLog.targetUnknown")}</td>
                      <td className="px-4 py-4 text-start font-mono text-xs text-muted-foreground">{entry.entityId}</td>
                      <td className="px-4 py-4 text-start font-medium text-foreground">{entry.summary}</td>
                      <td className="px-4 py-4 text-start text-xs leading-6 text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        <SystemLogDetailsCell detail={entry.detail} />
                      </td>
                    </AppShellTableRow>
                  ))
                ) : (
                  <AppShellEmptyStateRow colSpan={7}>{t("systemLog.empty")}</AppShellEmptyStateRow>
                )}
              </tbody>
            </table>
        </AppShellTableFrame>
        <TablePaginationControls
          page={page}
          pageSize={pageSize}
          totalCount={filteredEntries.length}
          onPageChange={setPage}
          onPageSizeChange={(nextPageSize) => {
            setPage(1)
            setPageSize(nextPageSize)
          }}
        />
    </RecordPageFrame>
  )
}
