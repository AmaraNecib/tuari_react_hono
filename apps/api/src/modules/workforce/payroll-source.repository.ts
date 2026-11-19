import type { ExactDebtAccount, ExactDebtEntry } from "../company/exact-finance.repository";
import type { ExactTransactionParticipant } from "../company/exact-finance.repository";

export type PayrollEarningSource = {
  readonly id: string;
  readonly employeeId: string;
  readonly currency: string;
  readonly amount: string;
  readonly original: ExactDebtEntry | null;
  readonly account: ExactDebtAccount | null;
};
export type PayrollAdvanceSource = {
  readonly id: string;
  readonly employeeId: string;
  readonly currency: string;
  readonly amount: string;
  readonly account: ExactDebtAccount;
  readonly original: ExactDebtEntry;
};

/** Source-scoped, read-only identity lookup. Implementations share finance's connection and FIFO. */
export interface PayrollSourceRepository extends ExactTransactionParticipant {
  getEarning(id: string): PayrollEarningSource | null;
  getAdvance(id: string): PayrollAdvanceSource | null;
}
