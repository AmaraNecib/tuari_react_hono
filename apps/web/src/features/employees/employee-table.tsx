import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getArabicStatusLabel, getStatusTone } from "@/features/shared/status-meta"
import { cn } from "@/lib/utils"

import { TablePaginationControls } from "@/features/app-shell/table-pagination-controls"

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
  projectName: string
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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const pagedRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, rows])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(rows.length / pageSize))
    if (page > maxPage) {
      setPage(maxPage)
    }
  }, [page, pageSize, rows.length])

  return (
    <div className="overflow-hidden rounded-[28px] border border-border/60">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-right font-medium">{copy.name}</th>
              <th className="px-4 py-3 text-right font-medium">{copy.role}</th>
              <th className="px-4 py-3 text-right font-medium">{copy.manager}</th>
              <th className="px-4 py-3 text-right font-medium">{copy.project}</th>
              <th className="px-4 py-3 text-right font-medium">{copy.phone}</th>
              <th className="px-4 py-3 text-right font-medium">{copy.status}</th>
              <th className="px-4 py-3 text-right font-medium">{copy.actions}</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length > 0 ? (
              pagedRows.map((row) => (
                <tr key={row.id} className="border-t border-border/60 bg-background/10 align-middle">
                  <td className="px-4 py-4 text-right">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground" dir="auto">
                        {row.name}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right text-muted-foreground">{row.role}</td>
                  <td className="px-4 py-4 text-right text-muted-foreground" dir="auto">
                    {row.managerName}
                  </td>
                  <td className="px-4 py-4 text-right text-muted-foreground" dir="auto">
                    {row.projectName}
                  </td>
                  <td className="px-4 py-4 text-right text-foreground">
                    <span className="inline-block min-w-[10ch] text-right" dir="ltr">
                      {row.phone}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                        getStatusTone(row.status),
                      )}
                    >
                        {getArabicStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex flex-wrap justify-start gap-2">
                      <Button size="xs" variant="outline" onClick={() => onView(row)}>
                        {copy.view}
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => onEdit(row)}>
                        {copy.edit}
                      </Button>
                      <ActionButtonWithReason
                        disabled={!row.canLeave}
                        reason={row.leaveDisabledReason}
                        size="xs"
                        variant="secondary"
                        onClick={() => onLeave(row)}
                      >
                        {copy.leave}
                      </ActionButtonWithReason>
                      <ActionButtonWithReason
                        disabled={!row.canDelete}
                        reason={row.deleteDisabledReason}
                        size="xs"
                        variant="destructive"
                        onClick={() => onDelete(row)}
                      >
                        {copy.delete}
                      </ActionButtonWithReason>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-6 text-center text-muted-foreground" colSpan={7}>
                  {copy.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <TablePaginationControls
        page={page}
        pageSize={pageSize}
        totalCount={rows.length}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPage(1)
          setPageSize(nextPageSize)
        }}
      />
    </div>
  )
}

function ActionButtonWithReason({
  children,
  disabled,
  reason,
  onClick,
  size,
  variant,
}: {
  children: ReactNode
  disabled: boolean
  reason: string | null
  onClick: () => void
  size: "xs"
  variant: "secondary" | "destructive"
}) {
  const button = (
    <span className="inline-flex">
      <Button disabled={disabled} size={size} variant={variant} onClick={onClick}>
        {children}
      </Button>
    </span>
  )

  if (!disabled || !reason) {
    return button
  }

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="top">{reason}</TooltipContent>
    </Tooltip>
  )
}
