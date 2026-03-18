import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { getArabicStatusLabel, getStatusTone } from "@/features/shared/status-meta"
import { cn } from "@/lib/utils"

import { SectionHeader } from "./section-header"
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
  description: string
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

export function ProjectsSection({
  addLabel,
  archiveLabel,
  columns,
  description,
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
                <th className="px-4 py-3 text-right font-medium">{columns.location}</th>
                <th className="px-4 py-3 text-right font-medium">{columns.workers}</th>
                <th className="px-4 py-3 text-right font-medium">{columns.status}</th>
                <th className="px-4 py-3 text-right font-medium">{columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.length > 0 ? (
                pagedRows.map((project) => (
                  <tr key={project.id} className="border-t border-border/60 bg-background/10">
                    <td className="px-4 py-4 text-right">
                      <div className="min-w-0 max-w-[22rem] space-y-1">
                        <p className="font-medium text-foreground">{project.name}</p>
                        {project.notes ? (
                          <p className="text-xs leading-5 text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            {project.notes}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{project.managerName}</td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{project.location ?? noLocationLabel}</td>
                    <td className="px-4 py-4 text-right text-foreground">{project.activeWorkers}</td>
                    <td className="px-4 py-4 text-right">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                          getStatusTone(project.status),
                        )}
                      >
                        {getArabicStatusLabel(project.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex flex-wrap justify-start gap-2">
                        <Button size="xs" variant="outline" onClick={() => onView(project)}>
                          {viewLabel}
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => onEdit(project)}>
                          {editLabel}
                        </Button>
                        <Button size="xs" variant="secondary" onClick={() => onArchive(project)}>
                          {archiveLabel}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
            ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>
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
