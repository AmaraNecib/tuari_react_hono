import { implement } from "@orpc/server";


import { toFailureResult } from "../../modules/company/company.errors";
import type { SystemLogListFilters } from "../../modules/company/company.types";
import type { CompanyService } from "../../modules/company/company.service";
import type { RecoveryKeyService } from "../../modules/auth/recovery-key.service";
import type { RoleModule } from "../../modules/rbac/role.module";
import type { DatabaseKeyManager } from "../../infrastructure/database/database-key-manager";
import type { DatabaseKeyPersister } from "../../infrastructure/database/database-key-persister";
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
 * @param databaseKeyPersister - Persists a rotated key so a process restart
 *                               can still open the database (issue #265)
 */
export function createSystemHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  companyService: CompanyService,
  recoveryKeyService: RecoveryKeyService,
  roleModule: RoleModule,
  databaseKeyManager: DatabaseKeyManager,
  databaseKeyPersister: DatabaseKeyPersister,
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

    // Defense-in-depth (#175): these are the high-value credential / encryption-
    // rotation mutations in the threat surface (recovery-key pool + DB-key
    // rotation). They already require a bootstrap-owner session; the rate-limited
    // variant additionally charges each against the shared per-IP budget
    // (100 req / 15 min) so a compromised-but-active session, or IP-level abuse,
    // cannot thrash these expensive/irreversible operations.
    generateRecoveryKeys: os.generateRecoveryKeys.handler(m.mutationAuditRateLimited(
      async () => {
        const keys = await recoveryKeyService.generateKeys();
        return { keys };
      },
      toFailureResult,
    )),

    consumeRecoveryKey: os.consumeRecoveryKey.handler(m.mutationAuditRateLimited(
      async ({ input }) => {
        const success = await recoveryKeyService.consumeKey((input as ConsumeRecoveryKeyInput).key);
        return { success };
      },
      toFailureResult,
    )),

    revokeRecoveryKey: os.revokeRecoveryKey.handler(m.mutationAuditRateLimited(
      async ({ input }) => {
        const success = await recoveryKeyService.revokeKey((input as RevokeRecoveryKeyInput).keyId);
        return { success };
      },
      toFailureResult,
    )),

    changeDbEncryptionKey: os.changeDbEncryptionKey.handler(m.mutationAuditRateLimited(
      ({ input }) => {
        const { currentKey, newKey } = input as ChangeDbKeyInput;
        // The port verifies the current key (fresh connection — SQLCipher
        // ignores `PRAGMA key` after the first read on the shared connection)
        // and re-encrypts with the new key via PRAGMA rekey. It never throws —
        // a failed verification or rekey maps straight onto the wire failure
        // output shape with an honest reason.
        const result = databaseKeyManager.changeKey(currentKey, newKey);
        if (!result.success) {
          // The port reports rekeyed: true only when the database IS on the
          // new key despite the failure (a verified rekey whose persistence
          // failed). Ambiguous post-rekey probe failures (Greptile P1) — the
          // rekey ran but could not be verified — are forwarded with
          // rekeyed: false AND ambiguous: true: the caller must NOT restore
          // the old key (the database is likely on the new key) and must NOT
          // clear the rollback slot; the outcome stays pending. The
          // ?? false default keeps every other failure on the same safe side.
          return { ...result, rekeyed: result.rekeyed ?? false };
        }
        // The database WAS re-encrypted — persist the new key so a restart
        // can still open it (issue #265). A persistence failure is surfaced
        // honestly WITH rekeyed: true, so the caller knows the database is on
        // the new key and must NOT roll its keyring back (that would orphan
        // the re-encrypted database).
        const persisted = databaseKeyPersister.persistKey(newKey);
        if (!persisted.success) {
          return { ...persisted, rekeyed: true };
        }
        return { success: true };
      },
      toFailureResult,
    )),
  };
}
