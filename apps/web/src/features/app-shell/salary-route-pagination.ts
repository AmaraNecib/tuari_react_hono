import { useEffect, useMemo } from "react"

import { usePaginatedRows } from "@/features/shared/table-primitives"

export type SalaryRoutePagination = {
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function useSalaryRoutePagination<T>(
  rows: T[],
  pagination?: SalaryRoutePagination,
  dataLoaded = true,
  resetPageDeps: ReadonlyArray<unknown> = [],
) {
  const local = usePaginatedRows({ rows, initialPageSize: pagination?.pageSize ?? 10, resetPageDeps })
  const pageSize = pagination?.pageSize ?? local.pageSize
  const requestedPage = pagination?.page ?? local.page
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = pagination && dataLoaded ? Math.min(requestedPage, totalPages) : requestedPage
  const pagedRows = useMemo(
    () => pagination ? rows.slice((page - 1) * pageSize, page * pageSize) : local.pagedRows,
    [local.pagedRows, page, pageSize, pagination, rows],
  )

  useEffect(() => {
    if (pagination && dataLoaded && requestedPage > totalPages) {
      pagination.onPageChange(totalPages)
    }
  }, [dataLoaded, pagination, requestedPage, totalPages])

  return {
    page,
    pageSize,
    pagedRows,
    setPage: pagination?.onPageChange ?? local.setPage,
    setPageSize: pagination?.onPageSizeChange ?? ((nextPageSize: number) => {
      local.setPage(1)
      local.setPageSize(nextPageSize)
    }),
  }
}
