import { describe, expect, it } from "vitest"

import { mapSelectedItemToOutboundTransferInput } from "./outbound-transfer-create-page-v2"
import type { SelectedItem } from "./multi-source-item-picker"

describe("mapSelectedItemToOutboundTransferInput", () => {
  it("keeps the selected stock row separate from its definition", () => {
    const item: SelectedItem = {
      optionId: "asset-selected",
      itemId: "definition-drill",
      itemName: "Drill",
      itemType: "ASSET",
      sourceType: "WAREHOUSE",
      sourceId: "warehouse-1",
      sourceName: "Warehouse 1",
      quantity: 1,
      maxQuantity: 1,
      unitPrice: 2500,
    }

    expect(mapSelectedItemToOutboundTransferInput(item)).toEqual({
      itemId: "definition-drill",
      optionId: "asset-selected",
      quantity: 1,
      unitPriceDzd: 2500,
    })
  })
})
