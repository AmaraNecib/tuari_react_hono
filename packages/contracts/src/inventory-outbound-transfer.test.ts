import { describe, expect, it } from "vitest";

import { inventoryOutboundTransferCreateInputSchema } from "./inventory";
import { MAX_MONEY_DZD } from "./payment";

const baseInput = {
  fromType: "WAREHOUSE" as const,
  fromId: "warehouse-1",
  counterpartyId: "buyer-1",
  transferType: "SALE" as const,
  items: [{ itemId: "definition-1", quantity: 1 }],
};

const moneyFields = ["unitPriceDzd", "debtAmountDzd", "firstPaymentAmountDzd"] as const;

function withMoney(field: typeof moneyFields[number], amount: number) {
  return field === "unitPriceDzd"
    ? { ...baseInput, items: [{ ...baseInput.items[0], unitPriceDzd: amount }] }
    : { ...baseInput, [field]: amount };
}

describe("inventoryOutboundTransferCreateInputSchema", () => {
  it.each(moneyFields)("rejects %s above the shared money limit (#478)", (field) => {
    const result = inventoryOutboundTransferCreateInputSchema.safeParse(withMoney(field, MAX_MONEY_DZD + 1));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(field === "unitPriceDzd" ? ["items", 0, field] : [field]);
    }
  });

  describe.each(moneyFields)("%s validity", (field) => {
    it.each([0, 12.5, MAX_MONEY_DZD])("accepts %s DZD unchanged", (amount) => {
      const result = inventoryOutboundTransferCreateInputSchema.parse(withMoney(field, amount));
      expect(field === "unitPriceDzd" ? result.items[0]?.unitPriceDzd : result[field]).toBe(amount);
    });

    it.each([-1, NaN, Infinity, -Infinity])("rejects invalid money %s", (amount) => {
      expect(inventoryOutboundTransferCreateInputSchema.safeParse(withMoney(field, amount)).success).toBe(false);
    });
  });

  it("keeps all money inputs optional", () => {
    const result = inventoryOutboundTransferCreateInputSchema.parse(baseInput);
    expect(result.items[0]?.unitPriceDzd).toBeUndefined();
    expect(result.debtAmountDzd).toBeUndefined();
    expect(result.firstPaymentAmountDzd).toBeUndefined();
  });

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
