import type { ExactSalaryApprovalInput } from "@tuari/contracts";
import type { ExactDebtAudit } from "./exact-finance.service";
import type { ExactTransactionParticipant } from "./exact-finance.repository";

export type ExactSalaryEarning = Omit<ExactSalaryApprovalInput, "requestId"> & {
  id: string;
  debtAccountId: string | null;
  debtEntryId: string | null;
  createdAt: string;
} & Required<ExactDebtAudit>;

export const EXACT_WORKFORCE_READ_RECORD_LIMIT = 10000;

/** Payroll source records enlist with, but never duplicate, the authoritative ledger. */
export interface ExactWorkforceRepository extends ExactTransactionParticipant {
  employeeExists(id: string): boolean;
  projectExists(id: string): boolean;
  getEarning(id: string): ExactSalaryEarning | null;
  /** Refuse before hydration when selected sources plus all their segments exceed EXACT_WORKFORCE_READ_RECORD_LIMIT. */
  listEarnings(employeeId: string): ExactSalaryEarning[];
  /** Same combined source/all-segment limit, including segments belonging to other projects. */
  listProjectEarnings(projectId: string): ExactSalaryEarning[];
  saveEarning(earning: ExactSalaryEarning): void;
}
