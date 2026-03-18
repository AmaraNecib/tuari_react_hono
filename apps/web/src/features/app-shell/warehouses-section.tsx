import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getArabicStatusLabel, getStatusTone } from "@/features/shared/status-meta"
import { cn } from "@/lib/utils"

import { SectionHeader } from "./section-header"
import { TablePaginationControls } from "./table-pagination-controls"

export type WarehouseRow = {
  id: string
  name: string
  address: string | null
  managerId: string | null
  managerName: string
  notes: string | null
  status: string
  canArchive: boolean
  archiveDisabledReason: string | null
}

type WarehousesSectionProps = {
  addLabel: string
  archiveLabel: string
  columns: {
    name: string
    manager: string
    address: string
    status: string
    actions: string
  }
  description: string
  emptyLabel: string
  noAddressLabel: string
  rows: WarehouseRow[]
  title: string
  viewLabel: string
  editLabel: string
  onAdd: () => void
  onArchive: (row: WarehouseRow) => void
  onEdit: (row: WarehouseRow) => void
  onView: (row: WarehouseRow) => void
}

export function WarehousesSection({
  addLabel,
  archiveLabel,
  columns,
  description,
  emptyLabel,
  noAddressLabel,
  rows,
  title,
  viewLabel,
  editLabel,
  onAdd,
  onArchive,
  onEdit,
  onView,
}: WarehousesSectionProps) {
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
    <div className="space-y-6">
      <SectionHeader
        action={<Button onClick={onAdd}>{addLabel}</Button>}
        description={description}
        title={title}
      />
      <div className="overflow-hidden rounded-[28px] border border-border/60">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right font-medium">{columns.name}</th>
                <th className="px-4 py-3 text-right font-medium">{columns.manager}</th>
                <th className="px-4 py-3 text-right font-medium">{columns.address}</th>
                <th className="px-4 py-3 text-right font-medium">{columns.status}</th>
                <th className="px-4 py-3 text-right font-medium">{columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.length > 0 ? (
                pagedRows.map((warehouse) => (
                  <tr key={warehouse.id} className="border-t border-border/60 bg-background/10">
                    <td className="px-4 py-4 text-right">
                      <div className="min-w-0 max-w-[22rem] space-y-1">
                        <p className="font-medium text-foreground">{warehouse.name}</p>
                        {warehouse.notes ? (
                          <p className="text-xs leading-5 text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            {warehouse.notes}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{warehouse.managerName}</td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{warehouse.address ?? noAddressLabel}</td>
                    <td className="px-4 py-4 text-right">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                          getStatusTone(warehouse.status),
                        )}
                      >
                        {getArabicStatusLabel(warehouse.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex flex-wrap justify-start gap-2">
                        <Button size="xs" variant="outline" onClick={() => onView(warehouse)}>
                          {viewLabel}
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => onEdit(warehouse)}>
                          {editLabel}
                        </Button>
                        <ActionButtonWithReason
                          disabled={!warehouse.canArchive}
                          reason={warehouse.archiveDisabledReason}
                          size="xs"
                          variant="secondary"
                          onClick={() => onArchive(warehouse)}
                        >
                          {archiveLabel}
                        </ActionButtonWithReason>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>
                    {emptyLabel}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
  variant: "secondary"
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
