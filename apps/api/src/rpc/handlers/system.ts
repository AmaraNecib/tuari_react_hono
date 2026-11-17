import { implement } from "@orpc/server"

import { toFailureResult } from "../../modules/company/company.errors"
import type { SystemLogListFilters } from "../../modules/company/company.types"
import type { CompanyService } from "../../modules/company/company.service"
import type { RecoveryKeyService } from "../../modules/auth/recovery-key.service"
import type { RoleModule } from "../../modules/rbac/role.module"
import type { DatabaseKeyManager } from "../../infrastructure/database/database-key-manager"
import type { DatabaseKeyPersister } from "../../infrastructure/database/database-key-persister"
import type { RpcMiddleware } from "../rpc-middleware"
import type { ChangeDbKeyInput, ConsumeRecoveryKeyInput, RevokeRecoveryKeyInput } from "./handler-inputs"

/**
 * Recovery keys and encryption-key rotation stay available in the exact app.
 * Mutations use the existing audited rate limiter, and generated keys return
 * their plaintext only once. Rekey failures preserve the backend's explicit
 * applied/not-applied/ambiguous outcome so callers do not restore an old key
 * over a database that may already use the new one.
 */
export function createRecoverySecurityHandlers(
  os: ReturnType<typeof implement>,
  middleware: RpcMiddleware,
  recoveryKeyService: RecoveryKeyService,
  databaseKeyManager: DatabaseKeyManager,
  databaseKeyPersister: DatabaseKeyPersister,
) {
  return {
    getRecoveryKeyPool: os.getRecoveryKeyPool.handler(middleware.queryAuth(async () => recoveryKeyService.getPoolStatus())),
    generateRecoveryKeys: os.generateRecoveryKeys.handler(middleware.mutationAuditRateLimited(
      async () => ({ keys: await recoveryKeyService.generateKeys() }), toFailureResult,
    )),
    consumeRecoveryKey: os.consumeRecoveryKey.handler(middleware.mutationAuditRateLimited(
      async ({ input }) => ({ success: await recoveryKeyService.consumeKey((input as ConsumeRecoveryKeyInput).key) }), toFailureResult,
    )),
    revokeRecoveryKey: os.revokeRecoveryKey.handler(middleware.mutationAuditRateLimited(
      async ({ input }) => ({ success: await recoveryKeyService.revokeKey((input as RevokeRecoveryKeyInput).keyId) }), toFailureResult,
    )),
    changeDbEncryptionKey: os.changeDbEncryptionKey.handler(middleware.mutationAuditRateLimited(
      ({ input }) => {
        const { currentKey, newKey } = input as ChangeDbKeyInput
        // changeKey verifies the current key with a fresh handle before PRAGMA rekey.
        const result = databaseKeyManager.changeKey(currentKey, newKey)
        if (!result.success) return { ...result, rekeyed: result.rekeyed ?? false }
        // Persist the key used on the next process start. A persistence failure
        // after a successful rekey must report `rekeyed: true`.
        const persisted = databaseKeyPersister.persistKey(newKey)
        if (!persisted.success) return { ...persisted, rekeyed: true }
        return { success: true }
      }, toFailureResult,
    )),
  }
}

/** Legacy workspace, audit, and security handlers. */
export function createSystemHandlers(
  os: ReturnType<typeof implement>,
  middleware: RpcMiddleware,
  companyService: CompanyService,
  recoveryKeyService: RecoveryKeyService,
  roleModule: RoleModule,
  databaseKeyManager: DatabaseKeyManager,
  databaseKeyPersister: DatabaseKeyPersister,
) {
  return {
    workspaceSnapshot: os.workspaceSnapshot.handler(middleware.queryAuth(async () => {
      const [snapshot, roles] = await Promise.all([companyService.getWorkspaceSnapshot(), roleModule.list()])
      return { ...snapshot, roles }
    })),
    systemLogList: os.systemLogList.handler(middleware.queryAuth(async ({ input }) =>
      companyService.listSystemLog(input as SystemLogListFilters | undefined)
    )),
    ...createRecoverySecurityHandlers(os, middleware, recoveryKeyService, databaseKeyManager, databaseKeyPersister),
  }
}
