import type { PayrollAudit } from "./payroll.service";

export type OpeningResolution = PayrollAudit & {
  id: string;
  status: "APPLIED" | "CANCELLED";
  refundEntryId: string | null;
  correctionEntryId: string | null;
  reason: string;
  createdAt: string;
};
export type OpeningProposal = PayrollAudit & {
  id: string;
  sourceId: string;
  employeeId: string;
  kind: "WAGE" | "ADVANCE";
  oldAmount: string;
  newAmount: string;
  requiredRefund: string;
  reason: string;
  createdAt: string;
  status: "PENDING" | "APPLIED" | "CANCELLED";
  resolution: OpeningResolution | null;
};
export type OpeningRefund = PayrollAudit & {
  id: string;
  proposalId: string;
  sourceId: string;
  employeeId: string;
  kind: "WAGE" | "ADVANCE";
  amount: string;
  direction: "IN" | "OUT";
  refundDate: string;
  createdAt: string;
  debtAccountId: string;
  debtEntryId: string;
};
