import Database from "better-sqlite3";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { InventoryAttachmentStorage } from "../inventory/inventory.storage";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerOptions } from "node:worker_threads";
import { createBackupService } from "./backup.service";

const faults = vi.hoisted(() => ({ linkFailure: false }));
vi.mock("node:worker_threads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:worker_threads")>();
  return {
    ...actual,
    Worker: class extends actual.Worker {
      constructor(filename: string | URL, options?: WorkerOptions) {
        const prelude = 'require("node:fs").linkSync = () => { const e = new Error("cross-device"); e.code = "EXDEV"; throw e; };\n';
        super(faults.linkFailure && options?.eval ? prelude + String(filename) : filename, options);
      }
    },
  };
});

import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createWorkerSnapshotter } from "./backup.snapshot";

// Exercise both plain SQLite and the shipped encrypted prebuild in real workers.
describe("createWorkerSnapshotter", () => {
  let tempRoot: string;
  let databasePath: string;

  const seedDatabase = (rows: number) => {
    const db = new Database(databasePath);
    db.pragma("journal_mode = WAL");
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT NOT NULL)");
    const insert = db.prepare("INSERT INTO items (label) VALUES (?)");
    db.transaction((count: number) => {
      for (let index = 0; index < count; index += 1) insert.run(`row-${index}`);
    })(rows);
    db.close();
  };

  beforeEach(() => {
    faults.linkFailure = false;
    tempRoot = mkdtempSync(join(tmpdir(), "tuari-snapshot-"));
    databasePath = join(tempRoot, "data", "tuari.sqlite");
    mkdirSync(join(tempRoot, "data"), { recursive: true });
  });

  afterEach(() => {
    // maxRetries covers a worker that is still releasing its output file after
    // a timeout-terminate on Windows.
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("copies the live database into an integrity-checked snapshot", async () => {
    seedDatabase(50);
    const outputPath = join(tempRoot, "out.sqlite");

    const result = await createWorkerSnapshotter({ databasePath })(outputPath);

    expect(result).toEqual({ schemaVersion: 0, encrypted: false });
    const copy = new Database(outputPath, { readonly: true });
    expect(copy.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
    expect(copy.prepare("SELECT COUNT(*) AS count FROM items").get()).toEqual({
      count: 50,
    });
    copy.close();
  });

  it("links immutable attachments, preserves old uploads, and copies a standalone snapshot", async () => {
    seedDatabase(1);
    const db = new Database(databasePath);
    db.exec("CREATE TABLE inventory_invoice_attachment (relative_path TEXT, sha256 TEXT)");
    const attachmentsRootPath = join(tempRoot, "attachments");
    const storage = new InventoryAttachmentStorage(attachmentsRootPath);
    const args = { attachmentId: "same", invoiceGroupId: "group", originalName: "invoice.txt" };
    const first = await storage.saveInvoiceAttachment({ ...args, bytes: Buffer.from("first") });
    db.prepare("INSERT INTO inventory_invoice_attachment VALUES (?, ?)").run(first.relativePath, first.sha256);
    const take = createWorkerSnapshotter({ databasePath, attachmentsRootPath });
    const day1 = join(tempRoot, "day1");
    mkdirSync(day1);
    const result1 = await take(join(day1, "tuari.sqlite"));
    expect(result1.attachments).toMatchObject({ linked: 1, copied: 0 });
    const second = await storage.saveInvoiceAttachment({ ...args, bytes: Buffer.from("second") });
    db.prepare("UPDATE inventory_invoice_attachment SET relative_path = ?, sha256 = ?").run(second.relativePath, second.sha256);
    const day2 = join(tempRoot, "day2");
    mkdirSync(day2);
    expect((await take(join(day2, "tuari.sqlite"))).attachments).toMatchObject({ linked: 1, copied: 0 });
    db.close();
    await storage.deleteRelativePath(second.relativePath);
    const day3 = join(tempRoot, "day3");
    mkdirSync(day3);
    expect((await take(join(day3, "tuari.sqlite"))).attachments).toMatchObject({ linked: 1, copied: 0 });
    expect(readFileSync(join(day1, "attachments", first.relativePath), "utf8")).toBe("first");
    expect(readFileSync(join(day2, "attachments", second.relativePath), "utf8")).toBe("second");
    const detached = join(tempRoot, "detached");
    cpSync(day1, detached, { recursive: true });
    rmSync(day1, { recursive: true });
    expect(readFileSync(join(detached, "attachments", first.relativePath), "utf8")).toBe("first");
    expect(statSync(join(day2, "attachments", second.relativePath)).nlink).toBeGreaterThan(1);
    unlinkSync(join(attachmentsRootPath, "attachments-store", second.sha256, "object"));
    expect(readFileSync(join(day2, "attachments", second.relativePath), "utf8")).toBe("second");
  });

  it.each(["missing", "mismatched", "escaped"])("rejects %s database attachment references", async (scenario) => {
    seedDatabase(1);
    const db = new Database(databasePath);
    db.exec("CREATE TABLE inventory_invoice_attachment (relative_path TEXT, sha256 TEXT)");
    const attachmentsRootPath = join(tempRoot, "attachments");
    mkdirSync(attachmentsRootPath);
    writeFileSync(join(attachmentsRootPath, "legacy"), "wrong bytes");
    db.prepare("INSERT INTO inventory_invoice_attachment VALUES (?, ?)").run(
      scenario === "escaped" ? "../escape" : scenario === "missing" ? "missing" : "legacy",
      "a".repeat(64),
    );
    db.close();
    await expect(createWorkerSnapshotter({ databasePath, attachmentsRootPath })(join(tempRoot, "out.sqlite")))
      .rejects.toThrow(scenario === "missing" ? /ENOENT/ : scenario === "escaped" ? /escaped/ : /hash mismatch/);
  });

  it("imports a legacy attachment without a stored digest and preserves its restore path", async () => {
    seedDatabase(1);
    const db = new Database(databasePath);
    db.exec("CREATE TABLE inventory_invoice_attachment (relative_path TEXT, sha256 TEXT)");
    db.prepare("INSERT INTO inventory_invoice_attachment VALUES (?, NULL)").run("group/legacy.txt");
    db.close();
    const attachmentsRootPath = join(tempRoot, "live");
    mkdirSync(join(attachmentsRootPath, "group"), { recursive: true });
    writeFileSync(join(attachmentsRootPath, "group/legacy.txt"), "legacy bytes");
    const result = await createWorkerSnapshotter({ databasePath, attachmentsRootPath })(join(tempRoot, "out.sqlite"));
    expect(result.attachments).toMatchObject({ linked: 1, copied: 0 });
    expect(readFileSync(join(tempRoot, "attachments/group/legacy.txt"), "utf8")).toBe("legacy bytes");
  });

  it("deduplicates repeated references to the same legacy path", async () => {
    seedDatabase(1);
    const db = new Database(databasePath);
    db.exec("CREATE TABLE inventory_invoice_attachment (relative_path TEXT, sha256 TEXT)");
    db.exec("INSERT INTO inventory_invoice_attachment VALUES ('legacy', NULL), ('legacy', NULL)");
    db.close();
    const attachmentsRootPath = join(tempRoot, "live");
    mkdirSync(attachmentsRootPath);
    writeFileSync(join(attachmentsRootPath, "legacy"), "one file");
    const result = await createWorkerSnapshotter({ databasePath, attachmentsRootPath })(join(tempRoot, "out.sqlite"));
    expect(result.attachments).toMatchObject({ linked: 1, copied: 0 });
    expect(readFileSync(join(tempRoot, "attachments/legacy"), "utf8")).toBe("one file");
  });

  it("reports real copy fallback in the service marker and log", async () => {
    seedDatabase(1);
    const attachmentsRootPath = join(tempRoot, "live");
    const storage = new InventoryAttachmentStorage(attachmentsRootPath);
    const saved = await storage.saveInvoiceAttachment({
      invoiceGroupId: "group", originalName: "invoice.txt", bytes: Buffer.from("fallback bytes"),
    });
    const db = new Database(databasePath);
    db.exec("CREATE TABLE inventory_invoice_attachment (relative_path TEXT, sha256 TEXT)");
    db.prepare("INSERT INTO inventory_invoice_attachment VALUES (?, ?)").run(saved.relativePath, saved.sha256);
    db.close();
    faults.linkFailure = true;
    const messages: string[] = [];
    const service = createBackupService({
      snapshot: createWorkerSnapshotter({ databasePath, attachmentsRootPath }),
      backupsRootPath: join(tempRoot, "backups"),
      now: () => new Date("2026-01-15T08:00:00Z"),
      logger: { info: (message) => messages.push(message), error: vi.fn() },
    });
    const result = await service.runDueBackup();
    expect(result.status).toBe("created");
    if (result.status !== "created") throw new Error("backup did not complete");
    const marker = JSON.parse(readFileSync(join(result.path, "snapshot.json"), "utf8"));
    expect(marker.attachments).toEqual({ linked: 0, copied: 1, fallbackReasons: [saved.relativePath + ": EXDEV"] });
    expect(messages.some((message) => message.includes('"copied":1') && message.includes("EXDEV"))).toBe(true);
    const file = join(result.path, "attachments", saved.relativePath);
    expect(readFileSync(file, "utf8")).toBe("fallback bytes");
    expect(statSync(file).nlink).toBe(1);
    rmSync(attachmentsRootPath, { recursive: true });
    expect(readFileSync(file, "utf8")).toBe("fallback bytes");
  });

  it("runs the copy off the event loop instead of blocking it", async () => {
    seedDatabase(50);
    const outputPath = join(tempRoot, "out.sqlite");
    let immediateRan = false;
    // Queued BEFORE the copy starts. A synchronous copy inside `snapshot()`
    // would run to completion before the event loop reaches the check phase,
    // so the `await` continuation (a microtask) would resume first and this
    // flag would still be false. The worker path lets it run while the copy is
    // in flight.
    setImmediate(() => {
      immediateRan = true;
    });

    await createWorkerSnapshotter({ databasePath })(outputPath);

    expect(immediateRan).toBe(true);
    expect(statSync(outputPath).size).toBeGreaterThan(0);
  });

  it("handles an output path containing a single quote", async () => {
    // The VACUUM INTO statement embeds the path in single quotes; the quote in
    // the directory name must be escaped, not break the SQL.
    seedDatabase(3);
    const quotedDirectory = join(tempRoot, "it's here");
    mkdirSync(quotedDirectory, { recursive: true });
    const outputPath = join(quotedDirectory, "out.sqlite");

    const result = await createWorkerSnapshotter({ databasePath })(outputPath);

    expect(result).toEqual({ schemaVersion: 0, encrypted: false });
    const copy = new Database(outputPath, { readonly: true });
    expect(copy.prepare("SELECT COUNT(*) AS count FROM items").get()).toEqual({
      count: 3,
    });
    copy.close();
  });

  it("rejects when the source database cannot be opened", async () => {
    const snapshot = createWorkerSnapshotter({
      databasePath: join(tempRoot, "missing", "nope.sqlite"),
    });

    await expect(snapshot(join(tempRoot, "out.sqlite"))).rejects.toThrow(
      /cannot open database|unable to open|not a database|ENOENT/i,
    );
  });

  it("terminates the worker and rejects when the copy times out", async () => {
    seedDatabase(1);
    const outputPath = join(tempRoot, "out.sqlite");
    // 0 fires on the next timer turn, before a freshly spawned worker can post.
    const snapshot = createWorkerSnapshotter({ databasePath, timeoutMs: 0 });

    await expect(snapshot(outputPath)).rejects.toThrow(/timed out after 0ms/);
  });

  it("copies a keyed WAL database and rejects wrong or missing keys", async () => {
    const databaseKey = "it's a secret";
    const source = createDatabaseConnection(databasePath, databaseKey);
    try {
      source.exec("CREATE TABLE items (label TEXT NOT NULL)");
      source.prepare("INSERT INTO items VALUES (?)").run("encrypted row");
      source.pragma("user_version = 42");
      // Leave the source open: committed rows may still be in its WAL.
      const outputPath = join(tempRoot, "encrypted.sqlite");
      await expect(createWorkerSnapshotter({ databasePath, databaseKey })(outputPath))
        .resolves.toEqual({ schemaVersion: 42, encrypted: true });
      const copy = createDatabaseConnection(outputPath, databaseKey);
      try {
        expect(copy.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
        expect(copy.prepare("SELECT label FROM items").get()).toEqual({ label: "encrypted row" });
      } finally {
        copy.close();
      }
      expect(() => createDatabaseConnection(outputPath, "wrong")).toThrow(/not a database/i);
      const encryptedBytesBeforeMissingKeyOpen = readFileSync(outputPath);
      expect(() => createDatabaseConnection(outputPath, null)).toThrow(/not a database/i);
      expect(readFileSync(outputPath).equals(encryptedBytesBeforeMissingKeyOpen)).toBe(true);
      await expect(createWorkerSnapshotter({ databasePath, databaseKey: "wrong" })(
        join(tempRoot, "wrong.sqlite"),
      )).rejects.toThrow(/not a database/i);
      await expect(createWorkerSnapshotter({ databasePath })(
        join(tempRoot, "no-key.sqlite"),
      )).rejects.toThrow(/not a database/i);
    } finally {
      source.close();
    }
  });

  it("rejects a keyed open of a plaintext source", async () => {
    seedDatabase(1);
    const snapshot = createWorkerSnapshotter({
      databasePath,
      databaseKey: "secret",
    });

    await expect(snapshot(join(tempRoot, "out.sqlite"))).rejects.toThrow(
      /not a database/i,
    );
  });
});
