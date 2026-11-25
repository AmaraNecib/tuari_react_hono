import { randomUUID } from "node:crypto";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import { runSyncTransaction, type FifoLock } from "../../infrastructure/database/fifo-lock";
import { InventoryError } from "../inventory/inventory.errors";
import type { InventoryUploadFile } from "../inventory/inventory.types";
import type { InventoryAttachmentStorage } from "../inventory/inventory.storage";

export const expenseAttachmentSchema = `CREATE TABLE IF NOT EXISTS expense_attachment (
  id TEXT PRIMARY KEY, expense_id TEXT NOT NULL REFERENCES expense(id) ON DELETE RESTRICT,
  original_name TEXT NOT NULL, mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size >= 0 AND byte_size <= 5242880),
  relative_path TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL, created_at TEXT NOT NULL
)`;
export type ExpenseAttachment = { id: string; expenseId: string; originalName: string; mimeType: string; byteSize: number; relativePath: string; sha256: string; createdAt: string };
const select = `SELECT id, expense_id AS expenseId, original_name AS originalName, mime_type AS mimeType,
 byte_size AS byteSize, relative_path AS relativePath, sha256, created_at AS createdAt FROM expense_attachment`;
const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/** Persistence seam for immutable expense files, independent of expense money mutations. */
export class ExpenseAttachments {
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock,
    private readonly storage: Pick<InventoryAttachmentStorage, "saveInvoiceAttachment" | "deleteRelativePath" | "readRelativePath">) {}

  list(expenseId: string): ExpenseAttachment[] {
    if (!this.db.prepare("SELECT id FROM expense WHERE id=?").get(expenseId)) throw new InventoryError("NOT_FOUND", "Expense not found");
    return this.db.prepare(`${select} WHERE expense_id=? ORDER BY created_at,id`).all(expenseId) as ExpenseAttachment[];
  }

  private validate(expenseId: string, files: InventoryUploadFile[]) {
    const existing = this.list(expenseId);
    if (!files.length || files.length + existing.length > 10 ||
      files.reduce((sum, f) => sum + f.size, existing.reduce((sum, f) => sum + f.byteSize, 0)) > 15 * 1024 * 1024) {
      throw new InventoryError("VALIDATION", "Expense file limit exceeded");
    }
    for (const file of files) {
      if (!allowed.has(file.type)) throw new InventoryError("VALIDATION", "Unsupported file type");
      if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 5 * 1024 * 1024) throw new InventoryError("VALIDATION", "File size limit exceeded");
    }
  }

  async add(expenseId: string, files: InventoryUploadFile[]) {
    this.validate(expenseId, files);
    const saved: ExpenseAttachment[] = [];
    try {
      for (const file of files) {
        const bytes = await file.bytes();
        if (bytes.byteLength !== file.size) throw new InventoryError("VALIDATION", "File size differs from uploaded bytes");
        const stored = await this.storage.saveInvoiceAttachment({ invoiceGroupId: `expense-${expenseId}`, originalName: file.name, bytes });
        saved.push({ id: randomUUID(), expenseId, originalName: file.name, mimeType: file.type, byteSize: bytes.byteLength,
          relativePath: stored.relativePath, sha256: stored.sha256, createdAt: new Date().toISOString() });
      }
      runSyncTransaction(this.lock, this.db, () => {
        // Another upload can finish while bytes are written. Recheck in the insertion transaction.
        this.validate(expenseId, files);
        const insert = this.db.prepare(`INSERT INTO expense_attachment(id,expense_id,original_name,mime_type,byte_size,relative_path,sha256,created_at) VALUES (?,?,?,?,?,?,?,?)`);
        for (const f of saved) insert.run(f.id,f.expenseId,f.originalName,f.mimeType,f.byteSize,f.relativePath,f.sha256,f.createdAt);
      });
      return saved;
    } catch (error) {
      await Promise.allSettled(saved.map(f => this.storage.deleteRelativePath(f.relativePath)));
      throw error;
    }
  }

  async download(expenseId: string, id: string) {
    const attachment = this.list(expenseId).find(file => file.id === id);
    if (!attachment) throw new InventoryError("NOT_FOUND", "Expense file not found");
    return { attachment, body: await this.storage.readRelativePath(attachment.relativePath) };
  }
}
