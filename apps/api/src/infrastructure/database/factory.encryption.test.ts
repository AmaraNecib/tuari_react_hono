import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createDatabaseConnection } from "./factory";

/**
 * The encrypted path may not be asserted, it has to be demonstrated.
 *
 * The previous binding (`better-sqlite3-sqlcipher@5.4.3-3`) was listed as an
 * ordinary dependency and pnpm never ran its `install` script, so no addon was
 * ever fetched; the code still set `key = '...'` and the file came out
 * plaintext. A test that only checks that a connection opens cannot see that
 * difference, so these tests read the file bytes and try the wrong key.
 */
const dirs: string[] = [];

const tempDb = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "tuari-encryption-"));
  dirs.push(dir);
  return join(dir, "app.db");
};

afterEach(() => {
  while (dirs.length > 0) {
    // Windows keeps the WAL/SHM handles for a moment after close(); without the
    // retry this cleanup fails with EBUSY and fails an unrelated assertion.
    rmSync(dirs.pop()!, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

describe("createDatabaseConnection with a key", () => {
  it("writes a file that is not a plaintext SQLite database", () => {
    const path = tempDb();
    const db = createDatabaseConnection(path, "correct horse battery staple");
    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t VALUES (?)").run("secret");
    db.close();

    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 15).toString("latin1")).not.toBe("SQLite format 3");
    expect(bytes.includes(Buffer.from("secret"))).toBe(false);
  });

  it("reads its own rows back, and refuses the wrong key", () => {
    const path = tempDb();
    const writer = createDatabaseConnection(path, "right");
    writer.exec("CREATE TABLE t (v TEXT)");
    writer.prepare("INSERT INTO t VALUES (?)").run("hello");
    writer.close();

    const reader = createDatabaseConnection(path, "right");
    expect(reader.prepare("SELECT v FROM t").get()).toEqual({ v: "hello" });
    reader.close();

    expect(() => {
      // A wrong key fails closed at open time: setup cannot even set
      // `journal_mode = WAL` on a file this key cannot read. The factory closes
      // the handle on that path, which the afterEach cleanup below proves — a
      // leak shows up as EBUSY on Windows.
      createDatabaseConnection(path, "wrong");
    }).toThrow(/not a database/i);
  });

  it("selects SQLCipher rather than this build's chacha20 default", () => {
    const db = createDatabaseConnection(tempDb(), "pw");

    expect(db.pragma("cipher")).toEqual([{ sqlcipher: "sqlcipher" }]);
    db.close();
  });

  it("still opens an unkeyed database as plain SQLite", () => {
    const path = tempDb();
    const db = createDatabaseConnection(path, null);
    db.exec("CREATE TABLE t (v TEXT)");
    db.prepare("INSERT INTO t VALUES (?)").run("plain");
    db.close();

    expect(readFileSync(path).subarray(0, 15).toString("latin1")).toBe("SQLite format 3");
  });
});
