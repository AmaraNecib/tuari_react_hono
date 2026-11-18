import { describe, expect, it } from "vitest";

import {
  inventoryAssetEntryCreateInputSchema,
  inventoryConsumableEntryCreateInputSchema,
} from "./inventory";

const itemDefinitionId = "a5e49e35-08ce-42bd-80b3-3c90e774bad8";

describe("legacy inventory purchase scales", () => {
  it("limits final asset purchase money to two decimal places", () => {
    const makeInput = (purchasePriceDzd: number) => inventoryAssetEntryCreateInputSchema.safeParse({
      kind: "ASSET",
      itemDefinitionId,
      assets: [{ assetName: "Tool", purchasePriceDzd }],
    });

    expect(makeInput(0.37).success).toBe(true);
    expect(makeInput(0.375).success).toBe(false);
    expect(makeInput(0.0000001).success).toBe(false);
    expect(makeInput(1_000_000_000_000_000).success).toBe(true);
    expect(makeInput(Number.MAX_SAFE_INTEGER).success).toBe(true);
  });

  it("limits entered consumable unit prices to four places and final totals to two", () => {
    const makeInput = (unitPriceDzd: number, totalPriceDzd = 1) => inventoryConsumableEntryCreateInputSchema.safeParse({
      kind: "CONSUMABLE",
      itemDefinitionId,
      quantity: 1,
      unitPriceDzd,
      totalPriceDzd,
    });

    expect(makeInput(0.1234).success).toBe(true);
    expect(makeInput(0.123456).success).toBe(false);
    expect(makeInput(0.000001).success).toBe(false);
    expect(makeInput(0.1234, 0.375).success).toBe(false);
  });
});
