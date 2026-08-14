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

import type { TransactionalRepository } from "./company.repository.contracts";
import { CompanyError } from "./company.errors";
import { type MutationAuditContext as RawAuditContext } from "./company.types";
import { normalizeMutationAuditContext, type WorkspaceAdminAuthorizer } from "./company.helpers";

export class WorkspaceMutationContext {
  constructor(
    private readonly repository: TransactionalRepository,
    private readonly workspaceAdminAuthorizer?: WorkspaceAdminAuthorizer,
  ) {}

  /**
   * The configured workspace-admin authorizer, if any. The workforce service
   * hands it to the admin-role assignment guard so the privilege boundary
   * (only the bootstrap owner may mint an `admin` employee) is enforced at
   * the role-validation point, independently of the mutation-wide gate.
   */
  get adminAuthorizer(): WorkspaceAdminAuthorizer | undefined {
    return this.workspaceAdminAuthorizer;
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

  /** Runs `operation` inside a repository transaction (commit on success, rollback on error). */
  withTransaction<T>(operation: () => T): T {
    return this.repository.withTransaction(operation);
  }
}
