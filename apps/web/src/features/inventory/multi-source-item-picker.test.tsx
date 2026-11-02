import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ar } from "@/i18n/resources/ar"
import { MultiSourceItemPicker, type SelectedItem } from "./multi-source-item-picker"

const contentsQuery = vi.hoisted(() => vi.fn())
const definitionsState = vi.hoisted(() => ({ isPending: false, isError: false }))
const contentsState = vi.hoisted(() => ({ isPending: false, isError: false }))

function translation(key: string): string {
  let node: unknown = ar.translation
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object" || !(part in node)) return key
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === "string" ? node : key
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      let node: unknown = ar.translation
      for (const part of key.split(".")) {
        if (node === null || typeof node !== "object" || !(part in node)) {
          node = undefined
          break
        }
        node = (node as Record<string, unknown>)[part]
      }
      return typeof node === "string" ? node : (fallback ?? key)
    },
  }),
}))

vi.mock("./inventory-hooks", () => ({
  useInventoryItemDefinitionsQuery: () => ({ ...definitionsState, data: { items: [
    { id: "definition-asset", itemType: "ASSET", isActive: true },
    { id: "definition-consumable", itemType: "CONSUMABLE", isActive: true },
    { id: "archived-asset", itemType: "ASSET", isActive: false },
    { id: "archived-consumable", itemType: "CONSUMABLE", isActive: false },
  ] } }),
  useInventoryWarehousesQuery: () => ({ data: { items: [{ id: "warehouse", name: "Warehouse" }] } }),
  useInventoryProjectsQuery: () => ({ data: { items: [{ id: "project", name: "Project" }] } }),
  useInventoryLocationContentsQuery: contentsQuery.mockImplementation(() => ({ ...contentsState, data: {
    assets: [
      { id: "unit-first", inventoryEntryId: "entry-asset-first", itemDefinitionId: "definition-asset", assetName: "First drill" },
      { id: "unit-second", inventoryEntryId: "entry-asset-second", itemDefinitionId: "definition-asset", assetName: "Second drill" },
      { id: "unit-archived", inventoryEntryId: "entry-archived", itemDefinitionId: "archived-asset", assetName: "Archived drill" },
    ],
    consumables: [
      { id: "balance-first", inventoryEntryId: "entry-consumable-first", itemDefinitionId: "definition-consumable", itemName: "First cement", quantity: 4, locationLabel: "Warehouse" },
      { id: "balance-second", inventoryEntryId: "entry-consumable-second", itemDefinitionId: "definition-consumable", itemName: "Second cement", quantity: 7, locationLabel: "Warehouse" },
      { id: "balance-archived", inventoryEntryId: "entry-archived-consumable", itemDefinitionId: "archived-consumable", itemName: "Archived cement", quantity: 9, locationLabel: "Warehouse" },
    ],
  } })),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  definitionsState.isPending = false
  definitionsState.isError = false
  contentsState.isPending = false
  contentsState.isError = false
})

describe("MultiSourceItemPicker outbound identity", () => {
  it.each([
    ["definitions", "pending"],
    ["definitions", "error"],
    ["contents", "pending"],
    ["contents", "error"],
  ] as const)("does not offer stock or report an empty source when %s are %s", (query, state) => {
    const queryState = query === "definitions" ? definitionsState : contentsState
    queryState.isPending = state === "pending"
    queryState.isError = state === "error"
    render(<MultiSourceItemPicker items={[]} onItemsChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(translation("inventory.transfer.source")), { target: { value: "warehouse" } })

    expect(screen.getByRole(state === "pending" ? "status" : "alert").textContent)
      .toBe(translation(state === "pending" ? "common.loading" : "common.error"))
    expect(screen.queryByText(translation("inventory.transfer.noItems"))).toBeNull()
    expect(screen.queryByRole("button", { name: translation("common.add") })).toBeNull()
  })

  it.each(["WAREHOUSE", "PROJECT"])("emits definition and selected-row IDs at a %s source", (sourceType) => {
    const onItemsChange = vi.fn()
    function Harness() {
      const [items, setItems] = useState<SelectedItem[]>([])
      return <MultiSourceItemPicker items={items} onItemsChange={(next) => {
        setItems(next)
        onItemsChange(next)
      }} />
    }
    render(<Harness />)
    expect(contentsQuery).toHaveBeenLastCalledWith({ warehouseId: "", projectId: undefined })
    fireEvent.change(screen.getByLabelText(translation("inventory.transfer.sourceType")), { target: { value: sourceType } })
    fireEvent.change(screen.getByLabelText(translation("inventory.transfer.source")), { target: { value: sourceType === "WAREHOUSE" ? "warehouse" : "project" } })

    expect(contentsQuery).toHaveBeenLastCalledWith(sourceType === "WAREHOUSE"
      ? { warehouseId: "warehouse", projectId: undefined }
      : { warehouseId: undefined, projectId: "project" })
    expect(screen.queryByText("Archived drill")).toBeNull()
    expect(screen.queryByText("Archived cement")).toBeNull()

    // Adding one unit must not disable the other unit of the same definition.
    // The same rule applies independently to two balances of one consumable.
    for (let index = 0; index < 4; index++) {
      fireEvent.click(screen.getAllByRole("button", { name: translation("common.add") })[0]!)
      expect(screen.getAllByRole("button", { name: translation("common.added") })).toHaveLength(index + 1)
      expect(screen.getAllByRole("button", { name: translation("common.added") }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
    }

    const selected = onItemsChange.mock.calls.at(-1)![0] as SelectedItem[]
    expect(selected.map(({ itemId, optionId, itemType, maxQuantity }) => ({ itemId, optionId, itemType, maxQuantity }))).toEqual([
      { itemId: "definition-asset", optionId: "unit-first", itemType: "ASSET", maxQuantity: 1 },
      { itemId: "definition-asset", optionId: "unit-second", itemType: "ASSET", maxQuantity: 1 },
      { itemId: "definition-consumable", optionId: "balance-first", itemType: "CONSUMABLE", maxQuantity: 4 },
      { itemId: "definition-consumable", optionId: "balance-second", itemType: "CONSUMABLE", maxQuantity: 7 },
    ])
    expect(selected.every((item) => item.sourceType === sourceType && item.sourceId === (sourceType === "WAREHOUSE" ? "warehouse" : "project"))).toBe(true)
    fireEvent.click(screen.getAllByRole("button", { name: translation("common.added") })[0]!)
    expect(onItemsChange).toHaveBeenCalledTimes(4)
  })
})
