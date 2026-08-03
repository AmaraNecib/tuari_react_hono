import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

import type { BetterSqliteDatabase } from "../../types/sqlite";
import { createDatabaseKeyManager } from "./database-key-manager";

describe("createDatabaseKeyManager", () => {
  it("verifies the current key and rekeys a live connection", () => {
    const sqlite = new Database(":memory:");
    try {
      const manager = createDatabaseKeyManager(sqlite as unknown as BetterSqliteDatabase);

      // On plain better-sqlite3 the SQLCipher PRAGMAs are no-ops, so the
      // verification read succeeds and the manager reports success — proving
      // the statements execute against a real connection.
      expect(manager.changeKey("current-key", "new-key-123")).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  it("interpolates keys into the PRAGMA statements with single quotes escaped", () => {
    const pragma = vi.fn();
    const prepare = vi.fn().mockReturnValue({ get: () => ({ count: 0 }) });
    const manager = createDatabaseKeyManager({
      pragma,
      prepare,
    } as unknown as BetterSqliteDatabase);

    expect(manager.changeKey("old-key", "new-key-'quoted'")).toBe(true);

    // Exact statements the handler previously built — verification read first,
    // rekey second, single quotes doubled ('' — not spliced).
    expect(pragma).toHaveBeenNthCalledWith(1, "key = 'old-key'");
    expect(pragma).toHaveBeenNthCalledWith(2, "rekey = 'new-key-''quoted'''");
    expect(prepare).toHaveBeenCalledWith("SELECT COUNT(*) FROM sqlite_master");
  });

  it("escapes single quotes in the current key verification PRAGMA too", () => {
    const pragma = vi.fn();
    const prepare = vi.fn().mockReturnValue({ get: () => ({ count: 0 }) });
    const manager = createDatabaseKeyManager({
      pragma,
      prepare,
    } as unknown as BetterSqliteDatabase);

    expect(manager.changeKey("old-'quoted'", "new-key")).toBe(true);

    // The current key crosses the same ''-doubling path — a regression here
    // would silently mis-verify keys on the crypto path.
    expect(pragma).toHaveBeenNthCalledWith(1, "key = 'old-''quoted'''");
    expect(pragma).toHaveBeenNthCalledWith(2, "rekey = 'new-key'");
  });

  it("returns false when the current-key verification read fails and never rekeys", () => {
    const pragma = vi.fn().mockImplementation(() => {
      throw new Error("file is not a database");
    });
    const manager = createDatabaseKeyManager({
      pragma,
      prepare: vi.fn(),
    } as unknown as BetterSqliteDatabase);

    expect(manager.changeKey("wrong-key", "new-key-123")).toBe(false);

    // Only the verification PRAGMA ran — the rekey must not execute.
    expect(pragma).toHaveBeenCalledTimes(1);
  });

  it("returns false when the rekey itself fails (no exception escapes the port)", () => {
    const pragma = vi.fn().mockImplementation((sql: string) => {
      if (sql.startsWith("rekey")) throw new Error("database is locked");
    });
    const prepare = vi.fn().mockReturnValue({ get: () => ({ count: 0 }) });
    const manager = createDatabaseKeyManager({
      pragma,
      prepare,
    } as unknown as BetterSqliteDatabase);

    // The port's boolean contract must hold even when the rekey throws — the
    // handler maps this to a graceful wire failure instead of a 500.
    expect(manager.changeKey("old-key", "new-key-123")).toBe(false);
    expect(pragma).toHaveBeenCalledTimes(2);
  });
});
