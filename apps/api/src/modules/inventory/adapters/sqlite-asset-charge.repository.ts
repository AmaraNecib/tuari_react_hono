/**
 * SqliteAssetChargeRepository — Drizzle-backed implementation of
 * InventoryAssetChargeRepository (#413).
 *
 * Shares the connection-wide FIFO lock with every other module on the shared
 * better-sqlite3 connection, so a charge write issued inside the transfer's
 * open transaction joins it as a SAVEPOINT and commits/rolls back with it —
 * never silently absorbed by another flow (issue #322 / #348 discipline).
 */
import { eq, and, asc, desc, sql } from "drizzle-orm"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"

import type { BetterSqliteDatabase } from "../../../types/sqlite"
import * as schema from "../../../schema"
import { createDrizzleFromSqlite } from "../../../infrastructure/database/drizzle"
import { createFifoLock, runSyncTransaction, type FifoLock } from "../../../infrastructure/database/fifo-lock"
import { createAlgeriaTimestamp } from "../../company/company-time"
import type { MutationAuditContext } from "../../company/company.types"
import type { InventoryAssetChargeRepository } from "../asset-charge.repository"
import type {
  InventoryAssetChargeCreateData,
  InventoryAssetChargeRecord,
  InventoryAssetChargeRevisionCreateData,
  InventoryAssetChargeRevisionRecord,
} from "../asset-charge.types"

function mapCharge(row: Record<string, unknown>): InventoryAssetChargeRecord {
  return {
    id: String(row.id),
    assetUnitId: String(row.assetUnitId),
    projectId: String(row.projectId),
    projectName: row.projectName != null ? String(row.projectName) : null,
    movementId: row.movementId != null ? String(row.movementId) : null,
    amountDzd: Number(row.amountDzd ?? 0),
    status: (row.status as InventoryAssetChargeRecord["status"]) ?? "LIVE",
    voidedAt: row.voidedAt != null ? String(row.voidedAt) : null,
    voidReason: row.voidReason != null ? String(row.voidReason) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  }
}

function mapRevision(row: Record<string, unknown>): InventoryAssetChargeRevisionRecord {
  return {
    id: String(row.id),
    chargeId: String(row.chargeId),
    previousAmountDzd: Number(row.previousAmountDzd ?? 0),
    newAmountDzd: row.newAmountDzd != null ? Number(row.newAmountDzd) : null,
    reason: row.reason != null ? String(row.reason) : null,
    actorUserId: row.actorUserId != null ? String(row.actorUserId) : null,
    actorLabel: row.actorLabel != null ? String(row.actorLabel) : null,
    createdAt: String(row.createdAt),
  }
}

/** Drizzle-backed InventoryAssetChargeRepository. */
export class DrizzleAssetChargeRepository implements InventoryAssetChargeRepository {
  constructor(
    private readonly db: BetterSQLite3Database<typeof schema>,
    private readonly raw: BetterSqliteDatabase,
    private readonly connectionLock: FifoLock = createFifoLock(),
  ) {
    this.raw.pragma("foreign_keys = ON")
  }

  /** withTransaction — joins our own open transaction, throws on a foreign one. */
  withTransaction<T>(callback: () => T): T {
    return runSyncTransaction(this.connectionLock, this.raw, callback)
  }

  /** createCharge. */
  createCharge(data: InventoryAssetChargeCreateData) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    runSyncTransaction(this.connectionLock, this.raw, () => {
      this.db.insert(schema.inventoryAssetCharge).values({
        id,
        assetUnitId: data.assetUnitId,
        projectId: data.projectId,
        movementId: data.movementId ?? null,
        amountDzd: data.amountDzd,
        status: "LIVE",
        actorUserId: data.actorUserId ?? null,
        actorLabel: data.actorLabel ?? null,
        transactionId: data.transactionId ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }).run()
    })

