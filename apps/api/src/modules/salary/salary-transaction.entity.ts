import type { SessionUser } from "../session/session.types";

export const salaryTransactionTypes = [
  "SALARY_SET",
  "SALARY_BONUS",
  "SALARY_DEDUCTION",
  "SALARY_PAYMENT",
] as const;

export type SalaryTransactionType = (typeof salaryTransactionTypes)[number];

export type SalaryTransaction = {
  id: string;
  workerId: string;
  type: SalaryTransactionType;
  amountDzd: number;
  note: string | null;
  beforeSalaryDzd: number | null;
  afterSalaryDzd: number | null;
  effectiveAt: string;
  createdAt: string;
  createdByUser: SessionUser | null;
};
