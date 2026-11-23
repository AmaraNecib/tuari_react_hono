import type {
  InventoryAssetCharge,
  InventoryAssetChargeDefault,
  InventoryAssetChargeDetail,
  InventoryAssetChargeRevision,
} from "@tuari/contracts"

/** A charge row as persisted. */
export type InventoryAssetChargeRecord = InventoryAssetCharge
/** A recorded correction/void of a charge. */
export type InventoryAssetChargeRevisionRecord = InventoryAssetChargeRevision
/** A charge plus its correction history. */
export type InventoryAssetChargeDetailRecord = InventoryAssetChargeDetail
/** Resolved prefill for a new placement charge. */
export type InventoryAssetChargeDefaultRecord = InventoryAssetChargeDefault

/** Input for creating a placement charge (inside the transfer transaction). */
export type InventoryAssetChargeCreateData = {
  assetUnitId: string
  projectId: string
  movementId?: string | null
  amountDzd: number
  actorUserId?: string | null
  actorLabel?: string | null
  transactionId?: string | null
}

/** Input for appending a correction/void revision. */
export type InventoryAssetChargeRevisionCreateData = {
  chargeId: string
  previousAmountDzd: number
  /** `null` records a void. */
  newAmountDzd: number | null
  reason?: string | null
  actorUserId?: string | null
  actorLabel?: string | null
  transactionId?: string | null
}

/** The minimal inventory lookups the charge service needs. */
export type InventoryAssetChargeAssetLookup = {
  getAssetUnitById(id: string): { id: string; purchasePriceDzd: number } | null
  projectExists(id: string): boolean
}
