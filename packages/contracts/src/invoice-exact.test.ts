import { expect, it } from "vitest";
import { exactInvoiceCreateSchema, exactPaymentCreateSchema } from "./invoice-exact";
const party = { counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: "00000000-0000-4000-8000-000000000999" };
it("accepts exact source operands and rejects rounded client totals or numeric money", () => {
  const input = { requestId: "draft", ...party, supplierName: "Synthetic supplier", lineItems: [{ description: "Fractional line", source: { mode: "unit-price", price: "1.5000", quantity: "0.25" } }] };
  expect(exactInvoiceCreateSchema.parse(input).lineItems[0]?.source).toEqual({ mode: "unit-price", price: "1.5000", quantity: "0.25" });
  expect(exactInvoiceCreateSchema.safeParse({ ...input, totalAmount: "0.38" }).success).toBe(false);
  expect(exactInvoiceCreateSchema.safeParse({ ...input, lineItems: [{ ...input.lineItems[0], source: { mode: "unit-price", price: 1.5, quantity: "0.25" } }] }).success).toBe(false);
  expect(exactInvoiceCreateSchema.safeParse({ ...input, lineItems: [{ ...input.lineItems[0], source: { mode: "unit-price", price: "1.5000", quantity: "0" } }] }).success).toBe(false);
});
it("keeps unallocated cash explicit and rejects precision loss at the payment gate", () => {
  const input = { requestId: "cash", ...party, direction: "PURCHASE", paymentDate: "2026-11-10T00:00:00.000Z", paymentMethod: "CASH", totalAmount: "0.30", allocations: [] };
  expect(exactPaymentCreateSchema.parse(input)).toMatchObject({ totalAmount: "0.30", allocations: [], currency: "DZD" });
  for (const totalAmount of [0.3, "0.301", "0", "-0.01", "1e3"]) expect(exactPaymentCreateSchema.safeParse({ ...input, totalAmount }).success).toBe(false);
});
