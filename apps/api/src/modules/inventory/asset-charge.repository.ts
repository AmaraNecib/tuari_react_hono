import type { MutationAuditContext } from "../company/company.types"
import type {
  InventoryAssetChargeCreateData,
  InventoryAssetChargeRecord,
  InventoryAssetChargeRevisionCreateData,
  InventoryAssetChargeRevisionRecord,
} from "./asset-charge.types"

/**
 * InventoryAssetChargeRepository — persistence port for project charges (#413).
 *
 * Kept separate from the (large) `InventoryRepository` so the in-memory test
 * double stays small and the charge rules are testable without a database.
 * The SQLite adapter shares the connection-wide FIFO lock, so a charge write
 * issued inside the transfer's open transaction joins it as a SAVEPOINT.
 */
export interface InventoryAssetChargeRepository {
  /** Run a callback inside the shared-connection transaction. */
  withTransaction<T>(callback: () => T): T
  /** createCharge. */
  createCharge(data: InventoryAssetChargeCreateData): InventoryAssetChargeRecord
  /** getChargeById. */
  getChargeById(id: string): InventoryAssetChargeRecord | null
  /** listChargesByUnit — newest first, LIVE and VOID. */
  listChargesByUnit(assetUnitId: string): InventoryAssetChargeRecord[]
  /** listChargesByProject — LIVE and VOID, newest first. */
  listChargesByProject(projectId: string): InventoryAssetChargeRecord[]
  /** getLastChargeAmount — the most recent LIVE amount for the unit, else null. */
  getLastChargeAmount(assetUnitId: string): number | null
  /**
   * updateCharge — update the mutable charge fields and, when `revision` is
   * present, append the from → to history row in the same transaction. The
   * UPDATE carries `AND status='LIVE'`, so a correction/void that races a
   * concurrent void changes no row and returns null instead of resurrecting
   * or overwriting the voided charge (#422 round 4).
   */
  updateCharge(
    id: string,
    fields: {
      amountDzd?: number
      status?: InventoryAssetChargeRecord["status"]
      voidedAt?: string | null
      voidedBy?: string | null
      voidReason?: string | null
      updatedAt: string
    },
    revision?: InventoryAssetChargeRevisionCreateData,
    auditContext?: MutationAuditContext,
  ): InventoryAssetChargeRecord | null
  /** createRevision. */
  createRevision(data: InventoryAssetChargeRevisionCreateData): InventoryAssetChargeRevisionRecord
  /** listRevisions — oldest first. */
  listRevisions(chargeId: string): InventoryAssetChargeRevisionRecord[]
}
