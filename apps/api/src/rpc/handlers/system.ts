import { implement } from "@orpc/server";


import { toFailureResult } from "../../modules/company/company.errors";
import type { SystemLogListFilters } from "../../modules/company/company.types";
import type { CompanyService } from "../../modules/company/company.service";
import type { RecoveryKeyService } from "../../modules/auth/recovery-key.service";
import type { RoleModule } from "../../modules/rbac/role.module";
import type { BetterSqliteDatabase } from "../../types/sqlite";
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
 * @param rawDatabase - Raw SQLite handle for PRAGMA rekey operations
 */
export function createSystemHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  companyService: CompanyService,
  recoveryKeyService: RecoveryKeyService,
  roleModule: RoleModule,
  rawDatabase: BetterSqliteDatabase,
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
      () => {
        const keys = recoveryKeyService.generateKeys();
        return { keys };
      },
      toFailureResult,
    )),

    consumeRecoveryKey: os.consumeRecoveryKey.handler(m.mutationAudit(
      ({ input }) => {
        const success = recoveryKeyService.consumeKey((input as ConsumeRecoveryKeyInput).key);
        return { success };
      },
      toFailureResult,
    )),

    revokeRecoveryKey: os.revokeRecoveryKey.handler(m.mutationAudit(
      ({ input }) => {
        const success = recoveryKeyService.revokeKey((input as RevokeRecoveryKeyInput).keyId);
        return { success };
      },
      toFailureResult,
    )),

    changeDbEncryptionKey: os.changeDbEncryptionKey.handler(m.mutationAudit(
      ({ input }) => {
        const { currentKey, newKey } = input as ChangeDbKeyInput;
        // Verify current key works by reading actual data (touches encrypted pages)
        try {
          rawDatabase.pragma(`key = '${currentKey.replace(/'/g, "''")}'`);
          rawDatabase.prepare("SELECT COUNT(*) FROM sqlite_master").get();
        } catch {
          return { success: false, error: "Current encryption key is invalid" };
        }

        // Re-encrypt with new key via PRAGMA rekey
        rawDatabase.pragma(`rekey = '${newKey.replace(/'/g, "''")}'`);
        return { success: true };
      },
      toFailureResult,
    )),
  };
}
