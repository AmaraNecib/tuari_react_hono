import type { SalaryTransaction, SalaryTransactionType } from "./salary-transaction.entity";

export type SalaryTransactionWriteInput = {
  id: string;
  workerId: string;
  type: SalaryTransactionType;
  amountDzd: number;
  note: string | null;
  beforeSalaryDzd: number | null;
  afterSalaryDzd: number | null;
  effectiveAt: Date;
  createdByUserId: string | null;
  createdAt: Date;
};

export interface SalaryTransactionRepository {
  listByWorkerId(workerId: string): Promise<SalaryTransaction[]>;
  create(input: SalaryTransactionWriteInput): Promise<SalaryTransaction>;
}
