// @vitest-environment jsdom
import "@/i18n"

import * as React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AppShellActionButtonWithReason,
  AppShellEmptyStateRow,
  AppShellFilterShell,
  AppShellTableFrame,
  AppShellTableHead,
  AppShellTableHeaderCell,
  AppShellTableRow,
  DateRangeFilter,
  usePaginatedRows,
} from "./table-primitives"

afterEach(() => {
  cleanup()
})

/* ─── usePaginatedRows ─── */

function PaginatedHarness({
  rows,
  initialPageSize = 10,
  resetPageDeps = [],
}: {
  rows: string[]
  initialPageSize?: number
  resetPageDeps?: ReadonlyArray<unknown>
}) {
  const { page, pageSize, pagedRows, setPage, setPageSize } = usePaginatedRows({
    rows,
    initialPageSize,
    resetPageDeps,
  })

  return (
    <div>
      <span data-testid="page">{page}</span>
      <span data-testid="pageSize">{pageSize}</span>
      <ul>
        {pagedRows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
      <button type="button" onClick={() => setPage(2)}>
        go-page-2
      </button>
      <button type="button" onClick={() => setPage(3)}>
        go-page-3
      </button>
      <button type="button" onClick={() => setPageSize(3)}>
        page-size-3
      </button>
    </div>
  )
}

const twentyFiveRows = Array.from({ length: 25 }, (_, i) => `row-${i + 1}`)

describe("usePaginatedRows", () => {
  it("slices the first page by the default page size", () => {
    render(<PaginatedHarness rows={twentyFiveRows} />)

    expect(screen.getByTestId("page").textContent).toBe("1")
    expect(screen.getAllByRole("listitem")).toHaveLength(10)
    expect(screen.getByText("row-1")).toBeTruthy()
    expect(screen.queryByText("row-11")).toBeNull()
  })

  it("slices the requested page", () => {
    render(<PaginatedHarness rows={twentyFiveRows} />)

    fireEvent.click(screen.getByText("go-page-2"))

    expect(screen.getByTestId("page").textContent).toBe("2")
    expect(screen.getAllByRole("listitem")).toHaveLength(10)
    expect(screen.getByText("row-11")).toBeTruthy()
    expect(screen.queryByText("row-1")).toBeNull()
  })

  it("clamps the page when rows shrink below the current page", async () => {
    function ShrinkingHarness() {
      const [rows, setRows] = React.useState(twentyFiveRows)
      return (
        <div>
          <button type="button" onClick={() => setRows(rows.slice(0, 5))}>
            shrink-to-5
          </button>
          <PaginatedHarness rows={rows} />
        </div>
      )
    }

    render(<ShrinkingHarness />)
    fireEvent.click(screen.getByText("go-page-3"))
    expect(screen.getByTestId("page").textContent).toBe("3")

    fireEvent.click(screen.getByText("shrink-to-5"))

    // 5 rows / pageSize 10 → max page 1; the clamp effect must land there.
    await waitFor(() => expect(screen.getByTestId("page").textContent).toBe("1"))
    expect(screen.getAllByRole("listitem")).toHaveLength(5)
  })

  it("clamps to the last valid page when rows shrink to a non-divisible boundary", async () => {
    function BoundaryHarness() {
      const [rows, setRows] = React.useState(twentyFiveRows)
      return (
        <div>
          <button type="button" onClick={() => setRows(rows.slice(0, 20))}>
            shrink-to-20
          </button>
          <PaginatedHarness rows={rows} />
        </div>
      )
    }

    render(<BoundaryHarness />)
    // Page 3 (rows 21-25). Shrink to 20 rows → max page 2, so page must land on 2.
    fireEvent.click(screen.getByText("go-page-3"))
    expect(screen.getByTestId("page").textContent).toBe("3")

    fireEvent.click(screen.getByText("shrink-to-20"))

    await waitFor(() => expect(screen.getByTestId("page").textContent).toBe("2"))
  })

  it("lands on page 1 when the rows shrink all the way to empty", async () => {
    function EmptyShrinkHarness() {
      const [rows, setRows] = React.useState(twentyFiveRows)
      return (
        <div>
          <button type="button" onClick={() => setRows([])}>
            shrink-to-empty
          </button>
          <PaginatedHarness rows={rows} />
        </div>
      )
    }

    render(<EmptyShrinkHarness />)
    fireEvent.click(screen.getByText("go-page-3"))
    expect(screen.getByTestId("page").textContent).toBe("3")

    fireEvent.click(screen.getByText("shrink-to-empty"))

    await waitFor(() => expect(screen.getByTestId("page").textContent).toBe("1"))
    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
  })

  it("resets to page 1 when a reset dep changes", async () => {
    function ResetHarness() {
      const [query, setQuery] = React.useState("")
      return (
        <div>
          <button type="button" onClick={() => setQuery(query === "" ? "changed" : "")}>
            change-query
          </button>
          <PaginatedHarness rows={twentyFiveRows} resetPageDeps={[query]} />
        </div>
      )
    }

    render(<ResetHarness />)
    fireEvent.click(screen.getByText("go-page-2"))
    expect(screen.getByTestId("page").textContent).toBe("2")

    fireEvent.click(screen.getByText("change-query"))

    await waitFor(() => expect(screen.getByTestId("page").textContent).toBe("1"))
  })

  it("re-slices when the page size changes", () => {
    render(<PaginatedHarness rows={twentyFiveRows} />)

    fireEvent.click(screen.getByText("page-size-3"))

    expect(screen.getByTestId("pageSize").textContent).toBe("3")
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
  })

  it("handles empty rows without drifting off page 1", () => {
    render(<PaginatedHarness rows={[]} />)

    expect(screen.getByTestId("page").textContent).toBe("1")
    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
  })
})

/* ─── table markup primitives ─── */

describe("AppShell table primitives", () => {
  it("renders header cells as th with scope=col (accessibility)", () => {
    render(
      <table>
        <AppShellTableHead>
          <tr>
            <AppShellTableHeaderCell>الاسم</AppShellTableHeaderCell>
          </tr>
        </AppShellTableHead>
      </table>,
    )

    const header = screen.getByRole("columnheader", { name: "الاسم" })
    expect(header.tagName).toBe("TH")
    expect(header.getAttribute("scope")).toBe("col")
  })

  it("renders the empty state row with the given colSpan", () => {
    render(
      <table>
        <tbody>
          <AppShellEmptyStateRow colSpan={4}>لا توجد بيانات</AppShellEmptyStateRow>
        </tbody>
      </table>,
    )

    const cell = screen.getByText("لا توجد بيانات")
    expect(cell.tagName).toBe("TD")
    expect(cell.getAttribute("colspan")).toBe("4")
  })

  it("forwards onClick to table rows", () => {
    const onClick = vi.fn()

    render(
      <table>
        <tbody>
          <AppShellTableRow onClick={onClick}>
            <td>cell</td>
          </AppShellTableRow>
        </tbody>
      </table>,
    )

    fireEvent.click(screen.getByRole("row"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("keeps RTL layout on the table frame and filter shell", () => {
    const { container } = render(
      <div>
        <AppShellTableFrame>
          <table />
        </AppShellTableFrame>
        <AppShellFilterShell>
          <label>filter</label>
        </AppShellFilterShell>
      </div>,
    )

    const frame = container.querySelector("div[dir='rtl']") as HTMLElement
    const filterShell = container.querySelector("div[dir='rtl'] ~ div[dir='rtl']") as HTMLElement
    expect(frame).not.toBeNull()
    expect(filterShell).not.toBeNull()
  })
})

/* ─── filter primitives ─── */

describe("DateRangeFilter", () => {
  it("renders both labels and two date picker triggers", () => {
    const onFrom = vi.fn()
    const onTo = vi.fn()

    render(
      <DateRangeFilter
        fromLabel="من تاريخ"
        toLabel="إلى تاريخ"
        fromDate=""
        toDate=""
        onFromDateChange={onFrom}
        onToDateChange={onTo}
      />,
    )

    expect(screen.getByText("من تاريخ")).toBeTruthy()
    expect(screen.getByText("إلى تاريخ")).toBeTruthy()
    // Two DatePicker trigger buttons (placeholders render inside them).
    expect(screen.getAllByRole("button")).toHaveLength(2)
  })

  it("emits the picked day as canonical yyyy-MM-dd, not the dd/MM/yyyy display (#428)", () => {
    const onFrom = vi.fn()

    render(
      <DateRangeFilter
        fromLabel="من تاريخ"
        toLabel="إلى تاريخ"
        fromDate="2026-10-01"
        toDate=""
        onFromDateChange={onFrom}
        onToDateChange={vi.fn()}
      />,
    )

    const trigger = document.querySelector<HTMLElement>('[data-slot="popover-trigger"]')
    expect(trigger).not.toBeNull()
    fireEvent.click(trigger!)
    const cell = document.querySelector('[data-day="2026-10-15"]')
    expect(cell).not.toBeNull()
    fireEvent.click(cell!.querySelector("button")!)

    expect(onFrom).toHaveBeenCalledWith("2026-10-15")
  })
})

/* ─── action buttons ─── */

describe("AppShellActionButtonWithReason", () => {
  it("renders a plain enabled button when not disabled", () => {
    const onClick = vi.fn()

    render(
      <AppShellActionButtonWithReason
        disabled={false}
        reason={null}
        size="xs"
        variant="outline"
        onClick={onClick}
      >
        حذف
      </AppShellActionButtonWithReason>,
    )

    const button = screen.getByRole("button", { name: "حذف" }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("renders a disabled button wrapped in a tooltip trigger when disabled with a reason", () => {
    const { container } = render(
      <AppShellActionButtonWithReason
        disabled
        reason="لا يمكن الحذف"
        size="xs"
        variant="outline"
        onClick={vi.fn()}
      >
        حذف
      </AppShellActionButtonWithReason>,
    )

    const button = screen.getByRole("button", { name: "حذف" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    // The button lives inside a tooltip trigger slot so the reason is discoverable.
    expect(container.querySelector("[data-slot='tooltip-trigger']")).not.toBeNull()
  })

  it("does not wrap in a tooltip when disabled but no reason is given", () => {
    const { container } = render(
      <AppShellActionButtonWithReason
        disabled
        reason={null}
        size="xs"
        variant="outline"
        onClick={vi.fn()}
      >
        حذف
      </AppShellActionButtonWithReason>,
    )

    expect(container.querySelector("[data-slot='tooltip-trigger']")).toBeNull()
    expect((screen.getByRole("button", { name: "حذف" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
