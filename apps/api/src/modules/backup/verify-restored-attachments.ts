import { createHash } from "node:crypto";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import type { InventoryAttachmentStorage } from "../inventory/inventory.storage";

/** Verify a disposable restore before treating its referenced attachments as complete. */
export async function verifyRestoredAttachments(db: BetterSqliteDatabase, storage: Pick<InventoryAttachmentStorage, "readRelativePath">) {
  let verified = 0;
  for (const table of ["inventory_invoice_attachment", "expense_attachment"]) {
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[];
    const hasDigest = columns.some(column => column.name === "sha256");
    const rows = db.prepare(`SELECT relative_path, ${hasDigest ? "sha256" : "NULL AS sha256"} FROM ${table}`).all() as {relative_path:string;sha256:string|null}[];
    for (const row of rows) {
      const bytes = await storage.readRelativePath(row.relative_path);
      if (row.sha256 && createHash("sha256").update(bytes).digest("hex") !== row.sha256) throw new Error(`Restored attachment hash mismatch: ${row.relative_path}`);
      verified++;
    }
  }
  return {verified};
}
