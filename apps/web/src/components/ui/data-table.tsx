import type { ReactNode } from "react"
import { Button } from "./button"

/** Clamp before slicing so a refetch cannot strand the reader on an empty page. */
export function paginate<T>(rows: readonly T[], requestedPage: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.max(1, Math.min(requestedPage, pages))
  return { page, pages, rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length,
    start: rows.length ? (page - 1) * pageSize + 1 : 0, end: Math.min(page * pageSize, rows.length) }
}

export type PaginationProps = {
  page: number; pages: number; total: number; start: number; end: number
  label: string; previousLabel: string; nextLabel: string; countLabel: string
  onPageChange: (page: number) => void
}

export function Pagination({ page, pages, label, previousLabel, nextLabel, countLabel, onPageChange }: PaginationProps) {
  return <nav aria-label={label} className="mt-4 flex flex-wrap items-center gap-3">
    <Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>{previousLabel}</Button>
    <span role="status" className="text-sm tabular-nums">{countLabel}</span>
    <Button variant="outline" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>{nextLabel}</Button>
  </nav>
}

/** Keeps the real table markup and actions while sharing scroll and paging behavior. */
export function DataTable({ children, label, pagination }: { children: ReactNode; label: string; pagination: PaginationProps }) {
  return <><div className="max-h-96 max-w-full overflow-auto" tabIndex={0} role="region" aria-label={label}>{children}</div><Pagination {...pagination} /></>
}
