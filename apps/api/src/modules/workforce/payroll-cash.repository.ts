import type { ExactTransactionParticipant } from "../company/exact-finance.repository";

export type PayrollCashSource = { readonly kind: "EARNING" | "OPENING"; readonly id: string };
export type PayrollCashAllocation = { readonly id: string; readonly source: PayrollCashSource; readonly amount: string; readonly debtAccountId: string; readonly debtEntryId: string; readonly paymentEntryId: string };
export type PayrollCashAdvance = { readonly id: string; readonly amount: string; readonly debtAccountId: string; readonly debtEntryId: string };
export type PayrollCashAudit = {
  readonly actorUserId: string | null;
  readonly actorLabel: string | null;
  readonly transactionId: string | null;
  readonly createdAt: string;
};
export type PayrollCashRecord = PayrollCashAudit & {
  readonly id: string; readonly employeeId: string; readonly currency: "DZD"; readonly amount: string; readonly paymentDate: string;
  readonly wageAllocations: readonly PayrollCashAllocation[]; readonly advance: PayrollCashAdvance | null;
};
/** Explicit cash repayment provenance, not automatic withholding from wages. */
export type PayrollSettlementRecord = PayrollCashAudit & {
  readonly id: string; readonly employeeId: string; readonly currency: "DZD"; readonly amount: string; readonly paymentDate: string;
  readonly source: { readonly kind: "ADVANCE" | "OPENING_ADVANCE"; readonly id: string };
  readonly debtAccountId: string; readonly debtEntryId: string; readonly paymentEntryId: string;
};

/** Immutable provenance only. Finance owns balances and whole-command replay. */
export interface PayrollCashRepository extends ExactTransactionParticipant {
  getCash(id: string): PayrollCashRecord | null;
  listCash(employeeId: string): PayrollCashRecord[];
  saveCash(record: PayrollCashRecord): void;
  getSettlement(id: string): PayrollSettlementRecord | null;
  listSettlements(employeeId: string): PayrollSettlementRecord[];
  saveSettlement(record: PayrollSettlementRecord): void;
}
