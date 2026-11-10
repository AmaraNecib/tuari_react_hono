import { expect, it } from "vitest";
import { exactInventoryInvoiceCreateSchema } from "./inventory-exact";

it("accepts price4 and independent fractional stock without a client rounded line total", () => {
  const input = exactInventoryInvoiceCreateSchema.parse({
    requestId: "purchase:1", warehouseId: "warehouse-1",
    entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material-1", quantity: 0.000001, unitPriceDzd: "123.4567" }],
  });
  expect(input.entries[0]).toMatchObject({ quantity: 0.000001, unitPriceDzd: "123.4567" });
  expect(input).toMatchObject({ requestId: "purchase:1", currency: "DZD" });
  expect(exactInventoryInvoiceCreateSchema.safeParse({ ...input, entries: [{ ...input.entries[0], unitPriceDzd: "123.45678" }] }).success).toBe(false);
  expect(exactInventoryInvoiceCreateSchema.safeParse({ ...input, entries: [{ ...input.entries[0], unitPriceDzd: 123.4567 }] }).success).toBe(false);
});
