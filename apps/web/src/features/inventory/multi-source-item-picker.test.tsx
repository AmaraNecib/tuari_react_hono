import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MultiSourceItemPicker, type SelectedItem } from "./multi-source-item-picker"

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

vi.mock("./inventory-hooks", () => ({
  useInventoryWarehousesQuery: () => ({ data: { items: [{ id: "warehouse", name: "Warehouse" }] } }),
  useInventoryProjectsQuery: () => ({ data: { items: [{ id: "project", name: "Project" }] } }),
  useInventoryLocationContentsQuery: () => ({ data: {
    assets: [
      { id: "unit-first", inventoryEntryId: "entry-asset-first", itemDefinitionId: "definition-asset", assetName: "First drill" },
      { id: "unit-second", inventoryEntryId: "entry-asset-second", itemDefinitionId: "definition-asset", assetName: "Second drill" },
    ],
    consumables: [
      { id: "balance-first", inventoryEntryId: "entry-consumable-first", itemDefinitionId: "definition-consumable", itemName: "First cement", quantity: 4, locationLabel: "Warehouse" },
      { id: "balance-second", inventoryEntryId: "entry-consumable-second", itemDefinitionId: "definition-consumable", itemName: "Second cement", quantity: 7, locationLabel: "Warehouse" },
    ],
  } }),
}))

afterEach(cleanup)

describe("MultiSourceItemPicker outbound identity", () => {
  it.each(["WAREHOUSE", "PROJECT"])("emits definition IDs while independently selecting and deduplicating concrete rows at a %s", (sourceType) => {
    const onItemsChange = vi.fn()
    function Harness() {
      const [items, setItems] = useState<SelectedItem[]>([])
      return <MultiSourceItemPicker items={items} onItemsChange={(next) => {
        setItems(next)
        onItemsChange(next)
      }} />
    }
    render(<Harness />)
    fireEvent.change(screen.getByLabelText("inventory.transfer.sourceType"), { target: { value: sourceType } })
    fireEvent.change(screen.getByLabelText("inventory.transfer.source"), { target: { value: sourceType === "WAREHOUSE" ? "warehouse" : "project" } })

    // Adding one unit must not disable the other unit of the same definition.
    // The same rule applies independently to two balances of one consumable.
    for (let index = 0; index < 4; index++) {
      fireEvent.click(screen.getAllByRole("button", { name: "common.add" })[0]!)
      expect(screen.getAllByRole("button", { name: "common.added" })).toHaveLength(index + 1)
      expect(screen.getAllByRole("button", { name: "common.added" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
    }

    const selected = onItemsChange.mock.calls.at(-1)![0] as SelectedItem[]
    expect(selected.map(({ itemId, optionId, itemType, maxQuantity }) => ({ itemId, optionId, itemType, maxQuantity }))).toEqual([
      { itemId: "definition-asset", optionId: "unit-first", itemType: "ASSET", maxQuantity: 1 },
      { itemId: "definition-asset", optionId: "unit-second", itemType: "ASSET", maxQuantity: 1 },
      { itemId: "definition-consumable", optionId: "balance-first", itemType: "CONSUMABLE", maxQuantity: 4 },
      { itemId: "definition-consumable", optionId: "balance-second", itemType: "CONSUMABLE", maxQuantity: 7 },
    ])
    expect(selected.every((item) => item.sourceType === sourceType && item.sourceId === (sourceType === "WAREHOUSE" ? "warehouse" : "project"))).toBe(true)
    fireEvent.click(screen.getAllByRole("button", { name: "common.added" })[0]!)
    expect(onItemsChange).toHaveBeenCalledTimes(4)
  })
})
