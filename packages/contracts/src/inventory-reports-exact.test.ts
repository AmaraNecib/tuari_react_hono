import { expect, it } from "vitest";
import { exactInventoryReportSchema, exactMovementReportSchema } from "./inventory-reports-exact";
const date = "2026-11-10T00:00:00.000Z";
const wide = "184467440737095516.14";
it("accepts wide canonical report money while rejecting numeric, negative and noncanonical amounts", () => {
  const report = { type: "INVENTORY", generatedAt: date, summary: { totalAssetsDzd: wide, totalConsumablesDzd: "0.00", totalValueDzd: wide }, byLocation: [], byItemType: [], agingAnalysis: [] };
  expect(exactInventoryReportSchema.parse(report).summary.totalValueDzd).toBe(wide);
  for (const bad of [0, 10, "10", "01.00", "1.000", "-1.00", "1e2", null]) expect(exactInventoryReportSchema.safeParse({ ...report, summary: { ...report.summary, totalValueDzd: bad } }).success).toBe(false);
});
it("requires exact movement money and keeps outbound documents separate from legacy movement counts", () => {
  const report = { type: "MOVEMENT", generatedAt: date, summary: { totalMovements: 1, assetTransfers: 0, consumableTransfers: 0, outboundSales: 1 }, outboundDocuments: [{ transferType: "RETURN", count: 1 }], byType: [{ movementType: "OUTBOUND_SALE", count: 1, valueDzd: wide }], byPeriod: [], topDestinations: [] };
  expect(exactMovementReportSchema.safeParse(report).success).toBe(true);
  expect(exactMovementReportSchema.safeParse({ ...report, byType: [{ movementType: "OUTBOUND_SALE", count: 1, valueDzd: 1 }] }).success).toBe(false);
});
