import type { ExactSalaryCashInput, ExactSalaryAdvanceRepaymentInput } from "@tuari/contracts";
import type { ExactDebtAudit } from "./exact-finance.service";
import type { ExactTransactionParticipant } from "./exact-finance.repository";

type Allocation = ExactSalaryCashInput["wageAllocations"][number];
export type PayrollCash = Omit<ExactSalaryCashInput, "requestId" | "wageAllocations" | "advance"> & Required<ExactDebtAudit> & {
  id: string;
  createdAt: string;
  wageAllocations: (Allocation & { debtAccountId: string; debtEntryId: string; paymentEntryId: string })[];
  advance: { id: string; amount: string; debtAccountId: string; debtEntryId: string } | null;
};
export type PayrollOpeningReview = Required<ExactDebtAudit> & {
  id: string; employeeId: string; currency: "DZD"; status: "UNREVIEWED" | "REVIEWED";
  wagesOwed: string | null; advancesOwed: string | null;
  wageDebtAccountId: string | null; wageDebtEntryId: string | null;
  advanceDebtAccountId: string | null; advanceDebtEntryId: string | null;
  createdAt: string;
};

export type PayrollSettlement = Omit<ExactSalaryAdvanceRepaymentInput, "requestId"> & Required<ExactDebtAudit> & {
  id: string; createdAt: string; debtAccountId: string; debtEntryId: string; paymentEntryId: string;
};

/** Payroll provenance never stores another balance or ledger receipt. */
export interface PayrollCashRepository extends ExactTransactionParticipant {
  getCash(id: string): PayrollCash | null;
  listCash(employeeId: string): PayrollCash[];
  saveCash(cash: PayrollCash): void;
  getOpening(id: string): PayrollOpeningReview | null;
  getEmployeeOpening(employeeId: string): PayrollOpeningReview | null;
  saveOpening(review: PayrollOpeningReview): void;
  getAdvance(id: string): (NonNullable<PayrollCash["advance"]> & { employeeId: string; currency: "DZD" }) | null;
  getSettlement(id: string): PayrollSettlement | null;
  listSettlements(employeeId: string): PayrollSettlement[];
  saveSettlement(settlement: PayrollSettlement): void;
}
