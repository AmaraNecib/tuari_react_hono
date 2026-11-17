import type { ContractRouterClient } from "@orpc/contract";
import { exactWorkforceContract } from "./workforce-exact-contract";

/** normal application exposes approved earnings and project labor only. */
export const exactWorkforceEarningsContract = {
  approveMonthlyEarnings: exactWorkforceContract.approveMonthlyEarnings,
  listEmployeeEarnings: exactWorkforceContract.listEmployeeEarnings,
  getProjectSalaryCost: exactWorkforceContract.getProjectSalaryCost,
} as const;

export type ExactWorkforceEarningsClient = ContractRouterClient<typeof exactWorkforceEarningsContract>;
