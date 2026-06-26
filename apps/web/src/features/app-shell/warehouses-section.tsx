import { Button } from "@/components/ui/button"
import { getArabicStatusLabel, getStatusTone } from "@/features/shared/status-meta"
import { cn } from "@/lib/utils"

import {
  AppShellActionButtonWithReason,
  AppShellActionGroup,
  AppShellEmptyStateRow,
  AppShellTableFrame,
  AppShellTableHead,
  AppShellTableHeaderCell,
  AppShellTableRow,
  usePaginatedRows,
} from "./app-shell-table-primitives"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
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

/** Warehouses section with table and CRUD actions. */
export function WarehousesSection({
  addLabel,
  archiveLabel,
  columns,
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
  const { page, pageSize, pagedRows, setPage, setPageSize } = usePaginatedRows({ rows })

  return (
    <RecordPageFrame
      title={title}
      action={<Button size="lg" onClick={onAdd}>{addLabel}</Button>}
    >
      <AppShellTableFrame>
            <table className="min-w-full text-sm">
              <AppShellTableHead>
                <tr>
                  <AppShellTableHeaderCell>{columns.name}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{columns.manager}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{columns.address}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{columns.status}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{columns.actions}</AppShellTableHeaderCell>
                </tr>
              </AppShellTableHead>
              <tbody>
                {pagedRows.length > 0 ? (
                  pagedRows.map((warehouse) => (
                    <AppShellTableRow key={warehouse.id}>
                      <td className="px-4 py-4 text-start">
                        <div className="min-w-0 max-w-[22rem] space-y-1">
                          <p className="font-medium text-foreground">{warehouse.name}</p>
                          {warehouse.notes ? (
                            <p className="text-xs leading-5 text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                              {warehouse.notes}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{warehouse.managerName}</td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{warehouse.address ?? noAddressLabel}</td>
                      <td className="px-4 py-4 text-start">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                            getStatusTone(warehouse.status),
                          )}
                        >
                          {getArabicStatusLabel(warehouse.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-start">
                        <AppShellActionGroup>
                          <Button size="xs" variant="outline" onClick={() => onView(warehouse)}>
                            {viewLabel}
                          </Button>
                          <Button size="xs" variant="outline" onClick={() => onEdit(warehouse)}>
                            {editLabel}
                          </Button>
                          <AppShellActionButtonWithReason
                            disabled={!warehouse.canArchive}
                            reason={warehouse.archiveDisabledReason}
                            size="xs"
                            variant="secondary"
                            onClick={() => onArchive(warehouse)}
                          >
                            {archiveLabel}
                          </AppShellActionButtonWithReason>
                        </AppShellActionGroup>
                      </td>
                    </AppShellTableRow>
                  ))
                ) : (
                  <AppShellEmptyStateRow colSpan={5}>{emptyLabel}</AppShellEmptyStateRow>
                )}
              </tbody>
            </table>
        </AppShellTableFrame>
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
    </RecordPageFrame>
  )
}
