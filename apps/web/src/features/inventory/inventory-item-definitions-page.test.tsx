// @vitest-environment jsdom
import "@/i18n"

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { InventoryItemDefinitionsPage } from "./inventory-item-definitions-page"

const mocks = vi.hoisted(() => ({
  itemDefinitionsQuery: vi.fn(),
  createMutation: { isPending: false, mutateAsync: vi.fn() },
}))

vi.mock("./inventory-hooks", () => ({
  useInventoryItemDefinitionsQuery: () => mocks.itemDefinitionsQuery(),
  useCreateInventoryItemDefinitionMutation: () => mocks.createMutation,
}))

/** A catalog large enough to span several pages (the owner expects hundreds). */
function makeItems(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `def-${String(index + 1).padStart(2, "0")}`,
    name: `عنصر ${String(index + 1).padStart(2, "0")}`,
    itemType: "CONSUMABLE" as const,
    unit: "قطعة",
    description: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }))
}

const FIXTURE = makeItems(34)

/** The page-size select is the control with the 10/25/50/100 presets. */
function getPageSizeSelect(): HTMLSelectElement | undefined {
  return (screen.getAllByRole("combobox") as HTMLSelectElement[]).find(
    (select) => Array.from(select.options).map((option) => option.value).join(",") === "10,25,50,100",
  )
}

function goToLastPage() {
  for (let step = 0; step < 3; step += 1) {
    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
  }
}

