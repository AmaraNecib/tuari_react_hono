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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabaseConnection } from "../../infrastructure/database/factory";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import { createBackupService } from "./backup.service";
import type { BackupDatabase } from "./backup.types";

/**
 * Scope: PLAIN SQLite only.
 *
 * `createDatabaseConnection` is called without a key, so every snapshot here is
 * an unencrypted database and the `VACUUM INTO` output is verified with a plain
 * better-sqlite3 reader. The encrypted (SQLCipher) path is NOT exercised: the
 * native binding is not built in this workspace (see docs/backups.md, #410), so
 * this file must not be read as proof that the encrypted copy is verifiable.
 * The skipped test at the bottom records what an encrypted-path test needs.
 */

// Force a specific fs call to fail on demand (a genuinely unreadable root is
// unreliable cross-platform, especially on Windows). Every other call delegates
// to the real implementation.
const fsControl = vi.hoisted(() => ({
  failReaddir: false,
  failRemove: false,
  readdirError: new Error("EACCES: permission denied") as unknown,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readdirSync: ((...args: unknown[]) => {
      if (fsControl.failReaddir) throw fsControl.readdirError;
      return (actual.readdirSync as (...inner: unknown[]) => unknown)(...args);
    }) as typeof actual.readdirSync,
    rmSync: ((...args: unknown[]) => {
      if (fsControl.failRemove) throw new Error("EPERM: operation not permitted");
      return (actual.rmSync as (...inner: unknown[]) => unknown)(...args);
    }) as typeof actual.rmSync,
  };
});

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
    fsControl.failReaddir = false;
    fsControl.failRemove = false;
    fsControl.readdirError = new Error("EACCES: permission denied");
    tempRoot = mkdtempSync(join(tmpdir(), "tuari-backup-"));
    backupsRoot = join(tempRoot, "backups");
  });

  afterEach(() => {
    fsControl.failReaddir = false;
    fsControl.failRemove = false;
    fsControl.readdirError = new Error("EACCES: permission denied");
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
    // A real snapshot for yesterday, not just an empty folder.
    mkdirSync(join(backupsRoot, DATE), { recursive: true });
    writeFileSync(join(backupsRoot, DATE, "tuari.sqlite"), "snapshot");
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
      const folder = join(backupsRoot, `2026-01-${String(day).padStart(2, "0")}`);
      mkdirSync(folder, { recursive: true });
      // Each dated folder must be a COMPLETE snapshot to count as a backup.
      writeFileSync(join(folder, "tuari.sqlite"), `snapshot-${day}`);
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

  it("does not count a correctly named folder that has no snapshot", async () => {
    const { db } = createLiveDatabase();
    // A hand-made (or never-completed) folder for yesterday must not suppress
    // the due run, which then reuses the folder name.
    mkdirSync(join(backupsRoot, DATE), { recursive: true });
    const service = createBackupService({
      db,
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus().lastBackupPath).toBeNull();
    expect(await service.runDueBackup()).toEqual({
      status: "created",
      date: DATE,
      path: join(backupsRoot, DATE),
    });

    const { integrity } = readBackup(join(backupsRoot, DATE, "tuari.sqlite"));
    expect(integrity[0]?.integrity_check).toBe("ok");
  });

  it("does not count a dated folder whose database file is empty", () => {
    const folder = join(backupsRoot, DATE);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "tuari.sqlite"), "");
    const service = createBackupService({
      db: { exec: () => undefined },
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus()).toEqual({
      lastBackupPath: null,
      lastSuccessAt: null,
      lastFailure: null,
    });
  });

  it("degrades to a recorded failure when the backups root cannot be listed", () => {
    mkdirSync(backupsRoot, { recursive: true });
    fsControl.failReaddir = true;
    const service = createBackupService({
      db: { exec: () => undefined },
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });
    fsControl.failReaddir = false;

    // Construction must not throw; the unreadable root becomes a recorded
    // failure on the status instead of a failed boot.
    expect(service.getStatus()).toEqual({
      lastBackupPath: null,
      lastSuccessAt: null,
      lastFailure: {
        at: now().toISOString(),
        reason: "EACCES: permission denied",
      },
    });
  });

  it("degrades to a string failure when the root read throws a non-Error", () => {
    mkdirSync(backupsRoot, { recursive: true });
    fsControl.failReaddir = true;
    fsControl.readdirError = "permission boom";
    const service = createBackupService({
      db: { exec: () => undefined },
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });
    fsControl.failReaddir = false;

    expect(service.getStatus().lastFailure).toEqual({
      at: now().toISOString(),
      reason: "permission boom",
    });
  });

  it("records a failure instead of hiding it when preflight cleanup throws", async () => {
    const { db } = createLiveDatabase();
    const stale = join(backupsRoot, ".staging-abandoned");
    mkdirSync(stale, { recursive: true });
    const service = createBackupService({
      db,
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    fsControl.failRemove = true;
    const result = await service.runDueBackup();
    fsControl.failRemove = false;

    // Preflight lives inside the guarded region, so the throw is recorded —
    // the status must not read healthy while no backup was taken.
    expect(result.status).toBe("failed");
    expect(service.getStatus().lastFailure).toEqual({
      at: now().toISOString(),
      reason: "EPERM: operation not permitted",
    });
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

  // Encrypted-path coverage. `it.skip` (not a passing test): the plain SQLite
  // suite above cannot catch a regression in the SQLCipher copy path. Unskip
  // once the native binding is built (#410) and the steps below are real.
  it.skip("keeps an encrypted snapshot openable with the key in force when it was taken (#410)", () => {
    // 1. open the live DB with `databaseKey` (createDatabaseConnection(path, key));
    // 2. run `runDueBackup()`;
    // 3. assert the copy opens with the SAME key and `PRAGMA integrity_check` is ok;
    // 4. assert it does NOT open with a wrong/absent key (proves real encryption);
    // 5. pin the rotation constraint: a snapshot taken before a key rotation is
    //    openable only with the pre-rotation key (see docs/backups.md).
  });
});
