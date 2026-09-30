/**
 * In-memory adapter for InventoryAssetChargeRepository (#413).
 *
 * Mirrors the SQLite adapter's behaviour without a database so the charge
 * rules can be tested in milliseconds. Lives in `adapters/` next to the sqlite
 * implementation (the module's seam stays at the root).
 */
import { createAlgeriaTimestamp } from "../../company/company-time"
import type { MutationAuditContext } from "../../company/company.types"
import type { InventoryAssetChargeRepository } from "../asset-charge.repository"
import type {
  InventoryAssetChargeCreateData,
  InventoryAssetChargeRecord,
  InventoryAssetChargeRevisionCreateData,
  InventoryAssetChargeRevisionRecord,
} from "../asset-charge.types"

export function createInMemoryAssetChargeRepository(): InventoryAssetChargeRepository & {
  _charges: Map<string, InventoryAssetChargeRecord>
  _revisions: Map<string, InventoryAssetChargeRevisionRecord>
} {
  const charges = new Map<string, InventoryAssetChargeRecord>()
  const revisions = new Map<string, InventoryAssetChargeRevisionRecord>()

  // JS Map preserves insertion order, which is the charge "chain" order a
  // single-millisecond batch of writes would otherwise lose to a timestamp
  // sort (createAlgeriaTimestamp has millisecond precision).
  function newestFirst(chargesInOrder: InventoryAssetChargeRecord[]) {
    return [...chargesInOrder].reverse()
  }

  function insertRevision(data: InventoryAssetChargeRevisionCreateData) {
    const revision: InventoryAssetChargeRevisionRecord = {
      id: crypto.randomUUID(),
      chargeId: data.chargeId,
      previousAmountDzd: data.previousAmountDzd,
      newAmountDzd: data.newAmountDzd,
      reason: data.reason ?? null,
      actorUserId: data.actorUserId ?? null,
      actorLabel: data.actorLabel ?? null,
      createdAt: createAlgeriaTimestamp(),
    }
    revisions.set(revision.id, revision)
    return { ...revision }
  }

  return {
    _charges: charges,
    _revisions: revisions,

    withTransaction<T>(callback: () => T): T {
      // Snapshot/restore so the double mirrors the sqlite savepoint: a throw
      // inside the callback discards every charge/revision written during it.
      // Without this the double could only prove its own harness (#422 round 7).
      const chargeSnapshot = new Map(charges)
      const revisionSnapshot = new Map(revisions)
      try {
        return callback()
      } catch (error) {
        charges.clear()
        for (const [id, charge] of chargeSnapshot) charges.set(id, charge)
        revisions.clear()
        for (const [id, revision] of revisionSnapshot) revisions.set(id, revision)
        throw error
      }
    },

    createCharge(data: InventoryAssetChargeCreateData) {
      const timestamp = createAlgeriaTimestamp()
      const charge: InventoryAssetChargeRecord = {
        id: crypto.randomUUID(),
        assetUnitId: data.assetUnitId,
        projectId: data.projectId,
        projectName: null,
        movementId: data.movementId ?? null,
        amountDzd: data.amountDzd,
        status: "LIVE",
        voidedAt: null,
        voidReason: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      charges.set(charge.id, charge)
      return { ...charge }
    },

    getChargeById(id: string) {
      const charge = charges.get(id)
      return charge ? { ...charge } : null
    },

    listChargesByUnit(assetUnitId: string) {
      const matching = [...charges.values()].filter((charge) => charge.assetUnitId === assetUnitId)
      return newestFirst(matching).map((charge) => ({ ...charge }))
    },

    listChargesByProject(projectId: string) {
      const matching = [...charges.values()].filter((charge) => charge.projectId === projectId)
      return newestFirst(matching).map((charge) => ({ ...charge }))
    },

    getLastChargeAmount(assetUnitId: string) {
      const matching = [...charges.values()].filter(
        (charge) => charge.assetUnitId === assetUnitId && charge.status === "LIVE",
      )
      const latest = newestFirst(matching)[0]
      return latest ? latest.amountDzd : null
    },

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
      _auditContext?: MutationAuditContext,
    ) {
      const current = charges.get(id)
      // Mirror the sqlite adapter's `AND status='LIVE'` guard: a correction or
      // void only applies to a live row and appends no revision otherwise.
      if (!current || current.status !== "LIVE") {
        return null
      }

      const next: InventoryAssetChargeRecord = {
        ...current,
        amountDzd: fields.amountDzd ?? current.amountDzd,
        status: fields.status ?? current.status,
        voidedAt: fields.voidedAt !== undefined ? fields.voidedAt : current.voidedAt,
        voidReason: fields.voidReason !== undefined ? fields.voidReason : current.voidReason,
        updatedAt: fields.updatedAt,
      }
      charges.set(id, next)

      if (revision) {
        insertRevision(revision)
      }

      return { ...next }
    },

    createRevision(data: InventoryAssetChargeRevisionCreateData) {
      return insertRevision(data)
    },

    listRevisions(chargeId: string) {
      return [...revisions.values()]
        .filter((revision) => revision.chargeId === chargeId)
        .map((revision) => ({ ...revision }))
    },

    listRevisionsByChargeIds(chargeIds: string[]) {
      const wanted = new Set(chargeIds)
      const grouped = new Map<string, InventoryAssetChargeRevisionRecord[]>()
      // Map insertion order is the revision write order (oldest first), which
      // mirrors the sqlite adapter's rowid ASC ordering.
      for (const revision of revisions.values()) {
        if (!wanted.has(revision.chargeId)) continue
        const list = grouped.get(revision.chargeId) ?? []
        list.push({ ...revision })
        grouped.set(revision.chargeId, list)
      }
      return grouped
    },
  }
}
