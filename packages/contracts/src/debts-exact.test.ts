import { describe, expect, it } from "vitest";
import { debtAccountSchema } from "./debts";
import { createExactDebtAccountSchema, exactDebtAmountSchema, payExactDebtEntrySchema, postExactDebtEntrySchema } from "./debts-exact";
const id = "00000000-0000-4000-8000-000000000001";
describe("opt-in exact debt codecs", () => {
  it("keeps every cent across the symmetric persisted domain and rejects numeric or nondecimal wires", () => {
    for (const [input, output] of [["0.1", "0.10"], ["90071992547409.93", "90071992547409.93"], ["-92233720368547758.07", "-92233720368547758.07"], ["-0", "0.00"]]) expect(exactDebtAmountSchema.parse(input)).toBe(output);
    for (const value of [1, "1e2", "0x10", "1.001", "92233720368547758.08", "-92233720368547758.08", "", null]) expect(exactDebtAmountSchema.safeParse(value).success).toBe(false);
  });
  it("requires the real identity and immutable currency instead of inferring direction", () => {
    const input = { requestId: "account", partyType: "INTERNAL_WORKER", workerId: id, direction: "RECEIVABLE", openingBalanceDzd: "0" };
    expect(createExactDebtAccountSchema.parse(input)).toMatchObject({ currency: "DZD", openingBalanceDzd: "0.00" });
    for (const delta of [{ direction: undefined }, { externalCounterpartyId: id }, { currency: "EUR" }, { openingBalanceDzd: "-0.01" }]) expect(createExactDebtAccountSchema.safeParse({ ...input, ...delta }).success).toBe(false);
  });
  it("rejects nonpositive payments and backdate syntax while leaving numeric legacy fields numeric", () => {
    for (const amountDzd of ["0", "-0.01", "1.001", 1]) expect(payExactDebtEntrySchema.safeParse({ requestId: "pay", debtEntryId: id, amountDzd }).success).toBe(false);
    expect(payExactDebtEntrySchema.parse({ requestId: "pay", debtEntryId: id, amountDzd: "0.01" })).toMatchObject({ currency: "DZD", paymentMethod: "CASH" });
    expect(postExactDebtEntrySchema.safeParse({ requestId: "post", debtAccountId: id, entryType: "PAYMENT", signedAmountDzd: "1" }).success).toBe(false);
    expect(postExactDebtEntrySchema.safeParse({ requestId: "post", debtAccountId: id, entryType: "OPENING", signedAmountDzd: "1", entryDate: "2026-99-99" }).success).toBe(false);
    expect(debtAccountSchema.shape.currentBalance.safeParse("1.00").success).toBe(false);
    expect(debtAccountSchema.shape.currentBalance.safeParse(1).success).toBe(true);
  });
});