beforeEach(() => {
  mocks.itemDefinitionsQuery.mockReturnValue({ data: { items: FIXTURE } })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

/**
 * Tests for InventoryItemDefinitionsPage pagination — the catalog must window
 * its rows through the shared `usePaginatedRows` + `TablePaginationControls`
 * primitives instead of rendering every definition.
 */
describe("InventoryItemDefinitionsPage pagination", () => {
  it("renders only the first page of rows with the shared range copy", () => {
    render(<InventoryItemDefinitionsPage />)

    expect(screen.getByText("عنصر 01")).toBeTruthy()
    expect(screen.getByText("عنصر 10")).toBeTruthy()
    expect(screen.queryByText("عنصر 11")).toBeNull()
    expect(screen.getByText("1-10 من 34")).toBeTruthy()
    expect(screen.getByText("1 / 4")).toBeTruthy()
    // Header row + exactly the 10 windowed body rows: an off-by-one that leaked
    // rows from the next page would slip past the name assertions.
    expect(screen.getAllByRole("row")).toHaveLength(11)
  })

  it("navigates forward and back between pages", () => {
    render(<InventoryItemDefinitionsPage />)

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("11-20 من 34")).toBeTruthy()
    expect(screen.getByText("2 / 4")).toBeTruthy()
    expect(screen.getByText("عنصر 11")).toBeTruthy()
    expect(screen.queryByText("عنصر 01")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "السابق" }))
    expect(screen.getByText("1-10 من 34")).toBeTruthy()
    expect(screen.getByText("عنصر 01")).toBeTruthy()
  })

  it("disables Previous on the first page and Next on the last page", () => {
    render(<InventoryItemDefinitionsPage />)

    expect((screen.getByRole("button", { name: "السابق" }) as HTMLButtonElement).disabled).toBe(true)

    goToLastPage()

    expect(screen.getByText("31-34 من 34")).toBeTruthy()
    expect(screen.getByText("4 / 4")).toBeTruthy()
    expect((screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("changes the page size and returns to the first page", () => {
    render(<InventoryItemDefinitionsPage />)

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 4")).toBeTruthy()

    fireEvent.change(getPageSizeSelect()!, { target: { value: "25" } })

    expect(screen.getByText("1 / 2")).toBeTruthy()
    expect(screen.getByText("1-25 من 34")).toBeTruthy()
    expect(screen.getByText("عنصر 25")).toBeTruthy()
    expect(screen.queryByText("عنصر 26")).toBeNull()
  })

  it("keeps the page-size selector reachable after a size collapses the catalog to one page", () => {
    render(<InventoryItemDefinitionsPage />)

    // 50 >= 34: the size control lives inside the bar, so hiding the bar at
    // one page would strand the operator at 50 rows with no way back to 10.
    fireEvent.change(getPageSizeSelect()!, { target: { value: "50" } })

    expect(getPageSizeSelect()?.value).toBe("50")
    expect(screen.getByText("1-34 من 34")).toBeTruthy()
    expect(screen.getByText("1 / 1")).toBeTruthy()
    expect((screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "السابق" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("shows every row and no navigation when the catalog is exactly one page", () => {
    mocks.itemDefinitionsQuery.mockReturnValue({ data: { items: makeItems(10) } })

    render(<InventoryItemDefinitionsPage />)

    expect(screen.getByText("عنصر 01")).toBeTruthy()
    expect(screen.getByText("عنصر 10")).toBeTruthy()
    expect(screen.getAllByRole("row")).toHaveLength(11)
    expect(screen.getByText("1-10 من 10")).toBeTruthy()
    expect((screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement).disabled).toBe(true)
    expect(getPageSizeSelect()).toBeTruthy()
  })

  it("clamps the page when the underlying list shrinks under the user", () => {
    const { rerender } = render(<InventoryItemDefinitionsPage />)

    goToLastPage()
    expect(screen.getByText("4 / 4")).toBeTruthy()

    mocks.itemDefinitionsQuery.mockReturnValue({ data: { items: makeItems(12) } })
    rerender(<InventoryItemDefinitionsPage />)

    expect(screen.getByText("2 / 2")).toBeTruthy()
    expect(screen.getByText("11-12 من 12")).toBeTruthy()
    expect(screen.getByText("عنصر 11")).toBeTruthy()
  })

  it("clamps to the first page when the list shrinks below a single page", () => {
    const { rerender } = render(<InventoryItemDefinitionsPage />)

    goToLastPage()
    expect(screen.getByText("4 / 4")).toBeTruthy()

    mocks.itemDefinitionsQuery.mockReturnValue({ data: { items: makeItems(3) } })
    rerender(<InventoryItemDefinitionsPage />)

    expect(screen.getByText("1 / 1")).toBeTruthy()
    expect(screen.getByText("1-3 من 3")).toBeTruthy()
    expect(screen.getByText("عنصر 01")).toBeTruthy()
  })

  it("follows a newly created definition to the page it lands on", async () => {
    const created = { ...makeItems(1)[0], id: "def-new", name: "أ عنصر جديد" }
    mocks.createMutation.mutateAsync.mockResolvedValue({ item: created, message: "تم" })

    const { rerender } = render(<InventoryItemDefinitionsPage />)

    goToLastPage()
    expect(screen.getByText("4 / 4")).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/اسم العنصر/), { target: { value: created.name } })
    fireEvent.change(screen.getByLabelText(/وحدة القياس/), { target: { value: "قطعة" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "إنشاء التعريف" }))
    })

    // The refetch inserts the new row in name order, at the top of page 1.
    mocks.itemDefinitionsQuery.mockReturnValue({ data: { items: [created, ...FIXTURE] } })
    rerender(<InventoryItemDefinitionsPage />)

    await waitFor(() => expect(screen.getByText("أ عنصر جديد")).toBeTruthy())
    expect(screen.getByText("1 / 4")).toBeTruthy()
  })

  it("keeps the empty state and hides pagination when there are no items", () => {
    mocks.itemDefinitionsQuery.mockReturnValue({ data: { items: [] } })

    render(<InventoryItemDefinitionsPage />)

    expect(screen.getByText("لا توجد تعريفات عناصر حتى الآن.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "التالي" })).toBeNull()
    expect(screen.queryByRole("button", { name: "السابق" })).toBeNull()
    expect(getPageSizeSelect()).toBeUndefined()
  })
})
