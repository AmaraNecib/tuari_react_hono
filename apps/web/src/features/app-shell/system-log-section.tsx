import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import type { SystemLogEntry } from "@tuari/contracts"

import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/form-controls"

import { SectionHeader } from "./section-header"
import { TablePaginationControls } from "./table-pagination-controls"

function getActionTypeLabel(t: (key: string) => string, actionType: SystemLogEntry["actionType"]) {
  const map: Record<SystemLogEntry["actionType"], string> = {
    ACCOUNT_UPDATED: t("systemLog.accountUpdated"),
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
    EMPLOYEE: t("systemLog.entityEmployee"),
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
  title: string
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("ar-DZ", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Algiers",
      }),
    [],
  )

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

  const pagedEntries = useMemo(
    () => filteredEntries.slice((page - 1) * pageSize, page * pageSize),
    [filteredEntries, page, pageSize],
  )

  useEffect(() => {
    setPage(1)
  }, [filters.actionType, filters.actorUserId, filters.entityType, filters.fromDate, filters.toDate])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredEntries.length / pageSize))
    if (page > maxPage) {
      setPage(maxPage)
    }
  }, [filteredEntries.length, page, pageSize])

  return (
    <div className="space-y-6">
      <SectionHeader title={title} />

      <div className="grid gap-3 rounded-[24px] border border-border/60 bg-background/12 p-4 md:grid-cols-2 xl:grid-cols-5">
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
            {["ACCOUNT_UPDATED", "EMPLOYEE_CREATED", "EMPLOYEE_UPDATED", "WORKPLACE_ASSIGNED", "PROJECT_MANAGER_CHANGED", "WAREHOUSE_MANAGER_CHANGED", "SALARY_PAYMENT_RECORDED"].map((value) => (
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
            {["ACCOUNT", "EMPLOYEE", "PROJECT", "WAREHOUSE", "MANAGER_ASSIGNMENT", "PROJECT_ASSIGNMENT", "WAREHOUSE_ASSIGNMENT", "SALARY_PAYMENT"].map((value) => (
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
      </div>

      <div className="overflow-hidden rounded-[28px] border border-border/60">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right font-medium">{t("systemLog.createdAt")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("systemLog.actor")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("systemLog.action")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("systemLog.target")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("systemLog.summary")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("systemLog.details")}</th>
              </tr>
            </thead>
            <tbody>
              {pagedEntries.length > 0 ? (
                pagedEntries.map((entry) => (
                  <tr key={entry.id} className="border-t border-border/60 bg-background/10 align-top">
                    <td className="px-4 py-4 text-right text-muted-foreground">{dateFormatter.format(new Date(entry.createdAt))}</td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{entry.actorLabel ?? t("systemLog.actorUnknown")}</td>
                    <td className="px-4 py-4 text-right text-foreground">{getActionTypeLabel(t, entry.actionType)}</td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{entry.entityLabel ?? t("systemLog.targetUnknown")}</td>
                    <td className="px-4 py-4 text-right font-medium text-foreground">{entry.summary}</td>
                    <td className="px-4 py-4 text-right text-xs leading-6 text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                      {entry.detail ?? "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>
                    {t("systemLog.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
      </div>
    </div>
  )
}
