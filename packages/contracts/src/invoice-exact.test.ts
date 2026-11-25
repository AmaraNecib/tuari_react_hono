import { expect, it } from "vitest";
import { exactInvoiceCreateSchema, exactInvoiceSchema, exactPaymentCreateSchema, experimentalExactInvoiceSchema } from "./invoice-exact";
const party = { counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: "00000000-0000-4000-8000-000000000999" };
it("accepts exact source operands and rejects rounded client totals or numeric money", () => {
  const input = { requestId: "draft", ...party, supplierName: "Synthetic supplier", lineItems: [{ description: "Fractional line", source: { mode: "unit-price", price: "1.5000", quantity: "0.25" } }] };
  expect(exactInvoiceCreateSchema.parse(input).lineItems[0]?.source).toEqual({ mode: "unit-price", price: "1.5000", quantity: "0.25" });
  expect(exactInvoiceCreateSchema.safeParse({ ...input, totalAmount: "0.38" }).success).toBe(false);
  expect(exactInvoiceCreateSchema.safeParse({ ...input, lineItems: [{ ...input.lineItems[0], source: { mode: "unit-price", price: 1.5, quantity: "0.25" } }] }).success).toBe(false);
  expect(exactInvoiceCreateSchema.safeParse({ ...input, lineItems: [{ ...input.lineItems[0], source: { mode: "unit-price", price: "1.5000", quantity: "0" } }] }).success).toBe(false);
});
it("validates experimental cash, noncash and remaining totals without changing v1 schema", () => {
  const invoice = { ...party, id: "00000000-0000-4000-8000-000000000001", invoiceNumber: null, supplierName: "Vendor", supplierPhone: null, warehouseId: null, projectId: null, invoiceDate: null, dueDate: null, notes: null, currency: "DZD", direction: "PURCHASE", status: "SETTLED", totalAmount: "100.00", paidAmount: "20.00", settledAmount: "80.00", remainingAmount: "0.00", debtAccountId: null, debtEntryId: null, createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z", lineItems: [{ id: "00000000-0000-4000-8000-000000000002", invoiceId: "00000000-0000-4000-8000-000000000001", description: "Item", source: { mode: "agreed-total", total: "100.00", quantity: "1" } }] };
  expect(experimentalExactInvoiceSchema.safeParse(invoice).success).toBe(true);
  expect(experimentalExactInvoiceSchema.safeParse({ ...invoice, settledAmount: "79.00" }).success).toBe(false);
  expect(experimentalExactInvoiceSchema.safeParse({ ...invoice, status: "PAID", paidAmount: "100.00", settledAmount: "0.00", remainingAmount: "0.00" }).success).toBe(true);
  expect(experimentalExactInvoiceSchema.safeParse({ ...invoice, status: "PAID" }).success).toBe(false);
  expect(experimentalExactInvoiceSchema.safeParse({ ...invoice, paidAmount: "92233720368547758.07", settledAmount: "0.01", remainingAmount: "0.00" }).success).toBe(false);
  expect(experimentalExactInvoiceSchema.safeParse({ ...invoice, status: "VOIDED", paidAmount: "92233720368547758.07", settledAmount: "92233720368547758.07" }).success).toBe(true);
  expect(experimentalExactInvoiceSchema.safeParse({ ...invoice, status: "RECEIVED", paidAmount: "100.00", settledAmount: "0.00", remainingAmount: "0.00" }).success).toBe(false);
  const { settledAmount: _settled, ...normalInvoice } = invoice;
  expect(exactInvoiceSchema.safeParse({ ...normalInvoice, status: "RECEIVED", paidAmount: "20.00", remainingAmount: "80.00" }).success).toBe(true);
  expect(exactInvoiceCreateSchema.safeParse({ requestId: "draft", ...party, supplierName: "Vendor", lineItems: [{ description: "Item", source: { mode: "agreed-total", total: "100.00", quantity: "1" } }] }).success).toBe(true);
});
it("keeps unallocated cash explicit and rejects precision loss at the payment gate", () => {
  const input = { requestId: "cash", ...party, direction: "PURCHASE", paymentDate: "2026-11-10T00:00:00.000Z", paymentMethod: "CASH", totalAmount: "0.30", allocations: [] };
  expect(exactPaymentCreateSchema.parse(input)).toMatchObject({ totalAmount: "0.30", allocations: [], currency: "DZD" });
  for (const totalAmount of [0.3, "0.301", "0", "-0.01", "1e3"]) expect(exactPaymentCreateSchema.safeParse({ ...input, totalAmount }).success).toBe(false);
});
