// @vitest-environment jsdom
import "@/i18n"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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
function getPageSizeSelect() {
  return (screen.getAllByRole("combobox") as HTMLSelectElement[]).find(
    (select) => Array.from(select.options).map((option) => option.value).join(",") === "10,25,50,100",
  )!
}

beforeEach(() => {
  mocks.itemDefinitionsQuery.mockReturnValue({ data: { items: FIXTURE } })
  mocks.createMutation.mutateAsync.mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
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

    for (let step = 0; step < 3; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    }

    expect(screen.getByText("31-34 من 34")).toBeTruthy()
    expect(screen.getByText("4 / 4")).toBeTruthy()
    expect((screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("changes the page size and returns to the first page", () => {
    render(<InventoryItemDefinitionsPage />)

    fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    expect(screen.getByText("2 / 4")).toBeTruthy()

    fireEvent.change(getPageSizeSelect(), { target: { value: "25" } })

    expect(screen.getByText("1 / 2")).toBeTruthy()
    expect(screen.getByText("1-25 من 34")).toBeTruthy()
    expect(screen.getByText("عنصر 25")).toBeTruthy()
    expect(screen.queryByText("عنصر 26")).toBeNull()
  })

  it("clamps the page when the underlying list shrinks under the user", () => {
    const { rerender } = render(<InventoryItemDefinitionsPage />)

    for (let step = 0; step < 3; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "التالي" }))
    }
    expect(screen.getByText("4 / 4")).toBeTruthy()

    mocks.itemDefinitionsQuery.mockReturnValue({ data: { items: makeItems(12) } })
    rerender(<InventoryItemDefinitionsPage />)

    expect(screen.getByText("2 / 2")).toBeTruthy()
    expect(screen.getByText("11-12 من 12")).toBeTruthy()
    expect(screen.getByText("عنصر 11")).toBeTruthy()
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
