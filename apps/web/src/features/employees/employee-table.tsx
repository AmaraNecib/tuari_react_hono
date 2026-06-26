import { useState } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import {
  AppShellActionButtonWithReason,
  AppShellActionGroup,
  AppShellEmptyStateRow,
  AppShellTableFrame,
  AppShellTableHead,
  AppShellTableHeaderCell,
  AppShellTableRow,
} from "@/features/app-shell/app-shell-table-primitives"
import { getArabicStatusLabel, getStatusTone } from "@/features/shared/status-meta"
import { AddSalaryPaymentDialog } from "./add-salary-payment-dialog"

export type EmployeeTableRow = {
  id: string
  firstName: string
  lastName: string
  name: string
  roleId: string
  roleKey: string
  role: string
  phone: string
  status: "ACTIVE" | "INACTIVE" | "LEFT"
  salaryAmountDzd: number | null
  salaryPeriod: "DAILY" | "WEEKLY" | "MONTHLY" | null
  managerName: string
  managerAssignmentId: string | null
  currentManagerId: string | null
  currentProjectId: string | null
  currentProjectAssignmentId: string | null
  currentWarehouseId: string | null
  currentWarehouseAssignmentId: string | null
  currentWorkplace: string
  notes: string | null
  isWorker: boolean
  canDelete: boolean
  canLeave: boolean
  deleteDisabledReason: string | null
  leaveDisabledReason: string | null
  createdAt: string
  updatedAt: string
}

type EmployeeTableCopy = {
  name: string
  role: string
  manager: string
  project: string
  phone: string
  status: string
  actions: string
  empty: string
  view: string
  edit: string
  leave: string
  delete: string
}

type EmployeeTableProps = {
  copy: EmployeeTableCopy
  rows: EmployeeTableRow[]
  onDelete: (row: EmployeeTableRow) => void
  onEdit: (row: EmployeeTableRow) => void
  onLeave: (row: EmployeeTableRow) => void
  onView: (row: EmployeeTableRow) => void
}

export function EmployeeTable({ copy, rows, onDelete, onEdit, onLeave, onView }: EmployeeTableProps) {
  const { t } = useTranslation()
  // rows are already paginated by the parent (cursor-based pagination)
  const [paymentTarget, setPaymentTarget] = useState<{ id: string; name: string } | null>(null)

  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <AddSalaryPaymentDialog
        employeeId={paymentTarget?.id ?? null}
        employeeName={paymentTarget?.name}
        open={paymentTarget !== null}
        onOpenChange={(open) => { if (!open) setPaymentTarget(null) }}
      />
      <AppShellTableFrame className="rounded-none border-0">
        <table className="min-w-full text-sm">
          <AppShellTableHead>
            <tr>
              <AppShellTableHeaderCell>{copy.name}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{copy.role}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{copy.manager}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{copy.project}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{copy.phone}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{copy.status}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{copy.actions}</AppShellTableHeaderCell>
            </tr>
          </AppShellTableHead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <AppShellTableRow key={row.id} className="align-middle">
                  <td className="px-4 py-4 text-start">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground" dir="auto">
                        {row.name}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-start text-muted-foreground">{row.role}</td>
                  <td className="px-4 py-4 text-start text-muted-foreground" dir="auto">
                    {row.managerName}
                  </td>
                  <td className="px-4 py-4 text-start text-muted-foreground" dir="auto">
                    {row.currentWorkplace}
                  </td>
                  <td className="px-4 py-4 text-start text-foreground">
                    <bdi className="inline-block min-w-[10ch] text-start" dir="ltr">
                      {row.phone}
                    </bdi>
                  </td>
                  <td className="px-4 py-4 text-start">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                        getStatusTone(row.status),
                      )}
                    >
                      {getArabicStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-start">
                    <AppShellActionGroup>
                      {row.isWorker && row.status === "ACTIVE" ? (
                        <Button
                          size="xs"
                          onClick={() => setPaymentTarget({ id: row.id, name: row.name })}
                        >
                          {t("salaries.addPayment")}
                        </Button>
                      ) : null}
                      <Button size="xs" variant="outline" onClick={() => onView(row)}>
                        {copy.view}
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => onEdit(row)}>
                        {copy.edit}
                      </Button>
                      <AppShellActionButtonWithReason
                        disabled={!row.canLeave}
                        reason={row.leaveDisabledReason}
                        size="xs"
                        variant="secondary"
                        onClick={() => onLeave(row)}
                      >
                        {copy.leave}
                      </AppShellActionButtonWithReason>
                      <AppShellActionButtonWithReason
                        disabled={!row.canDelete}
                        reason={row.deleteDisabledReason}
                        size="xs"
                        variant="destructive"
                        onClick={() => onDelete(row)}
                      >
                        {copy.delete}
                      </AppShellActionButtonWithReason>
                    </AppShellActionGroup>
                  </td>
                </AppShellTableRow>
              ))
            ) : (
              <AppShellEmptyStateRow colSpan={7}>{copy.empty}</AppShellEmptyStateRow>
            )}
          </tbody>
        </table>
      </AppShellTableFrame>
    </div>
  )
}
