import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createWorkerSnapshotter } from "./backup.snapshot";

/**
 * Scope: PLAIN SQLite only.
 *
 * The `better-sqlite3-sqlcipher` native binding is not built in this workspace
 * (`#410`), so the encrypted path cannot be exercised here. The keyed test at
 * the bottom only proves the keyed branch resolves the SQLCipher module and
 * reports a rejection; it is NOT proof that an encrypted copy is openable.
 * The skipped test in `backup.service.test.ts` records what real coverage needs.
 */
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
    rmSync(tempRoot, { recursive: true, force: true });
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

  it("keeps the event loop turning while the copy runs", async () => {
    // Large enough that a synchronous copy would hold the loop across several
    // timer periods; the worker must let the timer keep firing.
    seedDatabase(200_000);
    const outputPath = join(tempRoot, "out.sqlite");
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 1);

    try {
      await createWorkerSnapshotter({ databasePath })(outputPath);
    } finally {
      clearInterval(timer);
    }

    expect(statSync(outputPath).size).toBeGreaterThan(0);
    expect(ticks).toBeGreaterThan(0);
  });

  it("rejects when the source database cannot be opened", async () => {
    const snapshot = createWorkerSnapshotter({
      databasePath: join(tempRoot, "missing", "nope.sqlite"),
    });

    await expect(snapshot(join(tempRoot, "out.sqlite"))).rejects.toThrow(
      /cannot open database|unable to open|not a database|ENOENT/i,
    );
  });

  it("routes the keyed path through the SQLCipher binding", async () => {
    // Scope note: the SQLCipher binding is not built (#410), so the worker
    // cannot open the database. This only pins that the keyed branch resolves
    // the SQLCipher module and reports the failure as a rejected snapshot
    // rather than an unhandled worker crash. It is NOT an encryption test.
    seedDatabase(1);
    const snapshot = createWorkerSnapshotter({
      databasePath,
      databaseKey: "secret",
    });

    await expect(snapshot(join(tempRoot, "out.sqlite"))).rejects.toThrow();
  });
});
