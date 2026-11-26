import { expect, it } from "vitest";
import { financialContract } from "./financial-contract";
import { experimentalSettlementCandidateSchema, experimentalSettlementContract, experimentalSettlementSourceSchema } from "./experimental-settlement";

it("keeps invoice settlement sources in the experimental contract", () => {
  expect(financialContract.experimentalSettlement).toBe(experimentalSettlementContract);
  expect(experimentalSettlementSourceSchema.parse({ kind: "INVOICE_PURCHASE", id: "purchase-1", label: "فاتورة شراء INV-615" })).toEqual({ kind: "INVOICE_PURCHASE", id: "purchase-1", label: "فاتورة شراء INV-615" });
  expect(experimentalSettlementSourceSchema.parse({ kind: "INVOICE_SALE", id: "sale-1", label: "فاتورة بيع sale-1" })).toEqual({ kind: "INVOICE_SALE", id: "sale-1", label: "فاتورة بيع sale-1" });
  expect(experimentalSettlementSourceSchema.safeParse({ kind: "RESTRICTED", id: "purchase-1" }).success).toBe(false);
  expect(experimentalSettlementCandidateSchema.safeParse({ id: "entry-1", debtAccountId: "account-1", direction: "PAYABLE", postingSequence: 1, remainingDzd: "20.00", sourceKind: "INVOICE_PURCHASE", sourceId: "purchase-1", sourceLabel: "فاتورة شراء INV-615" }).success).toBe(true);
  expect(experimentalSettlementCandidateSchema.safeParse({ id: "entry-1", debtAccountId: "account-1", direction: "PAYABLE", postingSequence: 1, remainingDzd: "20.00", sourceKind: "RESTRICTED", sourceId: "purchase-1" }).success).toBe(false);
});
