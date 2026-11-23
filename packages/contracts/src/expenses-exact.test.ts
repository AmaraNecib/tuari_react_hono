import { describe, expect, it } from "vitest";
import { createExactExpenseInputSchema, exactExpenseRevisionSchema, exactExpenseAmountSchema, exactExpenseListOutputSchema } from "./expenses-exact";

const id = "11111111-1111-4111-8111-111111111111";
const date = "2026-10-03T10:00:00.000Z";

describe("inert exact expense contracts", () => {
  it("canonicalizes finalized inputs without a numeric bridge", () => {
    expect(createExactExpenseInputSchema.parse({ amount: "90071992547409.93", expenseDate: date }).amount).toBe("90071992547409.93");
    expect(exactExpenseAmountSchema.parse("0.1")).toBe("0.10");
    expect(exactExpenseAmountSchema.parse("92233720368547758.07")).toBe("92233720368547758.07");
    expect(createExactExpenseInputSchema.safeParse({ amount: "1.00", currency: "EUR", expenseDate: date }).success).toBe(false);
  });
  it.each([1, null, "", "0", "-0.01", "0.001", "1.000", "1e3", "0x10", " 1", "01", "NaN", "92233720368547758.08"])("rejects invalid expense %s", (value) => {
    expect(exactExpenseAmountSchema.safeParse(value).success).toBe(false);
  });
  it("retains NULL old amount and exact audit snapshots", () => {
    const result = exactExpenseRevisionSchema.parse({ id, expenseId: id, previousAmount: null, newAmount: "90071992547409.93", changedFields: ["amount"], reason: null, actorUserId: null, actorLabel: "A", transactionId: null, createdAt: date });
    expect(result.previousAmount).toBeNull();
    expect(JSON.parse(JSON.stringify(result)).newAmount).toBe("90071992547409.93");
  });
  it("permits wide read-only totals while each expense remains int64 bounded", () => {
    const totals = { total: "184467440737095516.14", count: 2, taggedToProject: "184467440737095516.14", notTaggedToProject: "0.00", heldByWorkers: "0.00", workerCount: 0 };
    expect(exactExpenseListOutputSchema.parse({ items: [], totals, groupsByProject: [] }).totals.total).toBe("184467440737095516.14");
    expect(exactExpenseAmountSchema.safeParse(totals.total).success).toBe(false);
    const historicalTotal = "9223372036854775807000.00";
    expect(exactExpenseListOutputSchema.parse({ items: [], totals: { ...totals, total: historicalTotal }, groupsByProject: [{ projectId: id, total: historicalTotal, count: 100000 }] }).totals.total).toBe(historicalTotal);
    expect(exactExpenseAmountSchema.safeParse(historicalTotal).success).toBe(false);
  });
});
