# Employee earnings query module

Base: `2e21daa6388d6cf59dca4b3c72693efd70da8980`. Verification mode: focused-local / CI-final-pending. Tier: high-assurance because approval writes exact DZD amounts and durable request identity.

The module exports `useEmployeeEarningsQuery(employeeId?: string)` and `useApproveEmployeeEarningMutation()`. The list returns the real `employeeEarningsList` output. Approval accepts `EmployeeEarningApprovalInput` unchanged and resolves to the approved `EmployeeEarning`. Caller-owned `requestId`, exact monetary strings, and segment order pass directly to the RPC.

Query keys include the signed-in user and employee filter. Successful approval invalidates that user's earnings list, employee snapshot/domain data, and project-cost keys for the input's distinct project IDs. No schema, stored request draft, or UI seam changes. Workspace key factories provide the employee and project-cost invalidation keys; no dependency export is needed.

Vocabulary: an earning is the approved DZD record; each segment attributes part of it to one project. Architecture: one new feature query/mutation module; no existing seam moved. Applied wisdom: no matching earnings wisdom found. Original app compositions remain untouched. CI acceptance and protection remain pending.
