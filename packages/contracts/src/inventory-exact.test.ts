import { expect, it } from "vitest";
import { exactInventoryHistoryInputSchema, exactInventoryHistorySchema, exactInventoryInvoiceCreateSchema } from "./inventory-exact";

it("validates exact history filters, pagination, source operands, and wide monetary strings", () => {
  expect(exactInventoryHistoryInputSchema.parse({ transferType: "RETURN", projectId: "project-1" })).toMatchObject({ offset: 0, limit: 50 });
  expect(exactInventoryHistoryInputSchema.safeParse({ projectId: "project-1", warehouseId: "warehouse-1" }).success).toBe(false);
  const page = exactInventoryHistorySchema.parse({ items: [{ id: "purchase-1", date: "2026-11-10T00:00:00.000Z", type: "PURCHASE", from: null,
    to: { type: "WAREHOUSE", id: "warehouse-1", name: "Warehouse" }, counterparty: null,
    items: [{ id: "entry-1", name: "Material", quantity: 2, type: "CONSUMABLE", priceSource: { mode: "agreed-total", total: "9007199254740993.07", quantity: "2" } }],
    totalAmountDzd: "9007199254740993.07", paidAmountDzd: "0.00", remainingDebtDzd: "9007199254740993.07", currency: "DZD",
    paymentStatus: "UNPAID", status: "COMPLETED", note: null }], total: 1, offset: 0, limit: 50, summary: { total: 1, sales: 0, internal: 0, totalAmountDzd: "184467440737095516.14" } });
  expect(page.summary.totalAmountDzd).toBe("184467440737095516.14");
  expect(exactInventoryHistorySchema.safeParse({ ...page, summary: { ...page.summary, totalAmountDzd: 0 } }).success).toBe(false);
  expect(page.items[0]!.items[0]!.priceSource).toMatchObject({ mode: "agreed-total", total: "9007199254740993.07" });
  expect(exactInventoryHistorySchema.safeParse({ ...page, items: [{ ...page.items[0], totalAmountDzd: 9007199254740993.07 }] }).success).toBe(false);
});

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