    return this.getChargeById(id)!
  }

  /** getChargeById. */
  getChargeById(id: string) {
    const row = this.db.select().from(schema.inventoryAssetCharge)
      .where(eq(schema.inventoryAssetCharge.id, id))
      .limit(1).all()[0]
    return row ? this.withProjectName(mapCharge(row)) : null
  }

  /** listChargesByUnit — insertion order (rowid), newest first. */
  listChargesByUnit(assetUnitId: string) {
    return this.db.select().from(schema.inventoryAssetCharge)
      .where(eq(schema.inventoryAssetCharge.assetUnitId, assetUnitId))
      .orderBy(desc(sql`rowid`))
      .all().map(mapCharge).map((charge) => this.withProjectName(charge))
  }

  /** listChargesByProject — insertion order (rowid), newest first. */
  listChargesByProject(projectId: string) {
    return this.db.select().from(schema.inventoryAssetCharge)
      .where(eq(schema.inventoryAssetCharge.projectId, projectId))
      .orderBy(desc(sql`rowid`))
      .all().map(mapCharge).map((charge) => this.withProjectName(charge))
  }

  /** getLastChargeAmount. */
  getLastChargeAmount(assetUnitId: string) {
    const row = this.db.select({ amountDzd: schema.inventoryAssetCharge.amountDzd })
      .from(schema.inventoryAssetCharge)
      .where(and(
        eq(schema.inventoryAssetCharge.assetUnitId, assetUnitId),
        eq(schema.inventoryAssetCharge.status, "LIVE"),
      ))
      .orderBy(desc(sql`rowid`))
      .limit(1).all()[0]
    return row ? Number(row.amountDzd ?? 0) : null
  }

  /** updateCharge — charge update + optional revision in one transaction. */
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
    runSyncTransaction(this.connectionLock, this.raw, () => {
      this.db.update(schema.inventoryAssetCharge).set({
        amountDzd: fields.amountDzd,
        status: fields.status,
        voidedAt: fields.voidedAt,
        voidedBy: fields.voidedBy,
        voidReason: fields.voidReason,
        updatedAt: fields.updatedAt,
      }).where(eq(schema.inventoryAssetCharge.id, id)).run()

      if (revision) {
        this.insertRevision(revision)
      }
    })

    return this.getChargeById(id)
  }

  /** createRevision. */
  createRevision(data: InventoryAssetChargeRevisionCreateData) {
    const id = crypto.randomUUID()
    runSyncTransaction(this.connectionLock, this.raw, () => {
      this.insertRevision(data, id)
    })

    const row = this.db.select().from(schema.inventoryAssetChargeRevision)
      .where(eq(schema.inventoryAssetChargeRevision.id, id))
      .limit(1).all()[0]
    return mapRevision(row!)
  }

  /** listRevisions — insertion order (rowid), oldest first. */
  listRevisions(chargeId: string) {
    return this.db.select().from(schema.inventoryAssetChargeRevision)
      .where(eq(schema.inventoryAssetChargeRevision.chargeId, chargeId))
      .orderBy(asc(sql`rowid`))
      .all().map(mapRevision)
  }

  private withProjectName(charge: InventoryAssetChargeRecord): InventoryAssetChargeRecord {
    return { ...charge, projectName: this.resolveProjectName(charge.projectId) }
  }

  private resolveProjectName(projectId: string): string | null {
    const row = this.raw.prepare("SELECT name FROM project WHERE id = ?").get(projectId) as
      | { name?: string }
      | undefined
    return row?.name != null ? String(row.name) : null
  }

  private insertRevision(data: InventoryAssetChargeRevisionCreateData, id = crypto.randomUUID()) {
    this.db.insert(schema.inventoryAssetChargeRevision).values({
      id,
      chargeId: data.chargeId,
      previousAmountDzd: data.previousAmountDzd,
      newAmountDzd: data.newAmountDzd,
      reason: data.reason ?? null,
      actorUserId: data.actorUserId ?? null,
      actorLabel: data.actorLabel ?? null,
      transactionId: data.transactionId ?? null,
      createdAt: createAlgeriaTimestamp(),
    }).run()
  }
}
/** Create a Drizzle-backed InventoryAssetChargeRepository from a raw SQLite handle. */
export function createAssetChargeRepository(
  rawDb: BetterSqliteDatabase,
  connectionLock: FifoLock = createFifoLock(),
  drizzleDb?: BetterSQLite3Database<typeof schema>,
): InventoryAssetChargeRepository {
  const db = drizzleDb ?? createDrizzleFromSqlite(rawDb)
  return new DrizzleAssetChargeRepository(db, rawDb, connectionLock)
}
