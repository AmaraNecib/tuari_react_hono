// @vitest-environment jsdom
import "@/i18n"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TablePaginationControls } from "./table-pagination-controls"

afterEach(() => {
  cleanup()
})

/**
 * Tests for TablePaginationControls — the page-based pagination bar used by
 * projects, warehouses, system log, audit, debts hub, externals, and
 * inventory invoices. Pins the behavior preserved by the #243 collapse:
 * range copy from the `tables.range` i18n key, disable logic, page-size
 * presets, and callback wiring.
 */
describe("TablePaginationControls", () => {
  it("renders the range copy from the tables.range i18n key", () => {
    render(
      <TablePaginationControls
        page={1}
        pageSize={10}
        totalCount={100}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByText("1-10 من 100")).toBeTruthy()
  })

  it("shows a zero range when there are no rows", () => {
    render(
      <TablePaginationControls
        page={1}
        pageSize={10}
        totalCount={0}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByText("0-0 من 0")).toBeTruthy()
  })

  it("disables Previous on the first page", () => {
    render(
      <TablePaginationControls
        page={1}
        pageSize={10}
        totalCount={100}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    const previous = screen.getByRole("button", { name: "السابق" }) as HTMLButtonElement
    expect(previous.disabled).toBe(true)
    expect((screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("disables Next on the last page", () => {
    render(
      <TablePaginationControls
        page={10}
        pageSize={10}
        totalCount={100}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    const next = screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    expect((screen.getByRole("button", { name: "السابق" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("shows the current page over the total page count", () => {
    render(
      <TablePaginationControls
        page={3}
        pageSize={25}
        totalCount={100}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByText("3 / 4")).toBeTruthy()
  })

  it("shows a partial range on the last page (non-divisible total)", () => {
    render(
      <TablePaginationControls
        page={3}
        pageSize={10}
        totalCount={25}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByText("21-25 من 25")).toBeTruthy()
  })

  it("disables Next on a partial last page", () => {
    render(
      <TablePaginationControls
        page={3}
        pageSize={10}
        totalCount={25}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    const next = screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    expect((screen.getByRole("button", { name: "السابق" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("calls onPageChange with the next page", () => {
    const onPageChange = vi.fn()

    render(
      <TablePaginationControls
        page={2}
        pageSize={10}
        totalCount={100}
        onPageChange={onPageChange}
        onPageSizeChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(onPageChange).toHaveBeenCalledWith(3)

    fireEvent.click(screen.getByRole("button", { name: "السابق" }))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it("offers the fixed page-size presets 10/25/50/100", () => {
    render(
      <TablePaginationControls
        page={1}
        pageSize={10}
        totalCount={100}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    const select = screen.getByRole("combobox") as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["10", "25", "50", "100"])
  })

  it("reflects the current pageSize and fires onPageSizeChange", () => {
    const onPageSizeChange = vi.fn()

    render(
      <TablePaginationControls
        page={1}
        pageSize={25}
        totalCount={100}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
      />,
    )

    const select = screen.getByRole("combobox") as HTMLSelectElement
    expect(select.value).toBe("25")

    fireEvent.change(select, { target: { value: "50" } })
    expect(onPageSizeChange).toHaveBeenCalledWith(50)
  })
})
