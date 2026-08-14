import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import type { BetterSqliteDatabase } from "../../types/sqlite";
import {
  createDatabaseKeyManager,
  type DatabaseKeyManagerSeams,
} from "./database-key-manager";

/** First 16 bytes of a plain SQLite file (the standard magic header). */
const PLAIN_MAGIC = Buffer.from("SQLite format 3\0", "utf8");

/** A 16-byte non-magic header — what SQLCipher's random salt region looks like. */
const CIPHER_LIKE_HEADER = Buffer.from("0123456789abcdef", "utf8");

function makeSharedSqliteMock() {
  const pragma = vi.fn();
  const prepare = vi.fn().mockReturnValue({ get: () => ({ count: 0 }) });
  return {
    pragma,
    prepare,
    close: vi.fn(),
  } as unknown as BetterSqliteDatabase;
}

function makeScratchMock() {
  const close = vi.fn();
  const connection = {
    prepare: vi.fn().mockReturnValue({ get: () => ({ count: 0 }) }),
    close,
  };
  return { connection, close };
}

function makeManager(
  sqlite: BetterSqliteDatabase,
  databasePath: string,
  openConnection: DatabaseKeyManagerSeams["openConnection"],
) {
  return createDatabaseKeyManager(sqlite, { databasePath, openConnection });
}

