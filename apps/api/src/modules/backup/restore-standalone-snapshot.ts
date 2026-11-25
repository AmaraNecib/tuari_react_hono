import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { InventoryAttachmentStorage } from "../inventory/inventory.storage";
import { verifyRestoredAttachments } from "./verify-restored-attachments";

/** Restore into a new disposable directory only. A rejected directory is not a complete restore. */
export async function restoreStandaloneSnapshot(snapshotPath: string, destination: string, databaseKey = "") {
  await mkdir(destination);
  const databasePath = join(destination, "tuari.sqlite");
  const attachmentsRootPath = join(destination, "attachments");
  await cp(join(snapshotPath, "tuari.sqlite"), databasePath, {errorOnExist:true,force:false});
  // Old snapshots may omit the directory only when no attachment is referenced.
  try { await cp(join(snapshotPath,"attachments"), attachmentsRootPath,{recursive:true,errorOnExist:true,force:false}); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const db = createDatabaseConnection(databasePath,databaseKey);
  try {
    const integrity = db.pragma("integrity_check") as {integrity_check:string}[];
    if (integrity[0]?.integrity_check !== "ok") throw new Error("Restored database integrity check failed");
    const result = await verifyRestoredAttachments(db,new InventoryAttachmentStorage(attachmentsRootPath));
    return {databasePath,attachmentsRootPath,...result};
  } finally { db.close(); }
}
