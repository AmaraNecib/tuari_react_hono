import { describe, expect, it } from "vitest";

import { inventoryOutboundTransferCreateInputSchema } from "./inventory";

describe("inventoryOutboundTransferCreateInputSchema", () => {
  it("keeps the selected stock row alongside its item definition", () => {
    const input = inventoryOutboundTransferCreateInputSchema.parse({
      fromType: "WAREHOUSE",
      fromId: "warehouse-1",
      counterpartyId: "buyer-1",
      transferType: "SALE",
      items: [{ itemId: "definition-1", optionId: "unit-selected", quantity: 1 }],
    });

    expect(input.items[0]?.optionId).toBe("unit-selected");
  });
});
