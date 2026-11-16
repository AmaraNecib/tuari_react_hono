import type { ContractRouterClient } from "@orpc/contract";
import { exactWorkforceContract } from "./workforce-exact-contract";

/** Slice 543 exposes approved earnings and project labor only. */
export const exactWorkforceEarningsContract = {
  approveMonthlyEarnings: exactWorkforceContract.approveMonthlyEarnings,
  listEmployeeEarnings: exactWorkforceContract.listEmployeeEarnings,
  getProjectSalaryCost: exactWorkforceContract.getProjectSalaryCost,
} as const;

export type ExactWorkforceEarningsClient = ContractRouterClient<typeof exactWorkforceEarningsContract>;
