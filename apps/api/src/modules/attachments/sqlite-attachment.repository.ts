import { eq } from "drizzle-orm";
import { createDrizzleFromSqlite } from "../../infrastructure/database/drizzle";
import { runSyncTransaction, type FifoLock } from "../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import * as schema from "../../schema";
import { createAlgeriaTimestamp } from "../company/company-time";
import type { InventoryInvoiceAttachmentCreateData, InventoryInvoiceAttachmentRecord } from "../inventory/inventory.types";
import type { AttachmentRepository } from "./attachment.repository";

function mapAttachment(row: Record<string, unknown>): InventoryInvoiceAttachmentRecord {
  const id = String(row.id)
  return {
    id,
    invoiceGroupId: String(row.invoiceGroupId),
    originalName: String(row.originalName),
    mimeType: String(row.mimeType),
    byteSize: Number(row.byteSize),
    storageKey: String(row.storageKey),
    relativePath: String(row.relativePath),
    downloadUrl: `/api/inventory/attachments/${id}`,
    sha256: row.sha256 != null ? String(row.sha256) : null,
    createdAt: String(row.createdAt),
  }
}


export class SqliteAttachmentRepository implements AttachmentRepository {
  private readonly db;
  constructor(private readonly raw: BetterSqliteDatabase, private readonly connectionLock: FifoLock) {
    this.db = createDrizzleFromSqlite(raw);
  }
  withTransaction<T>(callback: () => T): T {
    return runSyncTransaction(this.connectionLock, this.raw, callback);
  }
  invoiceGroupExists(id: string): boolean {
    return !!this.db.select({ id: schema.inventoryInvoiceGroup.id }).from(schema.inventoryInvoiceGroup).where(eq(schema.inventoryInvoiceGroup.id, id)).limit(1).all()[0];
  }
  /** createAttachment. */
  createAttachment(data: InventoryInvoiceAttachmentCreateData) {
    const id = crypto.randomUUID()
    const timestamp = createAlgeriaTimestamp()
    runSyncTransaction(this.connectionLock, this.raw, () => {
      this.db.insert(schema.inventoryInvoiceAttachment).values({
        id, invoiceGroupId: data.invoiceGroupId, originalName: data.originalName,
        mimeType: data.mimeType, byteSize: data.byteSize, storageKey: data.storageKey,
        relativePath: data.relativePath, sha256: data.sha256 ?? null, createdAt: timestamp,
      }).run()
    })
    return this.getAttachmentById(id)!
  }

  /** getAttachmentById. */
  getAttachmentById(id: string) {
    const row = this.db.select().from(schema.inventoryInvoiceAttachment)
      .where(eq(schema.inventoryInvoiceAttachment.id, id))
      .limit(1).all()[0]
    return row ? mapAttachment(row) : null
  }


}
