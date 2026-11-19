import type { ExactTransactionParticipant } from "../company/exact-finance.repository";
import type { PayrollCashAudit, PayrollCashSource } from "./payroll-cash.repository";

export type PayrollOffsetLeg = {
  readonly debtAccountId: string;
  readonly debtEntryId: string;
  readonly settlementEntryId: string;
};
/** A paired noncash event. This is neither an earning nor a cash repayment. */
export type PayrollOffsetRecord = PayrollCashAudit & {
  readonly id: string;
  readonly employeeId: string;
  readonly currency: "DZD";
  readonly amount: string;
  readonly settlementDate: string;
  readonly wageSource: PayrollCashSource;
  readonly advanceSource: { readonly kind: "ADVANCE" | "OPENING_ADVANCE"; readonly id: string };
  readonly wage: PayrollOffsetLeg;
  readonly advance: PayrollOffsetLeg;
};
export interface PayrollOffsetRepository extends ExactTransactionParticipant {
  getOffset(id: string): PayrollOffsetRecord | null;
  listOffsets(employeeId: string): PayrollOffsetRecord[];
  saveOffset(record: PayrollOffsetRecord): void;
}