describe("createDatabaseKeyManager", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tuari-db-key-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects an unencrypted database file explicitly and never rekeys", () => {
    // A real plain-SQLite file (magic header at offset 0).
    const dbPath = join(tempDir, "plain.sqlite");
    writeFileSync(dbPath, PLAIN_MAGIC);

    const sqlite = makeSharedSqliteMock();
    const manager = makeManager(sqlite, dbPath, vi.fn());

    expect(manager.changeKey("old-key", "new-key-123")).toEqual({
      success: false,
      error: "Database is not encrypted",
    });

    // Neither verification nor rekey touched the shared connection.
    expect(sqlite.pragma).not.toHaveBeenCalled();
    expect(sqlite.prepare).not.toHaveBeenCalled();
  });

  it("verifies the current key on a fresh connection and rekeys (encrypted file)", () => {
    // A non-magic header reads as SQLCipher-encrypted.
    const dbPath = join(tempDir, "cipher.sqlite");
    writeFileSync(dbPath, CIPHER_LIKE_HEADER);

    const sqlite = makeSharedSqliteMock();
    const scratch = makeScratchMock();
    const openConnection = vi.fn().mockReturnValue(scratch.connection);
    const manager = makeManager(sqlite, dbPath, openConnection);

    expect(manager.changeKey("current-key", "new-key-123")).toEqual({ success: true });

    // Verification opened a scratch connection with the CURRENT key…
    expect(openConnection).toHaveBeenCalledWith(dbPath, "current-key");
    expect(scratch.connection.prepare).toHaveBeenCalledWith("SELECT COUNT(*) FROM sqlite_master");
    // …and the rekey was confirmed on a fresh connection with the NEW key.
    expect(openConnection).toHaveBeenLastCalledWith(dbPath, "new-key-123");
    // Both scratch connections were closed.
    expect(scratch.close).toHaveBeenCalledTimes(2);
    // The rekey ran on the shared connection with the NEW key.
    expect(sqlite.pragma).toHaveBeenCalledWith("rekey = 'new-key-123'");
  });

  it("fails with a re-encryption message when the post-rekey verification fails", () => {
    const dbPath = join(tempDir, "cipher.sqlite");
    writeFileSync(dbPath, CIPHER_LIKE_HEADER);

    const sqlite = makeSharedSqliteMock();
    const failingScratch = makeScratchMock();
    failingScratch.connection.prepare.mockImplementation(() => {
      throw new Error("file is not a database");
    });
    const openConnection = vi.fn((path: string, key: string) =>
      // current-key verification succeeds; new-key verification fails.
      key === "current-key" ? makeScratchMock().connection : failingScratch.connection,
    ) as unknown as DatabaseKeyManagerSeams["openConnection"];
    const manager = makeManager(sqlite, dbPath, openConnection);

    expect(manager.changeKey("current-key", "new-key-123")).toEqual({
      success: false,
      error: "Database re-encryption failed",
      rekeyed: false,
    });

    // The rekey itself ran, but the new key was not confirmed.
    expect(sqlite.pragma).toHaveBeenCalledWith("rekey = 'new-key-123'");
  });

  it("discriminates rekeyed:true when neither key opens the database after a failed post-rekey verification", () => {
    const dbPath = join(tempDir, "cipher.sqlite");
    writeFileSync(dbPath, CIPHER_LIKE_HEADER);

    const sqlite = makeSharedSqliteMock();
    const openingScratch = makeScratchMock();
    const failingScratch = makeScratchMock();
    failingScratch.connection.prepare.mockImplementation(() => {
      throw new Error("file is not a database");
    });
    // Current-key verification succeeds (first call); new-key verification AND
    // the old-key probe both fail → the DB is on the NEW key (the rekey
    // applied), so the caller must NOT roll its keyring back.
    const openConnection = vi
      .fn()
      .mockReturnValueOnce(openingScratch.connection)
      .mockReturnValue(failingScratch.connection) as unknown as DatabaseKeyManagerSeams["openConnection"];
    const manager = makeManager(sqlite, dbPath, openConnection);

    expect(manager.changeKey("current-key", "new-key-123")).toEqual({
      success: false,
      error: "Database re-encryption failed",
      rekeyed: true,
    });
    // current-key verify + new-key verify + old-key probe = 3 fresh openings.
    expect(openConnection).toHaveBeenCalledTimes(3);
  });

  it("discriminates rekeyed:false when the old key still opens the database (rekey silently no-op'd)", () => {
    const dbPath = join(tempDir, "cipher.sqlite");
    writeFileSync(dbPath, CIPHER_LIKE_HEADER);

    const sqlite = makeSharedSqliteMock();
    const openingScratch = makeScratchMock();
    const failingScratch = makeScratchMock();
    failingScratch.connection.prepare.mockImplementation(() => {
      throw new Error("file is not a database");
    });
    // New-key verification fails, but the CURRENT key still opens the
    // database → the rekey never applied; restoring the old key is safe.
    const openConnection = vi.fn((_path: string, key: string) =>
      key === "new-key-123" ? failingScratch.connection : openingScratch.connection,
    ) as unknown as DatabaseKeyManagerSeams["openConnection"];
    const manager = makeManager(sqlite, dbPath, openConnection);

    expect(manager.changeKey("current-key", "new-key-123")).toEqual({
      success: false,
      error: "Database re-encryption failed",
      rekeyed: false,
    });
    // current-key verify + new-key verify + old-key probe.
    expect(openConnection).toHaveBeenCalledTimes(3);
  });

  it("treats a missing database file as fallback (shared-connection verification)", () => {
    // No file on disk at all — detectEncryption's openSync throws and the
    // manager falls back to the shared connection (dev/test behavior on plain
    // better-sqlite3, where the SQLCipher PRAGMAs are no-ops).
    const dbPath = join(tempDir, "does-not-exist.sqlite");

    const sqlite = makeSharedSqliteMock();
    const manager = makeManager(sqlite, dbPath, vi.fn());

    expect(manager.changeKey("current-key", "new-key-123")).toEqual({ success: true });
    expect(sqlite.pragma).toHaveBeenCalledWith("rekey = 'new-key-123'");
  });

  it("fails when the fresh-connection verification rejects the current key", () => {
    const dbPath = join(tempDir, "cipher.sqlite");
    writeFileSync(dbPath, CIPHER_LIKE_HEADER);

    const sqlite = makeSharedSqliteMock();
    const scratch = makeScratchMock();
    scratch.connection.prepare.mockImplementation(() => {
      throw new Error("file is not a database");
    });
    const openConnection = vi.fn().mockReturnValue(scratch.connection);
    const manager = makeManager(sqlite, dbPath, openConnection);

    expect(manager.changeKey("wrong-key", "new-key-123")).toEqual({
      success: false,
      error: "Current encryption key is invalid",
    });

    // Rekey must never run after a failed verification.
    expect(sqlite.pragma).not.toHaveBeenCalled();
    // The scratch connection is still closed on the failure path.
    expect(scratch.close).toHaveBeenCalledTimes(1);
  });

  it("fails when opening the scratch connection itself throws", () => {
    const dbPath = join(tempDir, "cipher.sqlite");
    writeFileSync(dbPath, CIPHER_LIKE_HEADER);

    const sqlite = makeSharedSqliteMock();
    const openConnection = vi.fn(() => {
      throw new Error("failed to open");
    });
    const manager = makeManager(sqlite, dbPath, openConnection);

    expect(manager.changeKey("old-key", "new-key-123")).toEqual({
      success: false,
      error: "Current encryption key is invalid",
    });
    expect(sqlite.pragma).not.toHaveBeenCalled();
  });

  it("treats a file too short for a header as fallback (shared-connection verification)", () => {
    const dbPath = join(tempDir, "tiny.sqlite");
    writeFileSync(dbPath, "short");

    const sqlite = makeSharedSqliteMock();
    const manager = makeManager(sqlite, dbPath, vi.fn());

    // A <16-byte file cannot be classified — the manager falls back to the
    // shared connection, so on plain better-sqlite3 the no-op PRAGMAs report
    // success (dev/test behavior).
    expect(manager.changeKey("current-key", "new-key-123")).toEqual({ success: true });
    expect(sqlite.pragma).toHaveBeenCalledWith("rekey = 'new-key-123'");
  });

  it("rejects empty keys before touching the connection", () => {
    const sqlite = makeSharedSqliteMock();
    const manager = makeManager(sqlite, ":memory:", vi.fn());

    expect(manager.changeKey("", "new-key-123")).toEqual({
      success: false,
      error: "Database encryption keys must not be empty",
    });
    expect(manager.changeKey("old-key", "   ")).toEqual({
      success: false,
      error: "Database encryption keys must not be empty",
    });
    expect(sqlite.pragma).not.toHaveBeenCalled();
  });

  it("falls back to the shared connection for :memory: databases (dev/test behavior)", () => {
    const sqlite = makeSharedSqliteMock();
    const manager = makeManager(sqlite, ":memory:", vi.fn());

    // On plain better-sqlite3 the SQLCipher PRAGMAs are no-ops, so the
    // verification read succeeds and the manager reports success — proving
    // the statements execute against a real connection.
    expect(manager.changeKey("current-key", "new-key-123")).toEqual({ success: true });
    expect(sqlite.pragma).toHaveBeenNthCalledWith(1, "key = 'current-key'");
    expect(sqlite.pragma).toHaveBeenNthCalledWith(2, "rekey = 'new-key-123'");
  });

  it("interpolates keys into the PRAGMA statements with single quotes escaped", () => {
    const sqlite = makeSharedSqliteMock();
    const manager = makeManager(sqlite, ":memory:", vi.fn());

    expect(manager.changeKey("old-key", "new-key-'quoted'")).toEqual({ success: true });

    // Exact statements the handler previously built — verification read first,
    // rekey second, single quotes doubled ('' — not spliced).
    expect(sqlite.pragma).toHaveBeenNthCalledWith(1, "key = 'old-key'");
    expect(sqlite.pragma).toHaveBeenNthCalledWith(2, "rekey = 'new-key-''quoted'''");
    expect(sqlite.prepare).toHaveBeenCalledWith("SELECT COUNT(*) FROM sqlite_master");
  });

  it("escapes single quotes in the current key verification PRAGMA too", () => {
    const sqlite = makeSharedSqliteMock();
    const manager = makeManager(sqlite, ":memory:", vi.fn());

    expect(manager.changeKey("old-'quoted'", "new-key")).toEqual({ success: true });

    expect(sqlite.pragma).toHaveBeenNthCalledWith(1, "key = 'old-''quoted'''");
    expect(sqlite.pragma).toHaveBeenNthCalledWith(2, "rekey = 'new-key'");
  });

  it("fails with the wire copy when the shared-connection verification read fails", () => {
    const pragma = vi.fn().mockImplementation(() => {
      throw new Error("file is not a database");
    });
    const sqlite = {
      pragma,
      prepare: vi.fn(),
    } as unknown as BetterSqliteDatabase;
    const manager = makeManager(sqlite, ":memory:", vi.fn());

    expect(manager.changeKey("wrong-key", "new-key-123")).toEqual({
      success: false,
      error: "Current encryption key is invalid",
    });

    // Only the verification PRAGMA ran — the rekey must not execute.
    expect(pragma).toHaveBeenCalledTimes(1);
  });

  it("fails with a re-encryption message when the rekey itself fails", () => {
    const pragma = vi.fn().mockImplementation((sql: string) => {
      if (sql.startsWith("rekey")) throw new Error("database is locked");
    });
    const sqlite = {
      pragma,
      prepare: vi.fn().mockReturnValue({ get: () => ({ count: 0 }) }),
    } as unknown as BetterSqliteDatabase;
    const manager = makeManager(sqlite, ":memory:", vi.fn());

    // The port's result contract must hold even when the rekey throws — the
    // handler maps this to a graceful wire failure instead of a 500, and the
    // message reflects the actual failing step.
    expect(manager.changeKey("old-key", "new-key-123")).toEqual({
      success: false,
      error: "Database re-encryption failed",
    });
    expect(pragma).toHaveBeenCalledTimes(2);
  });

  it("still rekeys a real live connection for :memory: (plain better-sqlite3 no-op)", () => {
    const sqlite = new Database(":memory:");
    try {
      const manager = createDatabaseKeyManager(
        sqlite as unknown as BetterSqliteDatabase,
        { databasePath: ":memory:", openConnection: vi.fn() },
      );

      expect(manager.changeKey("current-key", "new-key-123")).toEqual({ success: true });
    } finally {
      sqlite.close();
    }
  });

  it("resolves the database path from the connection when no seam is given", () => {
    const sqlite = makeSharedSqliteMock();
    Object.defineProperty(sqlite, "name", { value: join(tempDir, "cipher.sqlite") });
    writeFileSync(join(tempDir, "cipher.sqlite"), CIPHER_LIKE_HEADER);

    const scratch = makeScratchMock();
    const manager = createDatabaseKeyManager(sqlite, {
      openConnection: vi.fn().mockReturnValue(scratch.connection),
    });

    expect(manager.changeKey("current-key", "new-key-123")).toEqual({ success: true });
    expect(scratch.connection.prepare).toHaveBeenCalledWith("SELECT COUNT(*) FROM sqlite_master");
  });
});
