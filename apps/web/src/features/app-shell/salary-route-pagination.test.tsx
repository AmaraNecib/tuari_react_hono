// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useSalaryRoutePagination } from "./salary-route-pagination"

function PaginationProbe({ rows, loaded, onPageChange }: {
  rows: string[]
  loaded: boolean
  onPageChange: (page: number) => void
}) {
  const pagination = useSalaryRoutePagination(rows, {
    page: 4,
    pageSize: 10,
    onPageChange,
    onPageSizeChange: vi.fn(),
  }, loaded)
  return <div><output>{pagination.page}</output>{pagination.pagedRows.map((row) => <span key={row}>{row}</span>)}</div>
}

describe("salary route pagination", () => {
  it("does not clamp a direct URL during transient loading, then clamps to loaded rows", async () => {
    const onPageChange = vi.fn()
    const view = render(<PaginationProbe rows={[]} loaded={false} onPageChange={onPageChange} />)

    expect(screen.getByText("4")).toBeTruthy()
    expect(onPageChange).not.toHaveBeenCalled()

    view.rerender(<PaginationProbe rows={Array.from({ length: 11 }, (_, index) => `row-${index + 1}`)} loaded onPageChange={onPageChange} />)

    await waitFor(() => expect(onPageChange).toHaveBeenCalledWith(2))
    expect(screen.getByText("2")).toBeTruthy()
    expect(screen.getByText("row-11")).toBeTruthy()
  })
})
