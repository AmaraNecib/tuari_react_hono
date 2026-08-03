import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

import type { BetterSqliteDatabase } from "../../types/sqlite";
import { createDatabaseKeyManager } from "./database-key-manager";

describe("createDatabaseKeyManager", () => {
  it("verifies the current key and rekeys a live connection", () => {
    const sqlite = new Database(":memory:");
    const manager = createDatabaseKeyManager(sqlite as unknown as BetterSqliteDatabase);

    // On plain better-sqlite3 the SQLCipher PRAGMAs are no-ops, so the
    // verification read succeeds and the manager reports success — proving
    // the statements execute against a real connection.
    expect(manager.changeKey("current-key", "new-key-123")).toBe(true);

    sqlite.close();
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
});
