/**
 * Workspace mutation context.
 *
 * The cross-domain mutation helpers (`withTransaction`,
 * `createMutationAuditContext`) used to live as private methods on
 * `CompanyService`. After the Plan 005 Phase 3 split, every domain
 * service (workforce, operations, finance) needs the same helpers.
 *
 * This class bundles the helpers in a small object that the domain
 * services and `CompanyService` can both share. It is intentionally
 * NOT a singleton — each domain service gets its own instance so the
 * per-service transaction semantics stay isolated.
 */

import { TransactionManager } from "./transaction-manager";
import type { CompanyRepository } from "./company.repository";
import { CompanyError } from "./company.errors";
import type { MutationAuditContext, MutationAuditContext as RawAuditContext } from "./company.types";
import { normalizeMutationAuditContext, type WorkspaceAdminAuthorizer } from "./company.helpers";

export class WorkspaceMutationContext {
  private readonly transactionManager: TransactionManager;

  constructor(
    private readonly repository: CompanyRepository,
    private readonly workspaceAdminAuthorizer?: WorkspaceAdminAuthorizer,
  ) {
    this.transactionManager = new TransactionManager(repository);
  }

  /** Validates and normalizes the audit context. Throws if a non-admin tries to mutate when the authorizer is configured. */
  createMutationAuditContext(
    auditContext?: RawAuditContext,
  ): Required<RawAuditContext> {
    const audit = normalizeMutationAuditContext(auditContext);

    if (!this.workspaceAdminAuthorizer) {
      return audit;
    }

    if (
      !audit.actorUserId ||
      !this.workspaceAdminAuthorizer.isBootstrapOwner(audit.actorUserId)
    ) {
      throw new CompanyError(
        "UNAUTHORIZED",
        "هذا الإجراء متاح فقط لحساب الإدارة الرئيسي.",
      );
    }

    return audit;
  }

  /** Runs `operation` inside a Drizzle transaction. */
  withTransaction<T>(operation: () => T): T {
    return this.transactionManager.execute(operation);
  }
}

export type { MutationAuditContext };
