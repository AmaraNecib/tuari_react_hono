import type { MutationAuditContext } from "../company/company.types"
import { InventoryError } from "./inventory.errors"

export type WorkspaceAdminAuthorizer = { isBootstrapOwner(userId: string): boolean }

export function createInventoryMutationAudit(auditContext?: MutationAuditContext, authorizer?: WorkspaceAdminAuthorizer): Required<MutationAuditContext> {
  const audit = {
    actorUserId: auditContext?.actorUserId ?? null,
    actorLabel: auditContext?.actorLabel ?? null,
    transactionId: auditContext?.transactionId ?? crypto.randomUUID(),
  }
  if (authorizer && (!audit.actorUserId || !authorizer.isBootstrapOwner(audit.actorUserId))) {
    throw new InventoryError("UNAUTHORIZED", "هذا الإجراء متاح فقط لحساب الإدارة الرئيسي.")
  }
  return audit
}
