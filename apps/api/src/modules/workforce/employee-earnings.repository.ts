import type { EmployeeEarning, EmployeeEarningApprovalInput } from "@tuari/contracts";

import type { MutationAuditContext } from "../company/company.types";

export interface EmployeeEarningRepository {
  findByRequestId(requestId: string): { earning: EmployeeEarning; requestHash: string } | null;
  list(employeeId?: string): EmployeeEarning[];
  create(
    input: EmployeeEarningApprovalInput,
    requestHash: string,
    approvedAt: string,
    audit?: MutationAuditContext,
  ): EmployeeEarning;
}
