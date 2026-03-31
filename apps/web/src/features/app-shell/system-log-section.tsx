import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import type { SystemLogEntry } from "@tuari/contracts"

import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/form-controls"
import { formatDateTimeInAlgeria } from "@/lib/algeria-time"

import {
  AppShellEmptyStateRow,
  AppShellFilterShell,
  AppShellSectionBody,
  AppShellSectionSurface,
  AppShellTableFrame,
  AppShellTableHead,
  AppShellTableHeaderCell,
  AppShellTableRow,
  usePaginatedRows,
} from "./app-shell-table-primitives"
import { SectionHeader } from "./section-header"
import { TablePaginationControls } from "./table-pagination-controls"

function getActionTypeLabel(t: (key: string) => string, actionType: SystemLogEntry["actionType"]) {
  const map: Record<SystemLogEntry["actionType"], string> = {
    ACCOUNT_UPDATED: t("systemLog.accountUpdated"),
    DEBT_ACCOUNT_CREATED: t("systemLog.debtAccountCreated"),
    DEBT_ENTRY_RECORDED: t("systemLog.debtEntryRecorded"),
    DEBT_SETTLED: t("systemLog.debtSettled"),
    EMPLOYEE_CREATED: t("systemLog.employeeCreated"),
    EMPLOYEE_UPDATED: t("systemLog.employeeUpdated"),
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
    MANAGER_ASSIGNMENT: t("systemLog.entityManagerAssignment"),
    PROJECT: t("systemLog.entityProject"),
    PROJECT_ASSIGNMENT: t("systemLog.entityProjectAssignment"),
    SALARY_PAYMENT: t("systemLog.entitySalaryPayment"),
    WAREHOUSE: t("systemLog.entityWarehouse"),
    WAREHOUSE_ASSIGNMENT: t("systemLog.entityWarehouseAssignment"),
  }

  return map[entityType]
}

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
    actorUserId?: string
    entityType?: SystemLogEntry["entityType"]
    fromDate?: string
    toDate?: string
  }
  onFiltersChange: (filters: {
    actionType?: SystemLogEntry["actionType"]
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

  const filteredEntries = entries
  const { page, pageSize, pagedRows: pagedEntries, setPage, setPageSize } = usePaginatedRows({
    rows: filteredEntries,
    resetPageDeps: [filters.actionType, filters.actorUserId, filters.entityType, filters.fromDate, filters.toDate],
  })

  return (
    <AppShellSectionSurface>
      <AppShellSectionBody>
        <SectionHeader title={title} />

        <AppShellFilterShell>
          <label className="flex flex-col gap-2">
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
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("systemLog.action")}</span>
            <NativeSelect value={filters.actionType ?? "ALL"} onChange={(event) => onFiltersChange({ ...filters, actionType: event.target.value === "ALL" ? undefined : (event.target.value as SystemLogEntry["actionType"]) })}>
              <option value="ALL">{t("systemLog.actionAll")}</option>
              {["ACCOUNT_UPDATED", "DEBT_ACCOUNT_CREATED", "DEBT_ENTRY_RECORDED", "DEBT_SETTLED", "EMPLOYEE_CREATED", "EMPLOYEE_UPDATED", "WORKPLACE_ASSIGNED", "PROJECT_MANAGER_CHANGED", "WAREHOUSE_MANAGER_CHANGED", "SALARY_PAYMENT_RECORDED"].map((value) => (
                <option key={value} value={value}>
                  {getActionTypeLabel(t, value as SystemLogEntry["actionType"])}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("systemLog.entity")}</span>
            <NativeSelect value={filters.entityType ?? "ALL"} onChange={(event) => onFiltersChange({ ...filters, entityType: event.target.value === "ALL" ? undefined : (event.target.value as SystemLogEntry["entityType"]) })}>
              <option value="ALL">{t("systemLog.entityAll")}</option>
              {["ACCOUNT", "DEBT_ACCOUNT", "DEBT_ENTRY", "EMPLOYEE", "EXTERNAL_COUNTERPARTY", "PROJECT", "WAREHOUSE", "MANAGER_ASSIGNMENT", "PROJECT_ASSIGNMENT", "WAREHOUSE_ASSIGNMENT", "SALARY_PAYMENT"].map((value) => (
                <option key={value} value={value}>
                  {getEntityTypeLabel(t, value as SystemLogEntry["entityType"])}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("systemLog.dateFrom")}</span>
            <Input type="date" value={filters.fromDate ?? ""} onChange={(event) => onFiltersChange({ ...filters, fromDate: event.target.value || undefined })} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">{t("systemLog.dateTo")}</span>
            <Input type="date" value={filters.toDate ?? ""} onChange={(event) => onFiltersChange({ ...filters, toDate: event.target.value || undefined })} />
          </label>
        </AppShellFilterShell>

        <AppShellTableFrame>
            <table className="min-w-full text-sm">
              <AppShellTableHead>
                <tr>
                  <AppShellTableHeaderCell>{t("systemLog.createdAt")}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{t("systemLog.actor")}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{t("systemLog.action")}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{t("systemLog.target")}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{t("systemLog.summary")}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{t("systemLog.details")}</AppShellTableHeaderCell>
                </tr>
              </AppShellTableHead>
              <tbody>
                {isLoading ? (
                  <AppShellEmptyStateRow colSpan={6}>{t("systemLog.loading")}</AppShellEmptyStateRow>
                ) : isError ? (
                  <AppShellEmptyStateRow colSpan={6}>{t("systemLog.loadError")}</AppShellEmptyStateRow>
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
                      <td className="px-4 py-4 text-start font-medium text-foreground">{entry.summary}</td>
                      <td className="px-4 py-4 text-start text-xs leading-6 text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {entry.detail ?? "—"}
                      </td>
                    </AppShellTableRow>
                  ))
                ) : (
                  <AppShellEmptyStateRow colSpan={6}>{t("systemLog.empty")}</AppShellEmptyStateRow>
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
      </AppShellSectionBody>
    </AppShellSectionSurface>
  )
}
