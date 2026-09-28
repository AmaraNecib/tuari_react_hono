import Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection } from "../../infrastructure/database/factory";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import { createBackupService } from "./backup.service";
import type { BackupDatabase } from "./backup.types";

const now = () => new Date(2026, 0, 15, 8, 0, 0);
const DATE = "2026-01-14";
const noopLogger = { info: () => {}, error: () => {} };

describe("createBackupService", () => {
  let tempRoot: string;
  let backupsRoot: string;
  const openDatabases: Array<{ close: () => void }> = [];

  const track = <T extends { close: () => void }>(database: T): T => {
    openDatabases.push(database);
    return database;
  };

  const createLiveDatabase = (): {
    databasePath: string;
    db: BetterSqliteDatabase;
  } => {
    const databasePath = join(tempRoot, "data", "tuari.sqlite");
    const db = track(createDatabaseConnection(databasePath));
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT NOT NULL)");
    db.exec("INSERT INTO items (label) VALUES ('committed')");
    return { databasePath, db };
  };

  const readBackup = (databasePath: string) => {
    const copy = track(new Database(databasePath, { readonly: true }));
    const integrity = copy.pragma("integrity_check") as Array<{
      integrity_check: string;
    }>;
    return { copy, integrity };
  };

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "tuari-backup-"));
    backupsRoot = join(tempRoot, "backups");
  });

  afterEach(() => {
    for (const database of openDatabases.splice(0)) database.close();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("takes a due backup into a dated folder with a readable snapshot", async () => {
    const { db } = createLiveDatabase();
    const service = createBackupService({
      db,
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    const result = await service.runDueBackup();

    const backupDirectory = join(backupsRoot, DATE);
    expect(result).toEqual({
      status: "created",
      date: DATE,
      path: backupDirectory,
    });

    const copyPath = join(backupDirectory, "tuari.sqlite");
    const { copy, integrity } = readBackup(copyPath);
    expect(integrity[0]?.integrity_check).toBe("ok");
    expect(copy.prepare("SELECT label FROM items").all()).toEqual([
      { label: "committed" },
    ]);

    expect(service.getStatus()).toEqual({
      lastBackupPath: backupDirectory,
      lastSuccessAt: now().toISOString(),
      lastFailure: null,
    });
  });

  it("takes none when the newest backup is yesterday", async () => {
    const { db } = createLiveDatabase();
    mkdirSync(join(backupsRoot, DATE), { recursive: true });
    const service = createBackupService({
      db,
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(await service.runDueBackup()).toEqual({ status: "not-due" });
    expect(readdirSync(backupsRoot)).toEqual([DATE]);
  });

  it("snapshots consistently while another connection holds a write", async () => {
    const { databasePath, db } = createLiveDatabase();
    const writer = track(new Database(databasePath));
    writer.exec("BEGIN IMMEDIATE");
    writer.exec("INSERT INTO items (label) VALUES ('uncommitted')");

    const service = createBackupService({
      db,
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect((await service.runDueBackup()).status).toBe("created");

    const { copy, integrity } = readBackup(join(backupsRoot, DATE, "tuari.sqlite"));
    expect(integrity[0]?.integrity_check).toBe("ok");
    // The uncommitted row is not in the snapshot; the committed one is.
    expect(copy.prepare("SELECT label FROM items ORDER BY id").all()).toEqual([
      { label: "committed" },
    ]);

    writer.exec("ROLLBACK");
  });

  it("prunes exactly the policy's set and never the newest", async () => {
    const { db } = createLiveDatabase();
    for (let day = 1; day <= 10; day += 1) {
      mkdirSync(
        join(backupsRoot, `2026-01-${String(day).padStart(2, "0")}`),
        { recursive: true },
      );
    }
    const service = createBackupService({
      db,
      backupsRootPath: backupsRoot,
      now,
      policy: { daily: 2, weekly: 1, monthly: 1 },
      logger: noopLogger,
    });

    expect((await service.runDueBackup()).status).toBe("created");

    expect(readdirSync(backupsRoot).sort()).toEqual([
      "2026-01-08",
      "2026-01-09",
      "2026-01-10",
      DATE,
    ]);
    expect(existsSync(join(backupsRoot, DATE, "tuari.sqlite"))).toBe(true);
  });

  it("keeps previous backups and reports the reason when the copy fails", async () => {
    const previous = join(backupsRoot, "2026-01-13");
    mkdirSync(previous, { recursive: true });
    writeFileSync(join(previous, "tuari.sqlite"), "previous-backup");

    const failing: BackupDatabase = {
      exec: () => {
        throw new Error("disk full");
      },
    };
    const service = createBackupService({
      db: failing,
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(await service.runDueBackup()).toEqual({
      status: "failed",
      date: DATE,
      reason: "disk full",
    });
    // The failed run leaves the previous backup byte-for-byte intact and leaves
    // no staging directory behind.
    expect(readFileSync(join(previous, "tuari.sqlite"), "utf8")).toBe(
      "previous-backup",
    );
    expect(readdirSync(backupsRoot)).toEqual(["2026-01-13"]);
    expect(service.getStatus()).toEqual({
      lastBackupPath: previous,
      lastSuccessAt: expect.any(String),
      lastFailure: { at: now().toISOString(), reason: "disk full" },
    });
  });

  it("reports a string failure for a non-Error throw", async () => {
    const failing: BackupDatabase = {
      exec: () => {
        throw "boom";
      },
    };
    const service = createBackupService({
      db: failing,
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(await service.runDueBackup()).toEqual({
      status: "failed",
      date: DATE,
      reason: "boom",
    });
  });

  it("reports a failure when the backups root cannot be created", async () => {
    const blocker = join(tempRoot, "blocker");
    writeFileSync(blocker, "not a directory");
    const service = createBackupService({
      db: { exec: () => undefined },
      backupsRootPath: join(blocker, "backups"),
      now,
      logger: noopLogger,
    });

    const result = await service.runDueBackup();
    expect(result.status).toBe("failed");
    expect(service.getStatus().lastFailure?.reason).toEqual(expect.any(String));
  });

  it("reports a failure without throwing when the backups root is a file", async () => {
    const fileRoot = join(tempRoot, "backups-file");
    writeFileSync(fileRoot, "not a directory");
    const service = createBackupService({
      db: { exec: () => undefined },
      backupsRootPath: fileRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus().lastBackupPath).toBeNull();
    expect((await service.runDueBackup()).status).toBe("failed");
  });

  it("removes a stale staging directory from a crashed run", async () => {
    const { db } = createLiveDatabase();
    const stale = join(backupsRoot, ".staging-abandoned");
    mkdirSync(stale, { recursive: true });
    const service = createBackupService({
      db,
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    await service.runDueBackup();

    expect(existsSync(stale)).toBe(false);
  });

  it("seeds the status from the newest backup on disk", () => {
    const previous = join(backupsRoot, "2026-01-13");
    mkdirSync(previous, { recursive: true });
    writeFileSync(join(previous, "tuari.sqlite"), "previous-backup");

    const service = createBackupService({
      db: { exec: () => undefined },
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus()).toEqual({
      lastBackupPath: previous,
      lastSuccessAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      lastFailure: null,
    });
  });

  it("starts with an empty status when there are no backups", () => {
    const service = createBackupService({
      db: { exec: () => undefined },
      backupsRootPath: join(tempRoot, "missing"),
      now,
      logger: noopLogger,
    });

    expect(service.getStatus()).toEqual({
      lastBackupPath: null,
      lastSuccessAt: null,
      lastFailure: null,
    });
  });

  it("defaults the clock and logger when they are not injected", async () => {
    const { db } = createLiveDatabase();
    const service = createBackupService({ db, backupsRootPath: backupsRoot });

    const result = await service.runDueBackup();

    expect(result.status).toBe("created");
    expect(readdirSync(backupsRoot)).toHaveLength(1);
  });

  it("defaults the failure logger when it is not injected", async () => {
    const failing: BackupDatabase = {
      exec: () => {
        throw new Error("nope");
      },
    };
    const service = createBackupService({
      db: failing,
      backupsRootPath: backupsRoot,
    });

    expect((await service.runDueBackup()).status).toBe("failed");
  });
});
