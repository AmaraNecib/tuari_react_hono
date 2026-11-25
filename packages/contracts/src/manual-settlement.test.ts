import { expect, it } from "vitest";
import { confirmManualSettlementSchema, manualSettlementCandidateSchema, manualSettlementSourceSchema, previewManualSettlementSchema, reverseManualSettlementSchema } from "./manual-settlement";
import { exactDebtProducerSchema, exactFinanceAggregateOwnerSchema } from "./debts-exact";
const party = "00000000-0000-4000-8000-000000000001";
const payable = "00000000-0000-4000-8000-000000000002";
const receivable = "00000000-0000-4000-8000-000000000003";
const preview = { externalCounterpartyId: party, payableOriginalEntryId: payable, receivableOriginalEntryId: receivable, currency: "DZD", amountDzd: "25" };
const confirm = { ...preview, requestId: "manual:confirm-1", expectedPayableRemainingDzd: "100", expectedReceivableRemainingDzd: "60" };
it("normalizes exact approved intent without accepting client audit fields", () => {
  expect(confirmManualSettlementSchema.parse({ ...confirm, note: "  Optional  " })).toEqual({ ...confirm, amountDzd: "25.00", expectedPayableRemainingDzd: "100.00", expectedReceivableRemainingDzd: "60.00", note: "Optional" });
  for (const extra of [{ actorUserId: party }, { actorLabel: "Admin" }, { recordedAt: "2026-01-01" }, { transactionId: "client" }]) expect(confirmManualSettlementSchema.safeParse({ ...confirm, ...extra }).success).toBe(false);
  expect(previewManualSettlementSchema.safeParse(preview).success).toBe(true);
});
it("refuses ambiguous identities, unsafe amounts, stale expectation syntax and invalid request IDs", () => {
  for (const delta of [{ receivableOriginalEntryId: payable }, { currency: "EUR" }, { amountDzd: "0" }, { amountDzd: "-1" }, { amountDzd: 25 }, { amountDzd: "0.001" }, { expectedPayableRemainingDzd: "0" }, { expectedReceivableRemainingDzd: "-1" }, { requestId: "" }, { requestId: "a b" }, { note: "x".repeat(1001) }]) expect(confirmManualSettlementSchema.safeParse({ ...confirm, ...delta }).success).toBe(false);
});
it("requires a complete reversal reason and keeps the owner outside producer capabilities", () => {
  const input = { requestId: "reverse-1", settlementId: party, reason: "  Incorrect pair  " };
  expect(reverseManualSettlementSchema.parse(input).reason).toBe("Incorrect pair");
  for (const reason of ["", "   ", "x".repeat(1001)]) expect(reverseManualSettlementSchema.safeParse({ ...input, reason }).success).toBe(false);
  expect(exactFinanceAggregateOwnerSchema.safeParse({ type: "MANUAL_SETTLEMENT", id: party }).success).toBe(true);
  expect(exactDebtProducerSchema.safeParse({ type: "MANUAL_SETTLEMENT", id: party }).success).toBe(false);
});
const candidate = { id: "debt-entry-1", debtAccountId: "debt-account-1", direction: "PAYABLE" as const, postingSequence: 4, remainingDzd: "75.00" };
it("accepts restricted candidate sources without inventory identity and rejects extra identity fields", () => {
  expect(manualSettlementCandidateSchema.parse({ ...candidate, sourceKind: "RESTRICTED" })).toEqual({ ...candidate, sourceKind: "RESTRICTED" });
  expect(manualSettlementCandidateSchema.safeParse({ ...candidate, sourceKind: "RESTRICTED", sourceId: "inventory-1" }).success).toBe(false);
  expect(manualSettlementCandidateSchema.safeParse({ ...candidate, sourceKind: "RESTRICTED", sourceLabel: "IN-0001" }).success).toBe(false);
});
it("keeps owner and manual source shape while rejecting identity on restricted history sources", () => {
  expect(manualSettlementSourceSchema.parse({ kind: "PURCHASE", id: "inventory-1", label: "IN-0001" })).toEqual({ kind: "PURCHASE", id: "inventory-1", label: "IN-0001" });
  expect(manualSettlementSourceSchema.parse({ kind: "MANUAL", id: "debt-entry-1", label: "#4" })).toEqual({ kind: "MANUAL", id: "debt-entry-1", label: "#4" });
  expect(manualSettlementSourceSchema.parse({ kind: "RESTRICTED" })).toEqual({ kind: "RESTRICTED" });
  expect(manualSettlementSourceSchema.safeParse({ kind: "RESTRICTED", id: "inventory-1" }).success).toBe(false);
  expect(manualSettlementSourceSchema.safeParse({ kind: "RESTRICTED", label: "IN-0001" }).success).toBe(false);
});
