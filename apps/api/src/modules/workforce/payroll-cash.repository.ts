import type { ExactTransactionParticipant } from "../company/exact-finance.repository";

export type PayrollCashSource = { readonly kind: "EARNING" | "OPENING"; readonly id: string };
export type PayrollCashAllocation = { readonly id: string; readonly source: PayrollCashSource; readonly amount: string; readonly debtAccountId: string; readonly debtEntryId: string; readonly paymentEntryId: string };
export type PayrollCashAdvance = { readonly id: string; readonly amount: string; readonly debtAccountId: string; readonly debtEntryId: string };
export type PayrollCashRecord = {
  readonly id: string; readonly employeeId: string; readonly currency: "DZD"; readonly amount: string; readonly paymentDate: string;
  readonly actorUserId: string; readonly actorLabel: string | null; readonly transactionId: string; readonly createdAt: string;
  readonly wageAllocations: readonly PayrollCashAllocation[]; readonly advance: PayrollCashAdvance | null;
};

/** Immutable cash provenance. Ledger entries remain authoritative for balances and replay. */
export interface PayrollCashRepository extends ExactTransactionParticipant {
  getCash(id: string): PayrollCashRecord | null;
  listCash(employeeId: string): PayrollCashRecord[];
  saveCash(record: PayrollCashRecord): void;
}
