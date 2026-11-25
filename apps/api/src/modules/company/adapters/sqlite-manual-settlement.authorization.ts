import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import { ALL_PERMISSIONS, isPermission } from "../../rbac/permissions";
import { ManualSettlementAuthorizationError, type ManualSettlementAuthorization } from "../manual-settlement.service";

/** Request-scoped adapter. The composition caller must authenticate userId before binding it. */
export class SqliteManualSettlementAuthorization implements ManualSettlementAuthorization {
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock, private readonly userId: string) {}
  get transactionIdentity() { return { connection: this.db, lock: this.lock }; }
  canReadInventorySources(): boolean {
    return this.lock.runSync(() => {
      if (!this.db.inTransaction) throw new Error("Settlement source visibility requires the command transaction");
      const state = this.db.prepare("SELECT user_id AS userId FROM app_bootstrap_state WHERE singleton=1 LIMIT 1").get() as { userId: string | null } | undefined;
      const first = state?.userId ? null : this.db.prepare("SELECT id FROM user ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
      return (state?.userId || first?.id) === this.userId;
    });
  }
  authorize(required: readonly string[]): { actorUserId: string; actorLabel: string } {
    return this.lock.runSync(() => {
      if (!this.db.inTransaction) throw new Error("Settlement authorization requires the command transaction");
      const user = this.db.prepare('SELECT id,name,"phoneNumber" AS phone FROM user WHERE id=?').get(this.userId) as { id: string; name: string; phone: string } | undefined;
      if (!user?.phone) throw new ManualSettlementAuthorizationError();
      const state = this.db.prepare("SELECT user_id AS userId FROM app_bootstrap_state WHERE singleton=1 LIMIT 1").get() as { userId: string | null } | undefined;
      const first = state?.userId ? null : this.db.prepare("SELECT id FROM user ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
      const ownerId = state?.userId || first?.id;
      const permissions = ownerId === user.id
        ? new Set<string>(ALL_PERMISSIONS)
        : new Set((this.db.prepare('SELECT rp.permission FROM role_permission rp JOIN employee e ON e.role_id=rp.role_id JOIN user u ON u."phoneNumber"=e.phone WHERE u.id=?').all(user.id) as { permission: string }[]).map(row => row.permission).filter(isPermission));
      if (!required.every(permission => isPermission(permission) && permissions.has(permission))) throw new ManualSettlementAuthorizationError();
      return { actorUserId: user.id, actorLabel: user.name ?? user.phone };
    });
  }
}
