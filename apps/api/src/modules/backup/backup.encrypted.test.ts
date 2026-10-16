/**
 * Encrypted-backup proof (#402).
 *
 * The daily engine copies with `VACUUM INTO` and applies the key to both the
 * source and the copy, so an encrypted workspace backs up to an encrypted file.
 * That is a claim about real bytes, and the only honest way to prove it is to
 * write a keyed database, take the backup, and then read the copy back with the
 * key and refuse it without. This file is that proof.
 *
 * It is gated on the SQLCipher native binding actually being present and
 * loadable. This workspace has node-gyp but no Windows SDK, so the fork cannot
 * be built here; when the binding is missing the whole suite is skipped rather
 * than silently passing. Building the fork and running this file is what #410's
 * native CI job exists to do.
 */
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createWorkerSnapshotter } from "./backup.snapshot";
import { BACKUP_DB_FILE_NAME, createBackupService } from "./backup.service";

const PLAIN_SQLITE_HEADER = "SQLite format 3\0";
const KEY = "correct horse battery staple";

/**
 * Load `better-sqlite3-sqlcipher` and prove it reports a cipher version, or
 * return `null` when this workspace cannot encrypt. Loading alone is not
 * enough: a stale addon can be present and fail to load, and a plain binding
 * would accept `PRAGMA key` as a no-op.
 */
const loadSqlcipher = (): typeof Database | null => {
  try {
    const sqlcipher = createRequire(import.meta.url)(
      "better-sqlite3-sqlcipher",
    ) as typeof Database;
    const probe = new sqlcipher(":memory:");
    try {
      probe.pragma(`key = '${KEY}'`);
      probe.pragma("cipher_compatibility = 4");
      const version = probe.pragma("cipher_version", { simple: true });
      return typeof version === "string" && version.trim() !== ""
        ? sqlcipher
        : null;
    } finally {
      probe.close();
    }
  } catch {
    return null;
  }
};

const Sqlcipher = loadSqlcipher();

const hasPlaintextHeader = (filePath: string): boolean =>
  readFileSync(filePath)
    .subarray(0, PLAIN_SQLITE_HEADER.length)
    .toString("latin1") === PLAIN_SQLITE_HEADER;

/** Open an encrypted copy WITHOUT a key and force the first read. */
const readWithoutKey = (filePath: string): unknown => {
  const keyless = new Sqlcipher!(filePath);
  try {
    return keyless.prepare("SELECT count(*) FROM sqlite_master").get();
  } finally {
    keyless.close();
  }
};

/** Open an encrypted copy WITH the key and force the first read. */
const readWithKey = (filePath: string): unknown => {
  const copy = new Sqlcipher!(filePath);
  try {
    copy.pragma(`key = '${KEY}'`);
    copy.pragma("cipher_compatibility = 4");
    expect(copy.pragma("integrity_check")).toEqual([
      { integrity_check: "ok" },
    ]);
    return copy.prepare("SELECT label FROM items").get();
  } finally {
    copy.close();
  }
};

const tempDirs: string[] = [];
const tempRoot = () => {
  const dir = mkdtempSync(join(tmpdir(), "tuari-encrypted-backup-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

/** Seed a keyed database and return its path. */
const seedKeyedDatabase = (root: string): string => {
  const databasePath = join(root, "data", "tuari.sqlite");
  const db = createDatabaseConnection(databasePath, KEY, () => Sqlcipher!);
  db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT NOT NULL)");
  db.prepare("INSERT INTO items (label) VALUES (?)").run("keyed-row");
  db.close();
  return databasePath;
};

describe.skipIf(Sqlcipher === null)("encrypted backup (SQLCipher)", () => {
  it("snapshots a keyed database to a file that is encrypted and key-readable", async () => {
    const root = tempRoot();
    const databasePath = seedKeyedDatabase(root);
    const outputPath = join(root, "out.sqlite");

    const result = await createWorkerSnapshotter({
      databasePath,
      databaseKey: KEY,
    })(outputPath);

    expect(result).toEqual({ schemaVersion: 0, encrypted: true });
    // (a) the copy is not a plaintext SQLite database.
    expect(hasPlaintextHeader(outputPath)).toBe(false);
    // (b) it reopens with the key and reads a committed row back.
    expect(readWithKey(outputPath)).toEqual({ label: "keyed-row" });
    // (c) it does not open without the key.
    expect(() => readWithoutKey(outputPath)).toThrow(
      /not a database|encrypted|SQLITE_NOTADB/i,
    );
  });

  it("writes the dated folder and an encrypted marker through the daily service", async () => {
    const root = tempRoot();
    const databasePath = seedKeyedDatabase(root);
    const backupsRoot = join(root, "backups");

    const service = createBackupService({
      snapshot: createWorkerSnapshotter({ databasePath, databaseKey: KEY }),
      backupsRootPath: backupsRoot,
      now: () => new Date(2026, 0, 15, 10, 0, 0),
    });

    expect(await service.runDueBackup()).toEqual({
      status: "created",
      date: "2026-01-14",
      path: join(backupsRoot, "2026-01-14"),
    });
    expect(service.getStatus().lastFailure).toBeNull();

    const copyPath = join(backupsRoot, "2026-01-14", BACKUP_DB_FILE_NAME);
    expect(hasPlaintextHeader(copyPath)).toBe(false);
    expect(readWithKey(copyPath)).toEqual({ label: "keyed-row" });
    expect(() => readWithoutKey(copyPath)).toThrow(
      /not a database|encrypted|SQLITE_NOTADB/i,
    );
    expect(
      JSON.parse(
        readFileSync(join(backupsRoot, "2026-01-14", "snapshot.json"), "utf8"),
      ),
    ).toMatchObject({ app: "tuari", format: 1, encrypted: true });
  });
});
