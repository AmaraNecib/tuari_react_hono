import { expect, it } from "vitest";
import { exactReportSchema, exactReportsContract, financialContract, exactDebtReportSchema, exactInventoryReportSchema, exactMovementReportSchema } from "./index";

const generatedAt = "2026-03-02T00:00:00.000Z";
const wide = "184467440737095516.14";
const reports = [
  { type: "DEBT", generatedAt, summary: { totalOutstandingDzd: wide, totalSettledDzd: "0.00", overdueDzd: wide, partyCount: 1 }, agingBreakdown: [], byParty: [], topDebtors: [] },
  { type: "INVENTORY", generatedAt, summary: { totalAssetsDzd: "0.00", totalConsumablesDzd: wide, totalValueDzd: wide }, byLocation: [], byItemType: [], agingAnalysis: [] },
  { type: "MOVEMENT", generatedAt, summary: { totalMovements: 1, assetTransfers: 0, consumableTransfers: 0, outboundSales: 1 }, outboundDocuments: [{ transferType: "GIFT", count: 1 }], byType: [{ movementType: "OUTBOUND_SALE", count: 1, valueDzd: wide }], byPeriod: [], topDestinations: [] },
];
it("publishes concrete exact schemas and the financial report leaf without replacing numeric contracts", () => {
  expect(financialContract.reports).toBe(exactReportsContract);
  expect(exactReportsContract.generate["~orpc"].outputSchema).toBe(exactReportSchema);
  for (const [index, schema] of [exactDebtReportSchema, exactInventoryReportSchema, exactMovementReportSchema].entries()) {
    expect(schema.parse(reports[index])).toEqual(reports[index]);
    expect(exactReportSchema.parse(reports[index])).toEqual(reports[index]);
  }
});
it("rejects numeric and malformed money in every concrete output through the exported union", () => {
  for (const report of reports) for (const bad of [12, "01.00", "1.000", "1e3", "-0.00"]) {
    const corrupted = JSON.parse(JSON.stringify(report).replaceAll('"' + wide + '"', JSON.stringify(bad)));
    expect(exactReportSchema.safeParse(corrupted).success).toBe(false);
  }
});
it("keeps existing selector and ISO date input conventions", () => {
  const input = exactReportsContract.generate["~orpc"].inputSchema!;
  expect(input.safeParse({ type: "DEBT", startDate: generatedAt }).success).toBe(true);
  expect(input.safeParse({ type: "CASH" }).success).toBe(false);
  expect(input.safeParse({ type: "DEBT", startDate: "2026-03-02" }).success).toBe(false);
});
