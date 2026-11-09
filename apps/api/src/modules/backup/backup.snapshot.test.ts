import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
      expect(() => createDatabaseConnection(outputPath, null)).toThrow(/not a database/i);
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
