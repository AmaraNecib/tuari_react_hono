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
import { createWorkerSnapshotter } from "./backup.snapshot";
import {
  BACKUP_DB_FILE_NAME,
  BACKUP_MARKER_FILE_NAME,
  createBackupService,
  listBackupDates,
  pruneBackups,
} from "./backup.service";
import type { BackupSnapshotter } from "./backup.types";

/**
 * Scope: PLAIN SQLite only.
 *
 * `createDatabaseConnection` is called without a key, so every snapshot here is
 * an unencrypted database and is verified with a plain better-sqlite3 reader.
 * The encrypted (SQLCipher) path is NOT exercised: the native binding is not
 * built in this workspace (see docs/backups.md, #410), so this file must not be
 * read as proof that the encrypted copy is verifiable. The skipped test at the
 * bottom records what an encrypted-path test needs.
 */

// Force a specific fs call to fail on demand (a genuinely unreadable root is
// unreliable cross-platform, especially on Windows). Every other call delegates
// to the real implementation.
const fsControl = vi.hoisted(() => ({
  failReaddir: false,
  failReaddirMatching: null as string | null,
  failRemove: false,
  failRemoveMatching: null as string | null,
  failOpenMatching: null as string | null,
  failRename: false,
  removeError: new Error("EBUSY: resource busy or locked") as unknown,
  readdirError: new Error("EACCES: permission denied") as unknown,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readdirSync: ((...args: unknown[]) => {
      if (fsControl.failReaddir) throw fsControl.readdirError;
      if (
        fsControl.failReaddirMatching !== null &&
        String(args[0]).includes(fsControl.failReaddirMatching)
      ) {
        throw fsControl.readdirError;
      }
      return (actual.readdirSync as (...inner: unknown[]) => unknown)(...args);
    }) as typeof actual.readdirSync,
    openSync: ((...args: unknown[]) => {
      if (
        fsControl.failOpenMatching !== null &&
        String(args[0]).includes(fsControl.failOpenMatching)
      ) {
        throw new Error("EPERM: operation not permitted");
      }
      return (actual.openSync as (...inner: unknown[]) => unknown)(...args);
    }) as typeof actual.openSync,
    rmSync: ((...args: unknown[]) => {
      if (fsControl.failRemove) throw new Error("EPERM: operation not permitted");
      if (
        fsControl.failRemoveMatching !== null &&
        String(args[0]).includes(fsControl.failRemoveMatching)
      ) {
        throw fsControl.removeError;
      }
      return (actual.rmSync as (...inner: unknown[]) => unknown)(...args);
    }) as typeof actual.rmSync,
    renameSync: ((...args: unknown[]) => {
      if (fsControl.failRename) throw new Error("EPERM: operation not permitted");
      return (actual.renameSync as (...inner: unknown[]) => unknown)(...args);
    }) as typeof actual.renameSync,
  };
});

const now = () => new Date(2026, 0, 15, 8, 0, 0);
const DATE = "2026-01-14";
const noopLogger = { info: () => {}, error: () => {} };

const markerJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: "tuari",
    format: 1,
    schemaVersion: 0,
    databaseFile: BACKUP_DB_FILE_NAME,
    encrypted: false,
    takenAt: "2026-01-13T08:00:00.000Z",
    ...overrides,
  });

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

  /** A REAL snapshot folder (usable database + marker), as a previous run left it. */
  const createSnapshotFixture = (
    date: string,
    label = `snapshot-${date}`,
  ): string => {
    const folder = join(backupsRoot, date);
    mkdirSync(folder, { recursive: true });
    const db = new Database(join(folder, BACKUP_DB_FILE_NAME));
    db.exec("CREATE TABLE fixture (id INTEGER PRIMARY KEY, label TEXT)");
    db.prepare("INSERT INTO fixture (label) VALUES (?)").run(label);
    db.close();
    writeFileSync(join(folder, BACKUP_MARKER_FILE_NAME), markerJson());
    return folder;
  };

  const readBackup = (databasePath: string) => {
    const copy = track(new Database(databasePath, { readonly: true }));
    const integrity = copy.pragma("integrity_check") as Array<{
      integrity_check: string;
    }>;
    return { copy, integrity };
  };

  const realSnapshotter = (databasePath: string): BackupSnapshotter =>
    createWorkerSnapshotter({ databasePath });

  /**
   * A snapshot stand-in that still writes a REAL, usable database file, so a
   * "created" run produces a folder that passes the same validity checks the
   * real copy does (used by tests that only exercise the service logic).
   */
  const stubSnapshotter = (): BackupSnapshotter => async (outputPath) => {
    const db = new Database(outputPath);
    db.exec("CREATE TABLE stub (id INTEGER PRIMARY KEY)");
    db.close();
    return { schemaVersion: 0, encrypted: false };
  };

  beforeEach(() => {
    fsControl.failReaddir = false;
    fsControl.failReaddirMatching = null;
    fsControl.failRemove = false;
    fsControl.failRemoveMatching = null;
    fsControl.failOpenMatching = null;
    fsControl.failRename = false;
    fsControl.removeError = new Error("EBUSY: resource busy or locked");
    fsControl.readdirError = new Error("EACCES: permission denied");
    tempRoot = mkdtempSync(join(tmpdir(), "tuari-backup-"));
    backupsRoot = join(tempRoot, "backups");
  });

  afterEach(() => {
    fsControl.failReaddir = false;
    fsControl.failReaddirMatching = null;
    fsControl.failRemove = false;
    fsControl.failRemoveMatching = null;
    fsControl.failOpenMatching = null;
    fsControl.failRename = false;
    fsControl.removeError = new Error("EBUSY: resource busy or locked");
    fsControl.readdirError = new Error("EACCES: permission denied");
    for (const database of openDatabases.splice(0)) database.close();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("takes a due backup into a dated folder with a readable, marked snapshot", async () => {
    const { databasePath } = createLiveDatabase();
    const service = createBackupService({
      snapshot: realSnapshotter(databasePath),
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

    const marker = JSON.parse(
      readFileSync(join(backupDirectory, BACKUP_MARKER_FILE_NAME), "utf8"),
    ) as Record<string, unknown>;
    expect(marker).toMatchObject({
      app: "tuari",
      format: 1,
      databaseFile: BACKUP_DB_FILE_NAME,
      encrypted: false,
    });

    const copyPath = join(backupDirectory, BACKUP_DB_FILE_NAME);
    const { copy, integrity } = readBackup(copyPath);
    expect(integrity[0]?.integrity_check).toBe("ok");
    expect(copy.prepare("SELECT label FROM items").all()).toEqual([
      { label: "committed" },
    ]);

    expect(service.getStatus()).toEqual({
      lastBackupPath: backupDirectory,
      lastSuccessAt: now().toISOString(),
      lastFailure: null,
      backupsRootPath: backupsRoot,
      retention: { daily: 14, weekly: 8, monthly: 6 },
    });
  });

  it("takes none when the newest backup is yesterday", async () => {
    createSnapshotFixture(DATE);
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(await service.runDueBackup()).toEqual({ status: "not-due" });
    expect(readdirSync(backupsRoot)).toEqual([DATE]);
  });

  it("snapshots consistently while another connection holds a write", async () => {
    const { databasePath } = createLiveDatabase();
    const writer = track(new Database(databasePath));
    writer.exec("BEGIN IMMEDIATE");
    writer.exec("INSERT INTO items (label) VALUES ('uncommitted')");

    const service = createBackupService({
      snapshot: realSnapshotter(databasePath),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect((await service.runDueBackup()).status).toBe("created");

    const { copy, integrity } = readBackup(
      join(backupsRoot, DATE, BACKUP_DB_FILE_NAME),
    );
    expect(integrity[0]?.integrity_check).toBe("ok");
    // The uncommitted row is not in the snapshot; the committed one is.
    expect(copy.prepare("SELECT label FROM items ORDER BY id").all()).toEqual([
      { label: "committed" },
    ]);

    writer.exec("ROLLBACK");
  });

  it("prunes exactly the policy's set and never the newest", async () => {
    for (let day = 1; day <= 10; day += 1) {
      createSnapshotFixture(`2026-01-${String(day).padStart(2, "0")}`);
    }
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      policy: { daily: 2, weekly: 1, monthly: 1 },
      logger: noopLogger,
    });

    expect((await service.runDueBackup()).status).toBe("created");

    // daily: 09,10; weekly (newest ISO week in the older set): 08; monthly
    // (newest month after that): 07. A weekly rep already inside the daily
    // window does not consume a slot, which is why the older set starts at 08.
    expect(readdirSync(backupsRoot).sort()).toEqual([
      "2026-01-08",
      "2026-01-09",
      "2026-01-10",
      DATE,
    ]);
    expect(
      existsSync(join(backupsRoot, DATE, BACKUP_DB_FILE_NAME)),
    ).toBe(true);
    expect(
      existsSync(join(backupsRoot, DATE, BACKUP_MARKER_FILE_NAME)),
    ).toBe(true);
  });

  it("keeps previous backups and reports the reason when the copy fails", async () => {
    const previous = createSnapshotFixture("2026-01-13", "previous-backup");
    const previousBytes = readFileSync(join(previous, BACKUP_DB_FILE_NAME));

    const service = createBackupService({
      snapshot: async () => {
        throw new Error("disk full");
      },
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
    expect(
      readFileSync(join(previous, BACKUP_DB_FILE_NAME)).equals(previousBytes),
    ).toBe(true);
    expect(readdirSync(backupsRoot)).toEqual(["2026-01-13"]);
    expect(service.getStatus()).toEqual({
      lastBackupPath: previous,
      lastSuccessAt: expect.any(String),
      lastFailure: { at: now().toISOString(), reason: "disk full" },
      backupsRootPath: backupsRoot,
      retention: { daily: 14, weekly: 8, monthly: 6 },
    });
  });

  it("reports a string failure for a non-Error throw", async () => {
    const service = createBackupService({
      snapshot: async () => {
        throw "boom";
      },
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

  it("reports a non-empty reason for a thrown empty string", async () => {
    const service = createBackupService({
      snapshot: async () => {
        throw "";
      },
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    // `lastFailure.reason` is `.min(1)` on the wire: an empty reason would turn
    // the status read into a 500 instead of reporting the failure.
    expect(await service.runDueBackup()).toEqual({
      status: "failed",
      date: DATE,
      reason: "unknown backup failure",
    });
    expect(service.getStatus().lastFailure?.reason).toBe(
      "unknown backup failure",
    );
  });

  it("records a failure and cleans staging when the commit rename fails", async () => {
    const previous = createSnapshotFixture("2026-01-13");
    const { databasePath } = createLiveDatabase();
    const service = createBackupService({
      snapshot: realSnapshotter(databasePath),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    fsControl.failRename = true;
    const result = await service.runDueBackup();
    fsControl.failRename = false;

    expect(result).toEqual({
      status: "failed",
      date: DATE,
      reason: "EPERM: operation not permitted",
    });
    // The previous backup is intact, no dated folder was committed, and the
    // staging work area was removed.
    expect(existsSync(previous)).toBe(true);
    expect(existsSync(join(backupsRoot, DATE))).toBe(false);
    expect(readdirSync(backupsRoot)).toEqual(["2026-01-13"]);
  });

  it("keeps the snapshot failure when staging cleanup also fails", async () => {
    createLiveDatabase();
    const service = createBackupService({
      snapshot: async () => {
        throw new Error("disk full");
      },
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    fsControl.failRemoveMatching = ".staging-";
    const result = await service.runDueBackup();
    fsControl.failRemoveMatching = null;

    // The cleanup failure is secondary: the recorded failure must be the
    // backup failure, and `runDueBackup` must still resolve.
    expect(result).toEqual({
      status: "failed",
      date: DATE,
      reason: "disk full",
    });
    expect(service.getStatus().lastFailure).toEqual({
      at: now().toISOString(),
      reason: "disk full",
    });
  });

  it("reports a failure when the backups root cannot be created", async () => {
    const blocker = join(tempRoot, "blocker");
    writeFileSync(blocker, "not a directory");
    const service = createBackupService({
      snapshot: stubSnapshotter(),
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
      snapshot: stubSnapshotter(),
      backupsRootPath: fileRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus().lastBackupPath).toBeNull();
    expect((await service.runDueBackup()).status).toBe("failed");
  });

  it("does not treat a same-named folder it did not create as a backup", async () => {
    const foreign = join(backupsRoot, DATE);
    mkdirSync(foreign, { recursive: true });
    writeFileSync(join(foreign, "operator-notes.txt"), "do not delete me");

    const { databasePath } = createLiveDatabase();
    const service = createBackupService({
      snapshot: realSnapshotter(databasePath),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    // The unknown folder is NOT a snapshot: it must not seed the status...
    expect(service.getStatus().lastBackupPath).toBeNull();

    // ...and the run must refuse to overwrite it rather than delete it.
    const result = await service.runDueBackup();
    expect(result.status).toBe("failed");
    expect(result.status === "failed" ? result.reason : "").toMatch(
      /refusing to overwrite/,
    );

    expect(existsSync(join(foreign, "operator-notes.txt"))).toBe(true);
    expect(readdirSync(foreign)).toEqual(["operator-notes.txt"]);
  });

  it("replaces OUR OWN unusable snapshot at the target instead of wedging forever", async () => {
    // A previous run's folder at yesterday's name carries our marker but its
    // database is empty, so `isUsableSnapshot` rejects it. It is excluded from
    // the listing, which makes the run due; without a replace path every future
    // start would fail on "refusing to overwrite". Removing an unusable
    // snapshot of ours loses no usable backup.
    const corrupt = join(backupsRoot, DATE);
    mkdirSync(corrupt, { recursive: true });
    writeFileSync(join(corrupt, BACKUP_DB_FILE_NAME), "");
    writeFileSync(join(corrupt, BACKUP_MARKER_FILE_NAME), markerJson());

    const { databasePath } = createLiveDatabase();
    const service = createBackupService({
      snapshot: realSnapshotter(databasePath),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    const result = await service.runDueBackup();
    expect(result.status).toBe("created");
    const { integrity } = readBackup(join(corrupt, BACKUP_DB_FILE_NAME));
    expect(integrity[0]?.integrity_check).toBe("ok");
  });

  it("takes a fresh backup when the newest snapshot is future-dated", async () => {
    // A clock accidentally set years ahead left a "newest" folder in the
    // future. It must not suppress today's backup.
    const future = createSnapshotFixture("2099-01-01");
    const { databasePath } = createLiveDatabase();
    const service = createBackupService({
      snapshot: realSnapshotter(databasePath),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    // The future-dated snapshot is the newest actual snapshot on disk, so the
    // status is honest about it...
    expect(service.getStatus().lastBackupPath).toBe(future);
    // ...but it is not credible for the due check, so a real backup is taken.
    expect((await service.runDueBackup()).status).toBe("created");
    expect(
      existsSync(join(backupsRoot, DATE, BACKUP_DB_FILE_NAME)),
    ).toBe(true);
    // The bogus future folder is left alone (it carries our marker, so it is
    // harmless — just not credible as "the newest backup").
    expect(existsSync(join(future, BACKUP_DB_FILE_NAME))).toBe(true);
  });

  it("does not count a dated folder whose database file is empty", () => {
    const folder = join(backupsRoot, DATE);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, BACKUP_DB_FILE_NAME), "");
    writeFileSync(join(folder, BACKUP_MARKER_FILE_NAME), markerJson());
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus()).toEqual({
      lastBackupPath: null,
      lastSuccessAt: null,
      lastFailure: null,
      backupsRootPath: backupsRoot,
      retention: { daily: 14, weekly: 8, monthly: 6 },
    });
  });

  it("does not count a marked folder whose database is not a SQLite file", () => {
    const folder = join(backupsRoot, DATE);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, BACKUP_DB_FILE_NAME), "not a database at all");
    writeFileSync(join(folder, BACKUP_MARKER_FILE_NAME), markerJson());
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus().lastBackupPath).toBeNull();
  });

  it("does not count a marked folder whose database is truncated", () => {
    const folder = join(backupsRoot, DATE);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, BACKUP_DB_FILE_NAME), "abc");
    writeFileSync(join(folder, BACKUP_MARKER_FILE_NAME), markerJson());
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus().lastBackupPath).toBeNull();
  });

  it("does not count a non-empty database that has no marker", () => {
    const folder = join(backupsRoot, DATE);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, BACKUP_DB_FILE_NAME), "someone else's data");
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus().lastBackupPath).toBeNull();
  });

  it("does not count a folder whose marker is not valid JSON", () => {
    const folder = join(backupsRoot, DATE);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, BACKUP_DB_FILE_NAME), "snapshot");
    writeFileSync(join(folder, BACKUP_MARKER_FILE_NAME), "{");
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus().lastBackupPath).toBeNull();
  });

  it("does not count a marker whose takenAt is not a timestamp", () => {
    const folder = join(backupsRoot, DATE);
    mkdirSync(folder, { recursive: true });
    // Encrypted, so the plaintext header check does not mask the marker-schema
    // rejection being pinned here.
    writeFileSync(join(folder, BACKUP_DB_FILE_NAME), "ciphertext");
    writeFileSync(
      join(folder, BACKUP_MARKER_FILE_NAME),
      markerJson({ encrypted: true, takenAt: "not-a-date" }),
    );
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus().lastBackupPath).toBeNull();
  });

  it("treats an encrypted marker as valid without reading the file magic", () => {
    // A SQLCipher copy does not start with the plaintext SQLite magic, so the
    // marker (and the integrity check run when it was written) is the signal.
    const folder = join(backupsRoot, DATE);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, BACKUP_DB_FILE_NAME), "ciphertext");
    writeFileSync(
      join(folder, BACKUP_MARKER_FILE_NAME),
      markerJson({ encrypted: true }),
    );
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus().lastBackupPath).toBe(folder);
  });

  it("does not count a directory named like the database as an encrypted snapshot", () => {
    // `isFile` is required here: a directory has size > 0 on some filesystems,
    // and an encrypted marker skips the plaintext header check that would
    // otherwise reject it.
    const folder = join(backupsRoot, DATE);
    mkdirSync(join(folder, BACKUP_DB_FILE_NAME), { recursive: true });
    writeFileSync(
      join(folder, BACKUP_MARKER_FILE_NAME),
      markerJson({ encrypted: true }),
    );
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus().lastBackupPath).toBeNull();
  });

  it("does not count a marked folder whose database cannot be opened", () => {
    const folder = createSnapshotFixture(DATE);
    fsControl.failOpenMatching = BACKUP_DB_FILE_NAME;
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });
    fsControl.failOpenMatching = null;

    expect(service.getStatus().lastBackupPath).toBeNull();
    expect(existsSync(join(folder, BACKUP_DB_FILE_NAME))).toBe(true);
  });

  it("does not count a dated folder with a missing or malformed marker", () => {
    const folder = join(backupsRoot, DATE);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, BACKUP_DB_FILE_NAME), "snapshot");
    writeFileSync(
      join(folder, BACKUP_MARKER_FILE_NAME),
      markerJson({ app: "not-tuari" }),
    );
    writeFileSync(join(backupsRoot, "2026-01-13"), "a file, not a folder");

    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus().lastBackupPath).toBeNull();
  });

  it("seeds the status from the newest backup on disk", () => {
    const previous = createSnapshotFixture("2026-01-13");
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus()).toEqual({
      lastBackupPath: previous,
      lastSuccessAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      lastFailure: null,
      backupsRootPath: backupsRoot,
      retention: { daily: 14, weekly: 8, monthly: 6 },
    });
  });

  it("seeds lastSuccessAt from the marker's takenAt, not the folder mtime", () => {
    const previous = createSnapshotFixture("2026-01-13");
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    // createSnapshotFixture writes takenAt 2026-01-13T08:00:00.000Z.
    expect(service.getStatus()).toEqual({
      lastBackupPath: previous,
      lastSuccessAt: "2026-01-13T08:00:00.000Z",
      lastFailure: null,
      backupsRootPath: backupsRoot,
      retention: { daily: 14, weekly: 8, monthly: 6 },
    });
  });

  it("starts with an empty status when there are no backups", () => {
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: join(tempRoot, "missing"),
      now,
      logger: noopLogger,
    });

    expect(service.getStatus()).toEqual({
      lastBackupPath: null,
      lastSuccessAt: null,
      lastFailure: null,
      backupsRootPath: join(tempRoot, "missing"),
      retention: { daily: 14, weekly: 8, monthly: 6 },
    });
  });

  it("defaults the clock and logger when they are not injected", async () => {
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
    });

    const result = await service.runDueBackup();

    expect(result.status).toBe("created");
    expect(readdirSync(backupsRoot)).toHaveLength(1);
  });

  it("defaults the failure logger when it is not injected", async () => {
    const service = createBackupService({
      snapshot: async () => {
        throw new Error("nope");
      },
      backupsRootPath: backupsRoot,
    });

    expect((await service.runDueBackup()).status).toBe("failed");
  });

  it("degrades to a recorded failure when the backups root cannot be listed", () => {
    mkdirSync(backupsRoot, { recursive: true });
    fsControl.failReaddir = true;
    const service = createBackupService({
      snapshot: stubSnapshotter(),
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
      backupsRootPath: backupsRoot,
      retention: { daily: 14, weekly: 8, monthly: 6 },
    });
  });

  it("clears a construction-time root failure once the root can be listed", async () => {
    // Yesterday's backup exists, so the run is not due.
    createSnapshotFixture(DATE);
    fsControl.failReaddir = true;
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });
    fsControl.failReaddir = false;

    // Boot could not read the root, so the status records that...
    expect(service.getStatus().lastFailure?.reason).toBe(
      "EACCES: permission denied",
    );

    // ...but the root is fine now. A not-due start lists it successfully, so
    // the stale boot failure must not survive.
    expect(await service.runDueBackup()).toEqual({ status: "not-due" });
    expect(service.getStatus().lastFailure).toBeNull();
  });

  it("keeps a real run failure across a later not-due start", async () => {
    createSnapshotFixture("2026-01-13", "older");
    const service = createBackupService({
      snapshot: async () => {
        throw new Error("disk full");
      },
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    expect((await service.runDueBackup()).status).toBe("failed");
    expect(service.getStatus().lastFailure?.reason).toBe("disk full");

    // Yesterday's folder now exists, so the next start is not due. A real
    // failure must survive the successful listing.
    createSnapshotFixture(DATE);
    expect(await service.runDueBackup()).toEqual({ status: "not-due" });
    expect(service.getStatus().lastFailure?.reason).toBe("disk full");
  });

  it("degrades to a string failure when the root read throws a non-Error", () => {
    mkdirSync(backupsRoot, { recursive: true });
    fsControl.failReaddir = true;
    fsControl.readdirError = "permission boom";
    const service = createBackupService({
      snapshot: stubSnapshotter(),
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
    createLiveDatabase();
    mkdirSync(join(backupsRoot, ".staging-abandoned"), { recursive: true });
    const service = createBackupService({
      snapshot: stubSnapshotter(),
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
    createLiveDatabase();
    const stale = join(backupsRoot, ".staging-abandoned");
    mkdirSync(stale, { recursive: true });
    // A crashed run leaves our partial copy behind, not just an empty folder.
    writeFileSync(join(stale, BACKUP_DB_FILE_NAME), "partial");
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    await service.runDueBackup();

    expect(existsSync(stale)).toBe(false);
  });

  it("keeps a foreign .staging-* directory it did not create", async () => {
    createLiveDatabase();
    const foreign = join(backupsRoot, ".staging-operator");
    mkdirSync(foreign, { recursive: true });
    writeFileSync(join(foreign, "keep.txt"), "not ours");
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    await service.runDueBackup();

    expect(existsSync(join(foreign, "keep.txt"))).toBe(true);
  });

  it("keeps a .staging-* file and an unreadable .staging-* directory", async () => {
    createLiveDatabase();
    mkdirSync(backupsRoot, { recursive: true });
    const file = join(backupsRoot, ".staging-file");
    writeFileSync(file, "not a directory");
    const locked = join(backupsRoot, ".staging-locked");
    mkdirSync(locked, { recursive: true });
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      logger: noopLogger,
    });

    fsControl.failReaddirMatching = ".staging-locked";
    await service.runDueBackup();
    fsControl.failReaddirMatching = null;

    expect(existsSync(file)).toBe(true);
    expect(existsSync(locked)).toBe(true);
  });

  it("surfaces a prune the filesystem refused instead of swallowing it", async () => {
    for (let day = 1; day <= 10; day += 1) {
      createSnapshotFixture(`2026-01-${String(day).padStart(2, "0")}`);
    }
    const service = createBackupService({
      snapshot: stubSnapshotter(),
      backupsRootPath: backupsRoot,
      now,
      policy: { daily: 2, weekly: 1, monthly: 1 },
      logger: noopLogger,
    });

    fsControl.failRemoveMatching = join(backupsRoot, "2026-01-01");
    const result = await service.runDueBackup();
    fsControl.failRemoveMatching = null;

    // The snapshot itself succeeded...
    expect(result.status).toBe("created");
    expect(service.getStatus().lastSuccessAt).toBe(now().toISOString());
    // ...but the un-pruned folder is reported, not hidden in a log line.
    expect(service.getStatus().lastFailure?.reason).toContain(
      "could not prune 2026-01-01",
    );
    expect(existsSync(join(backupsRoot, "2026-01-01"))).toBe(true);

    // A real run failure survives a later not-due start (it is not seeded).
    expect(await service.runDueBackup()).toEqual({ status: "not-due" });
    expect(service.getStatus().lastFailure?.reason).toContain(
      "could not prune 2026-01-01",
    );
  });

  // The encrypted path is proved in `backup.encrypted.test.ts`, which is gated
  // on the SQLCipher native binding actually being present and loadable (#402).
  // This file stays PLAIN-SQLite-only on purpose: every snapshot it takes is an
  // unencrypted database read back with a plain better-sqlite3 reader.
});

describe("pruneBackups", () => {
  let tempRoot: string;
  let backupsRoot: string;
  const at = new Date(2026, 0, 15);

  const writeSnapshot = (date: string): string => {
    const folder = join(backupsRoot, date);
    mkdirSync(folder, { recursive: true });
    const db = new Database(join(folder, BACKUP_DB_FILE_NAME));
    db.exec("CREATE TABLE fixture (id INTEGER PRIMARY KEY)");
    db.close();
    writeFileSync(join(folder, BACKUP_MARKER_FILE_NAME), markerJson());
    return folder;
  };

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "tuari-prune-"));
    backupsRoot = join(tempRoot, "backups");
    mkdirSync(backupsRoot, { recursive: true });
  });

  afterEach(() => {
    fsControl.failRemoveMatching = null;
    fsControl.failReaddirMatching = null;
    fsControl.removeError = new Error("EBUSY: resource busy or locked");
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("lists marked snapshots without a clock (future dates included)", () => {
    writeSnapshot("2026-01-01");
    writeSnapshot("2099-01-01");

    expect(listBackupDates(backupsRoot)).toEqual([
      "2026-01-01",
      "2099-01-01",
    ]);
  });

  it("never deletes a folder that does not carry a Tuari marker", () => {
    const foreign = join(backupsRoot, "2026-01-01");
    mkdirSync(foreign, { recursive: true });
    writeFileSync(join(foreign, "keep.txt"), "not ours");

    const result = pruneBackups(
      backupsRoot,
      ["2026-01-01", "2026-01-02", "2026-01-03"],
      { daily: 0, weekly: 0, monthly: 0 },
      noopLogger,
      at,
    );

    // The policy would prune everything, but only the real snapshot in the set
    // is touched; the foreign folder survives.
    expect(existsSync(join(foreign, "keep.txt"))).toBe(true);
    expect(result.pruned).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it("records a non-Error prune failure as a string", () => {
    const folder = writeSnapshot("2026-01-01");
    fsControl.failRemoveMatching = join(backupsRoot, "2026-01-01");
    fsControl.removeError = "locked";

    const result = pruneBackups(
      backupsRoot,
      ["2026-01-01", "2026-01-02", "2026-01-03"],
      { daily: 0, weekly: 0, monthly: 0 },
      noopLogger,
      at,
    );
    fsControl.removeError = new Error("EBUSY: resource busy or locked");

    expect(result.failures).toEqual([
      { at: at.toISOString(), reason: "could not prune 2026-01-01: locked" },
    ]);
    expect(existsSync(folder)).toBe(true);
  });
});

describe("createBackupService.setBackupsRoot (#436)", () => {
  let tempRoot: string;
  let firstRoot: string;
  let secondRoot: string;

  const snapshot: BackupSnapshotter = async (outputPath) => {
    // A minimal non-empty copy; the service trusts the injected snapshotter and
    // only re-validates on-disk folders when seeding, not the just-written run.
    writeFileSync(outputPath, "SQLite format 3\u0000");
    return { schemaVersion: 0, encrypted: false };
  };

  /** A usable snapshot folder (SQLite header + valid marker) in `root`. */
  const writeUsableSnapshot = (root: string, date: string): void => {
    const folder = join(root, date);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, BACKUP_DB_FILE_NAME), "SQLite format 3\u0000");
    writeFileSync(join(folder, BACKUP_MARKER_FILE_NAME), markerJson());
  };

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "tuari-backup-root-"));
    firstRoot = join(tempRoot, "backups-a");
    secondRoot = join(tempRoot, "backups-b");
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("writes the next run into the newly chosen root and reports it", async () => {
    const service = createBackupService({
      snapshot,
      backupsRootPath: firstRoot,
      now,
      logger: noopLogger,
    });

    service.setBackupsRoot(secondRoot);

    // Re-seeded from the new (empty) root, not the old folder.
    expect(service.getStatus().backupsRootPath).toBe(secondRoot);
    expect(service.getStatus().lastSuccessAt).toBeNull();

    const result = await service.runDueBackup();
    expect(result.status).toBe("created");
    expect(readdirSync(secondRoot)).toContain(DATE);
    expect(existsSync(join(secondRoot, DATE, BACKUP_DB_FILE_NAME))).toBe(true);
  });

  it("reports a retention override with the status", () => {
    const policy = { daily: 3, weekly: 2, monthly: 1 };
    const service = createBackupService({
      snapshot,
      backupsRootPath: firstRoot,
      policy,
      now,
      logger: noopLogger,
    });

    expect(service.getStatus().retention).toEqual(policy);
  });

  it("records a failure when the root path is a file, instead of throwing", async () => {
    // The root is a FILE: construction sees "not a directory" and seeds an
    // empty status; the run's mkdir must fail and become a recorded failure.
    const fileRoot = join(tempRoot, "not-a-folder");
    writeFileSync(fileRoot, "i am a file");
    const service = createBackupService({
      snapshot,
      backupsRootPath: fileRoot,
      now,
      logger: noopLogger,
    });

    const result = await service.runDueBackup();

    expect(result.status).toBe("failed");
    expect(service.getStatus().lastFailure?.reason).toEqual(expect.any(String));
  });

  it("keeps a real run failure when the same folder is saved again", async () => {
    // Re-saving the folder the status already describes must not re-seed from
    // the disk scan: the scan is readable and would report a clean status,
    // hiding a snapshot/prune failure the owner still has and never retried.
    const failingSnapshot: BackupSnapshotter = async () => {
      throw new Error("disk removed");
    };
    const service = createBackupService({
      snapshot: failingSnapshot,
      backupsRootPath: firstRoot,
      now,
      logger: noopLogger,
    });

    const result = await service.runDueBackup();
    expect(result.status).toBe("failed");
    const failure = service.getStatus().lastFailure;
    expect(failure?.reason).toContain("disk removed");

    service.setBackupsRoot(firstRoot);

    expect(service.getStatus().lastFailure).toEqual(failure);
  });

  it("does not adopt a run that finishes after the owner changed the root", async () => {
    // `deps.snapshot` awaits, so the owner can repoint the root mid-run. The
    // completed snapshot lives in the old root; the status must keep
    // describing the new one (the screen must never describe the old folder).
    let releaseSnapshot: () => void = () => {};
    const gate = new Promise<void>((resolveGate) => {
      releaseSnapshot = resolveGate;
    });
    const slowSnapshot: BackupSnapshotter = async (outputPath) => {
      await gate;
      writeFileSync(outputPath, "SQLite format 3\u0000");
      return { schemaVersion: 0, encrypted: false };
    };
    const service = createBackupService({
      snapshot: slowSnapshot,
      backupsRootPath: firstRoot,
      now,
      logger: noopLogger,
    });

    const pending = service.runDueBackup();
    service.setBackupsRoot(secondRoot);
    releaseSnapshot();
    const result = await pending;

    expect(result.status).toBe("created");
    const status = service.getStatus();
    expect(status.backupsRootPath).toBe(secondRoot);
    // Re-seeded for the new (empty) root; the old run must not overwrite it.
    expect(status.lastSuccessAt).toBeNull();
    expect(status.lastBackupPath).toBeNull();
  });

  it("prunes only the pinned old root after a mid-run root change", async () => {
    // The data-loss regression from the PR: `runDueBackup` lists `runRoot`,
    // awaits the snapshot, and only then prunes. If pruning followed the LIVE
    // `backupsRootPath`, the old root's date list would be applied to the new
    // root and real backups in the folder the owner just chose would be
    // deleted. Seed BOTH roots with identical dates so a wrong-root prune is
    // observable, and assert the new root is untouched.
    const policy = { daily: 1, weekly: 0, monthly: 0 };
    for (const date of ["2026-01-01", "2026-01-02", "2026-01-03"]) {
      writeUsableSnapshot(firstRoot, date);
      writeUsableSnapshot(secondRoot, date);
    }

    let releaseSnapshot: () => void = () => {};
    const gate = new Promise<void>((resolveGate) => {
      releaseSnapshot = resolveGate;
    });
    const slowSnapshot: BackupSnapshotter = async (outputPath) => {
      await gate;
      writeFileSync(outputPath, "SQLite format 3\u0000");
      return { schemaVersion: 0, encrypted: false };
    };
    const service = createBackupService({
      snapshot: slowSnapshot,
      backupsRootPath: firstRoot,
      policy,
      now,
      logger: noopLogger,
    });

    const pending = service.runDueBackup();
    service.setBackupsRoot(secondRoot);
    releaseSnapshot();
    const result = await pending;

    expect(result.status).toBe("created");
    // Retention ran against the pinned old root: its stale snapshots are gone,
    // only the fresh one survives.
    expect(listBackupDates(firstRoot)).toEqual([DATE]);
    // The new root kept every seed; the old root's retention never touched it.
    expect(listBackupDates(secondRoot)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
  });

  it("does not pin an in-flight failure on the root the owner moved to", async () => {
    // The mirror of the success case: if the run fails after the root changed,
    // the failure belongs to the old root, not the folder now on screen.
    let releaseSnapshot: () => void = () => {};
    const gate = new Promise<void>((resolveGate) => {
      releaseSnapshot = resolveGate;
    });
    const failingSnapshot: BackupSnapshotter = async () => {
      await gate;
      throw new Error("disk removed");
    };
    const service = createBackupService({
      snapshot: failingSnapshot,
      backupsRootPath: firstRoot,
      now,
      logger: noopLogger,
    });

    const pending = service.runDueBackup();
    service.setBackupsRoot(secondRoot);
    releaseSnapshot();
    const result = await pending;

    expect(result.status).toBe("failed");
    const status = service.getStatus();
    expect(status.backupsRootPath).toBe(secondRoot);
    expect(status.lastFailure).toBeNull();
  });
});
