// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OutboundTransferCreatePage } from "./outbound-transfer-create-page"

const mocks = vi.hoisted(() => ({
  /** Every `useItemDefinitionOptionsQuery` usage, in render order. */
  usageCalls: [] as Array<{
    surface: string
    source?: { locationType: string; warehouseId?: string; projectId?: string }
  }>,
  definitions: [
    { id: "cement", name: "إسمنت", itemType: "CONSUMABLE", isActive: true, stockWarehouseId: "wh-1" },
    { id: "archived", name: "جير", itemType: "CONSUMABLE", isActive: false, stockWarehouseId: "wh-1" },
    { id: "elsewhere", name: "رمل", itemType: "CONSUMABLE", isActive: true, stockWarehouseId: "wh-2" },
    { id: "project-item", name: "حصى", itemType: "CONSUMABLE", isActive: true, stockProjectId: "prj-1" },
  ] as Array<{
    id: string
    name: string
    itemType: string
    isActive: boolean
    stockWarehouseId?: string
    stockProjectId?: string
  }>,
  warehousesQuery: vi.fn(),
  projectsQuery: vi.fn(),
  counterpartiesQuery: vi.fn(),
  createTransferMutation: { isPending: false, mutateAsync: vi.fn() },
}))

vi.mock("@/lib/toast", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

/**
 * Mirrors the availability rule the server applies, so the test proves the page
 * asks for OUTBOUND_PICK at the chosen source AND offers only what that read
 * returns: an archived definition is never offered, one stocked elsewhere is
 * not offered here, and the in-stock one is.
 */
vi.mock("./inventory-hooks", () => ({
  useItemDefinitionOptionsQuery: (options: {
    usage: { surface: string; source?: { locationType: string; warehouseId?: string; projectId?: string } }
  }) => {
    mocks.usageCalls.push(options.usage)
    const source = options.usage.source
    const offered = mocks.definitions.filter((definition) => {
      if (!definition.isActive) return false
      if (source?.locationType === "WAREHOUSE") return definition.stockWarehouseId === source.warehouseId
      if (source?.locationType === "PROJECT") return definition.stockProjectId === source.projectId
      return false
    })
    return { options: offered, fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false }
  },
  useInventoryWarehousesQuery: () => mocks.warehousesQuery(),
  useInventoryProjectsQuery: () => mocks.projectsQuery(),
  useInventoryExternalCounterpartiesQuery: () => mocks.counterpartiesQuery(),
  useCreateOutboundTransferMutation: () => mocks.createTransferMutation,
}))

beforeEach(() => {
  mocks.usageCalls.length = 0
  mocks.warehousesQuery.mockReturnValue({
    data: { items: [{ id: "wh-1", name: "المستودع الأول" }, { id: "wh-2", name: "المستودع الثاني" }] },
  })
  mocks.projectsQuery.mockReturnValue({ data: { items: [{ id: "prj-1", name: "مشروع التوسعة" }] } })
  mocks.counterpartiesQuery.mockReturnValue({ data: { items: [{ id: "cp-1", fullName: "مورد" }] } })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** The page's own selects, in DOM order: source type, source, counterparty, transfer type. */
function pageSelects(): HTMLSelectElement[] {
  return screen.getAllByRole("combobox").slice(0, 4) as HTMLSelectElement[]
}

describe("OutboundTransferCreatePage item selection", () => {
  it("asks for no item options until a source is chosen", () => {
    render(<OutboundTransferCreatePage onBack={vi.fn()} />)

    expect(screen.queryByRole("button", { name: /إضافة عنصر/ })).toBeNull()
    expect(screen.getByText("اختر الموقع الأصلي أولًا ثم أضف العناصر المتوفرة فيه")).toBeTruthy()
    expect(mocks.usageCalls).toHaveLength(0)
  })

  it("asks the paged read for OUTBOUND_PICK at the chosen warehouse", () => {
    render(<OutboundTransferCreatePage onBack={vi.fn()} />)

    fireEvent.change(pageSelects()[1]!, { target: { value: "wh-1" } })
    fireEvent.click(screen.getByRole("button", { name: /إضافة عنصر/ }))

    expect(mocks.usageCalls.at(-1)).toEqual({
      surface: "OUTBOUND_PICK",
      source: { locationType: "WAREHOUSE", warehouseId: "wh-1" },
    })
  })

  it("offers the in-stock active definition and hides the archived and the elsewhere-stocked one", () => {
    render(<OutboundTransferCreatePage onBack={vi.fn()} />)

    fireEvent.change(pageSelects()[1]!, { target: { value: "wh-1" } })
    fireEvent.click(screen.getByRole("button", { name: /إضافة عنصر/ }))

    const optionSelect = screen.getByLabelText("اختر العنصر") as HTMLSelectElement
    const optionNames = Array.from(optionSelect.options).map((option) => option.textContent)
    expect(optionNames).toContain("إسمنت")
    expect(optionNames).not.toContain("جير")
    expect(optionNames).not.toContain("رمل")
  })

  it("re-asks with the new source when the source changes", () => {
    render(<OutboundTransferCreatePage onBack={vi.fn()} />)

    fireEvent.change(pageSelects()[1]!, { target: { value: "wh-1" } })
    fireEvent.click(screen.getByRole("button", { name: /إضافة عنصر/ }))
    fireEvent.change(pageSelects()[1]!, { target: { value: "wh-2" } })

    expect(mocks.usageCalls.at(-1)).toEqual({
      surface: "OUTBOUND_PICK",
      source: { locationType: "WAREHOUSE", warehouseId: "wh-2" },
    })
  })

  it("asks with the project source after switching the source type", () => {
    render(<OutboundTransferCreatePage onBack={vi.fn()} />)

    // Switching the source type clears the source, so the picker pauses until a
    // project is picked.
    fireEvent.change(pageSelects()[0]!, { target: { value: "PROJECT" } })
    fireEvent.change(pageSelects()[1]!, { target: { value: "prj-1" } })
    fireEvent.click(screen.getByRole("button", { name: /إضافة عنصر/ }))

    expect(mocks.usageCalls.at(-1)).toEqual({
      surface: "OUTBOUND_PICK",
      source: { locationType: "PROJECT", projectId: "prj-1" },
    })
  })
})
