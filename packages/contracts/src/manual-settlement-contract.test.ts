import { expect, it } from "vitest";
import { financialContract, manualSettlementContract, manualSettlementPreviewSchema, manualSettlementHistoryInputSchema } from "./index";

it("exposes a distinct manual namespace with bounded history and wide report net amounts", () => {
  expect(financialContract.manualSettlement).toBe(manualSettlementContract);
  expect(manualSettlementHistoryInputSchema.parse({ externalCounterpartyId: "party" })).toEqual({ externalCounterpartyId: "party", limit: 50, offset: 0 });
  for (const bad of [{ limit: 101 }, { offset: -1 }, { actorUserId: "spoofed" }]) expect(manualSettlementHistoryInputSchema.safeParse({ externalCounterpartyId: "party", ...bad }).success).toBe(false);
  const preview = { payableAccountId: "p", receivableAccountId: "r", payableRemainingDzd: "100.00", receivableRemainingDzd: "60.00", projectedPayableRemainingDzd: "75.00", projectedReceivableRemainingDzd: "35.00", netPositionDzd: "184467440737095516.14", projectedNetPositionDzd: "184467440737095516.14" };
  expect(manualSettlementPreviewSchema.parse(preview)).toEqual(preview);
  expect(manualSettlementPreviewSchema.safeParse({ ...preview, netPositionDzd: 40 }).success).toBe(false);
});
