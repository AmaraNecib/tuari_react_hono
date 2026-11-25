import Database from "better-sqlite3";
import { mkdtemp, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { InventoryAttachmentStorage } from "../inventory/inventory.storage";
import { restoreStandaloneSnapshot } from "../backup/restore-standalone-snapshot";
import { createWorkerSnapshotter } from "../backup/backup.snapshot";
import { ExpenseAttachments, expenseAttachmentSchema } from "./expense-attachments";

const file = (size = 1, type = "application/pdf") => ({ name: "receipt.pdf", type, size, bytes: vi.fn(async () => new Uint8Array(size)) });
async function fixture() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys=ON");
  db.exec("CREATE TABLE expense(id TEXT PRIMARY KEY, status TEXT NOT NULL); INSERT INTO expense VALUES ('one','LIVE'),('two','LIVE')");
  db.exec(expenseAttachmentSchema);
  const root = await mkdtemp(join(tmpdir(), "expense-files-"));
  const storage = new InventoryAttachmentStorage(root);
  return { db, root, storage, service: new ExpenseAttachments(db, createFifoLock(), storage) };
}

describe("expense supporting files", () => {
  it("restores a standalone full snapshot with mixed referenced owners and no live storage", async () => {
    const root = await mkdtemp(join(tmpdir(), "expense-restore-"));
    const databasePath = join(root,"live.sqlite");
    const db = new Database(databasePath);
    db.exec("CREATE TABLE expense(id TEXT PRIMARY KEY); INSERT INTO expense VALUES ('one'),('two'); CREATE TABLE inventory_invoice_attachment(relative_path TEXT,sha256 TEXT)");
    db.exec(expenseAttachmentSchema);
    const storage = new InventoryAttachmentStorage(join(root,"live-files"));
    const service = new ExpenseAttachments(db,createFifoLock(),storage);
    const files = await service.add("one",[file(),file(2)]);
    await service.add("two",[file(3)]);
    const purchase = await storage.saveInvoiceAttachment({invoiceGroupId:"purchase",originalName:"purchase.pdf",bytes:Buffer.from("purchase")});
    await storage.saveInvoiceAttachment({invoiceGroupId:"unreferenced",originalName:"orphan.pdf",bytes:Buffer.from("orphan")});
    db.prepare("INSERT INTO inventory_invoice_attachment VALUES (?,?)").run(purchase.relativePath,purchase.sha256);
    const snapshot = join(root,"snapshot"); await mkdir(snapshot);
    expect((await createWorkerSnapshotter({databasePath,attachmentsRootPath:join(root,"live-files")})(join(snapshot,"tuari.sqlite"))).attachments).toMatchObject({linked:4,copied:0});
    db.close();
    const restored = join(root,"restored");
    expect(await restoreStandaloneSnapshot(snapshot,restored)).toMatchObject({verified:4});
    await rm(snapshot,{recursive:true}); await rm(join(root,"live-files"),{recursive:true}); await rm(databasePath);
    const copy = new Database(join(restored,"tuari.sqlite"));
    try {
      const reopened = new ExpenseAttachments(copy,createFifoLock(),new InventoryAttachmentStorage(join(restored,"attachments")));
      expect(reopened.list("one").map(f=>f.id).sort()).toEqual(files.map(f=>f.id).sort());
      expect(reopened.list("two")).toHaveLength(1);
      expect(Array.from((await reopened.download("one",files[1]!.id)).body)).toEqual([0,0]);
      expect(await readFile(join(restored,"attachments",purchase.relativePath),"utf8")).toBe("purchase");
      await rm(join(restored,"attachments",files[0]!.relativePath));
      await expect(reopened.download("one",files[0]!.id)).rejects.toThrow(/ENOENT/);
      await expect(restoreStandaloneSnapshot(restored,join(root,"incomplete"))).rejects.toThrow(/ENOENT/);
    } finally { copy.close(); }
  });
  it("restores old database-only snapshots only when no supported files are referenced", async () => {
    const root = await mkdtemp(join(tmpdir(),"legacy-expense-restore-"));
    const db = new Database(join(root,"tuari.sqlite"));
    db.exec("CREATE TABLE expense(id TEXT PRIMARY KEY); INSERT INTO expense VALUES ('old')");
    db.close();
    const destination = join(root,"new");
    expect(await restoreStandaloneSnapshot(root,destination)).toMatchObject({verified:0});
    await expect(restoreStandaloneSnapshot(root,destination)).rejects.toThrow(/EEXIST/);
  });

  it("reopens multiple immutable files only through their owning expense", async () => {
    const f = await fixture();
    try {
      expect(f.service.list("one")).toEqual([]);
      const saved = await f.service.add("one", [file(), file()]);
      expect(f.service.list("one")).toHaveLength(2);
      expect(f.service.list("two")).toEqual([]);
      await expect(f.service.download("two", saved[0]!.id)).rejects.toThrow(/not found/i);
      expect(Array.from((await f.service.download("one", saved[0]!.id)).body)).toEqual([0]);
      expect(f.db.prepare("SELECT * FROM expense ORDER BY id").all()).toEqual([{ id: "one", status: "LIVE" }, { id: "two", status: "LIVE" }]);
    } finally { f.db.close(); }
  });
  it("enforces cumulative count before reading rejected bytes", async () => {
    const f = await fixture();
    try {
      await f.service.add("one", Array.from({length: 9}, () => file()));
      const rejected = file();
      await expect(f.service.add("one", [rejected, file()])).rejects.toThrow(/limit/i);
      expect(rejected.bytes).not.toHaveBeenCalled();
      expect(f.service.list("one")).toHaveLength(9);
    } finally { f.db.close(); }
  });
  it("enforces cumulative bytes and rejects invalid types and oversized files", async () => {
    const f = await fixture();
    try {
      await f.service.add("one", [file(5*1024*1024),file(5*1024*1024),file(5*1024*1024)]);
      await expect(f.service.add("one", [file()])).rejects.toThrow(/limit/i);
      await expect(f.service.add("two", [file(1,"text/html")])).rejects.toThrow(/type/i);
      await expect(f.service.add("two", [file(5*1024*1024+1)])).rejects.toThrow(/limit/i);
      expect(f.service.list("two")).toEqual([]);
    } finally { f.db.close(); }
  });
  it("rechecks limits after asynchronous storage and rolls back failed batches", async () => {
    const f = await fixture();
    try {
      const results = await Promise.allSettled([f.service.add("one", Array.from({length:6},()=>file())),f.service.add("one",Array.from({length:6},()=>file()))]);
      expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
      expect(f.service.list("one")).toHaveLength(6);
      const broken = file(); broken.bytes.mockRejectedValueOnce(new Error("disk failure"));
      await expect(f.service.add("two", [file(),broken])).rejects.toThrow("disk failure");
      expect(f.service.list("two")).toEqual([]);
    } finally { f.db.close(); }
  });
});
