import { describe, expect, it } from "vitest";
import { exactDebtReportSchema } from "./debt-report-exact";
const report = { type: "DEBT", generatedAt: "2026-06-01T00:00:00.000Z", summary: { totalOutstandingDzd: "184467440737095516.14", totalSettledDzd: "0.00", overdueDzd: "0.00", partyCount: 0 }, agingBreakdown: [], byParty: [], topDebtors: [] };
describe("exact debt report schema", () => {
  it("permits wide canonical totals", () => { expect(exactDebtReportSchema.parse(report)).toEqual(report); });
  it.each([1, "1", "01.00", "1e2", " 1.00", "1.000", "-0.00", "NaN"])("rejects noncanonical money %s", value => {
    expect(exactDebtReportSchema.safeParse({ ...report, summary: { ...report.summary, totalOutstandingDzd: value } }).success).toBe(false);
  });
});
