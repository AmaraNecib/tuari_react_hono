import type { BetterSqliteDatabase } from "../../types/sqlite";
import type { FifoLock } from "../../infrastructure/database/fifo-lock";
import { SqliteExactInventoryRepository } from "../inventory/adapters/sqlite-exact-inventory.repository";

/** Read on the writer's connection and FIFO. No second connection or projection cache. */
export class ExactInventoryReportSource {
  private readonly repository: SqliteExactInventoryRepository;
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock, private readonly rowLimit = 100000) {
    if (!Number.isSafeInteger(rowLimit) || rowLimit < 1 || rowLimit > 100000) throw new RangeError("Invalid report row limit");
    this.repository = new SqliteExactInventoryRepository(db, lock);
  }
  snapshot<T>(read: (data: ReturnType<ExactInventoryReportSource["hydrate"]>) => T): T {
    return this.lock.runSync(() => this.db.transaction(() => {
      // Count before any prefix is hydrated, including nested outbound items.
      for (const table of ["inventory_entry", "inventory_invoice_group", "inventory_asset_unit", "inventory_consumable_balance", "inventory_movement", "inventory_outbound_transfer", "inventory_outbound_transfer_item"]) {
        const row = this.db.prepare(`SELECT count(*) AS count FROM "${table}"`).get() as { count: number };
        if (row.count > this.rowLimit) throw new RangeError("Exact inventory report resource limit exceeded");
      }
      return read(this.hydrate());
    }).deferred());
  }
  private hydrate() {
    const repo = this.repository;
    return { groups: repo.listGroups(), entries: repo.listEntries(), assets: repo.listAssets(), balances: repo.listBalances(), movements: repo.listMovements(), outbounds: repo.listOutbounds(), locationLabel: (warehouse: string | null, project: string | null) => repo.locationLabel(warehouse, project) };
  }
}
