import { browserMonthlyApprovalStore } from "@/features/employees/exact-monthly-approval-recovery"

/** Re-read durable intent at the settings mutation boundary, not at page mount. */
export async function saveAccountWithoutPendingApproval<T>(
  scope: { workspaceId: string; userId: string },
  blockedMessage: string,
  save: () => Promise<T>,
): Promise<T> {
  if (browserMonthlyApprovalStore(scope.workspaceId, scope.userId).load()) throw new Error(blockedMessage)
  return save()
}
