import { implement } from "@orpc/server";


import { toFailureResult } from "../../modules/company/company.errors";
import type { SystemLogListFilters } from "../../modules/company/company.types";
import type { CompanyService } from "../../modules/company/company.service";
import type { RecoveryKeyService } from "../../modules/auth/recovery-key.service";
import type { RoleModule } from "../../modules/rbac/role.module";
import type { DatabaseKeyManager } from "../../infrastructure/database/database-key-manager";
import type { RpcMiddleware } from "../rpc-middleware";
import type { ChangeDbKeyInput, ConsumeRecoveryKeyInput, RevokeRecoveryKeyInput } from "./handler-inputs";

/**
 * Create system handlers for workspace, logs, and security management.
 *
 * @param os - ORPC implementation builder
 * @param m - RPC middleware (auth, audit, etc.)
 * @param companyService - Company/workspace service
 * @param recoveryKeyService - Recovery key lifecycle service
 * @param roleModule - Deep module for role queries with permissions
 * @param databaseKeyManager - Narrow port for verifying/rotating the database
 *                             encryption key (the raw handle stays in the
 *                             composition root)
 */
export function createSystemHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  companyService: CompanyService,
  recoveryKeyService: RecoveryKeyService,
  roleModule: RoleModule,
  databaseKeyManager: DatabaseKeyManager,
) {
  return {
    workspaceSnapshot: os.workspaceSnapshot.handler(m.queryAuth(async () => {
      const [snapshot, roles] = await Promise.all([
        companyService.getWorkspaceSnapshot(),
        roleModule.list(),
      ]);
      // Issue #10 — overlay the rbac role records (with permissions) on
      // top of the legacy role list. The deep module is the source of
      // truth for the role management surface; the rest of the workspace
      // still uses the company service.
      return { ...snapshot, roles };
    })),
    systemLogList: os.systemLogList.handler(m.queryAuth(async ({ input }) =>
      companyService.listSystemLog(input as SystemLogListFilters | undefined)
    )),

    // Recovery key management
    getRecoveryKeyPool: os.getRecoveryKeyPool.handler(m.queryAuth(async () => {
      return recoveryKeyService.getPoolStatus();
    })),

    generateRecoveryKeys: os.generateRecoveryKeys.handler(m.mutationAudit(
      async () => {
        const keys = await recoveryKeyService.generateKeys();
        return { keys };
      },
      toFailureResult,
    )),

    consumeRecoveryKey: os.consumeRecoveryKey.handler(m.mutationAudit(
      async ({ input }) => {
        const success = await recoveryKeyService.consumeKey((input as ConsumeRecoveryKeyInput).key);
        return { success };
      },
      toFailureResult,
    )),

    revokeRecoveryKey: os.revokeRecoveryKey.handler(m.mutationAudit(
      async ({ input }) => {
        const success = await recoveryKeyService.revokeKey((input as RevokeRecoveryKeyInput).keyId);
        return { success };
      },
      toFailureResult,
    )),

    changeDbEncryptionKey: os.changeDbEncryptionKey.handler(m.mutationAudit(
      ({ input }) => {
        const { currentKey, newKey } = input as ChangeDbKeyInput;
        // The port verifies the current key (touching encrypted pages) and
        // re-encrypts with the new key via PRAGMA rekey. A failed verification
        // surfaces as `false` — map it to the wire failure output shape.
        if (!databaseKeyManager.changeKey(currentKey, newKey)) {
          return { success: false, error: "Current encryption key is invalid" };
        }

        return { success: true };
      },
      toFailureResult,
    )),
  };
}
