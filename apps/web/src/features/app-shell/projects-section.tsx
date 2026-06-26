import { Button } from "@/components/ui/button"
import { getArabicStatusLabel, getStatusTone } from "@/features/shared/status-meta"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
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
import { TablePaginationControls } from "./table-pagination-controls"

export type ProjectRow = {
  id: string
  name: string
  location: string | null
  managerId: string | null
  managerName: string
  notes: string | null
  activeWorkers: number
  status: string
  canArchive: boolean
  archiveDisabledReason: string | null
}

type ProjectsSectionProps = {
  addLabel: string
  archiveLabel: string
  columns: {
    name: string
    manager: string
    location: string
    workers: string
    status: string
    actions: string
  }
  emptyLabel: string
  noLocationLabel: string
  rows: ProjectRow[]
  title: string
  viewLabel: string
  editLabel: string
  onAdd: () => void
  onArchive: (row: ProjectRow) => void
  onEdit: (row: ProjectRow) => void
  onView: (row: ProjectRow) => void
}

/** Projects section with table and CRUD actions. */
export function ProjectsSection({
  addLabel,
  archiveLabel,
  columns,
  emptyLabel,
  noLocationLabel,
  rows,
  title,
  viewLabel,
  editLabel,
  onAdd,
  onArchive,
  onEdit,
  onView,
}: ProjectsSectionProps) {
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
                  <AppShellTableHeaderCell>{columns.location}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{columns.workers}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{columns.status}</AppShellTableHeaderCell>
                  <AppShellTableHeaderCell>{columns.actions}</AppShellTableHeaderCell>
                </tr>
              </AppShellTableHead>
              <tbody>
                {pagedRows.length > 0 ? (
                  pagedRows.map((project) => (
                    <AppShellTableRow key={project.id}>
                      <td className="px-4 py-4 text-start">
                        <div className="min-w-0 max-w-[22rem] space-y-1">
                          <p className="font-medium text-foreground">{project.name}</p>
                          {project.notes ? (
                            <p className="text-xs leading-5 text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                              {project.notes}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{project.managerName}</td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{project.location ?? noLocationLabel}</td>
                      <td className="px-4 py-4 text-start text-foreground">{project.activeWorkers}</td>
                      <td className="px-4 py-4 text-start">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                            getStatusTone(project.status),
                          )}
                        >
                          {getArabicStatusLabel(project.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-start">
                        <AppShellActionGroup>
                          <Button size="xs" variant="outline" onClick={() => onView(project)}>
                            {viewLabel}
                          </Button>
                          <Button size="xs" variant="outline" onClick={() => onEdit(project)}>
                            {editLabel}
                          </Button>
                          <AppShellActionButtonWithReason
                            disabled={!project.canArchive}
                            reason={project.archiveDisabledReason}
                            size="xs"
                            variant="secondary"
                            onClick={() => onArchive(project)}
                          >
                            {archiveLabel}
                          </AppShellActionButtonWithReason>
                        </AppShellActionGroup>
                      </td>
                    </AppShellTableRow>
                  ))
                ) : (
                  <AppShellEmptyStateRow colSpan={6}>{emptyLabel}</AppShellEmptyStateRow>
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
