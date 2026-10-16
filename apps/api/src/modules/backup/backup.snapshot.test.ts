import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
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

  /** Write a fake driver module whose PRAGMA cipher_version returns `cipherVersion`. */
  const writeFakeDriver = (cipherVersion: string): string => {
    const driverPath = join(
      tempRoot,
      `fake-sqlite-${cipherVersion === "" ? "plain" : "cipher"}.cjs`,
    );
    writeFileSync(
      driverPath,
      [
        "class FakeDatabase {",
        "  pragma(source, options) {",
        "    if (source === \"cipher_version\") {",
        `      return options && options.simple ? ${JSON.stringify(cipherVersion)} : [{ cipher_version: ${JSON.stringify(cipherVersion)} }];`,
        "    }",
        '    if (source === "integrity_check") return [{ integrity_check: "ok" }];',
        '    if (source === "user_version") return 0;',
        "    return [];",
        "  }",
        "  exec() {}",
        "  close() {}",
        "}",
        "module.exports = FakeDatabase;",
      ].join("\n"),
    );
    return driverPath;
  };

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

    // On a workspace without the SQLCipher native binding the module resolves
    // but its `.node` is missing; where the binding exists the keyed open of a
    // plaintext file fails. Either way the worker must report a rejection, not
    // crash, and it must be about the keyed path.
    await expect(snapshot(join(tempRoot, "out.sqlite"))).rejects.toThrow(
      /better_sqlite3\.node|sqlcipher|not a database|cannot open|unable to open/i,
    );
  });

  it("refuses a keyed snapshot when the binding reports no cipher_version (#402)", async () => {
    // The revert detector for the worker's capability probe: without it a
    // plaintext-only binding accepts PRAGMA key as a no-op, writes a plaintext
    // copy, and still reports encrypted: true.
    seedDatabase(1);
    const snapshot = createWorkerSnapshotter({
      databasePath,
      databaseKey: "secret",
      resolveDriverModule: (specifier) => {
        expect(specifier).toBe("better-sqlite3-sqlcipher");
        return writeFakeDriver("");
      },
    });

    await expect(snapshot(join(tempRoot, "out.sqlite"))).rejects.toThrow(
      /no cipher_version/,
    );
  });

  it("does not refuse a binding that reports a cipher version (plumbing, not encryption)", async () => {
    seedDatabase(1);
    const snapshot = createWorkerSnapshotter({
      databasePath,
      databaseKey: "secret",
      resolveDriverModule: (specifier) => {
        expect(specifier).toBe("better-sqlite3-sqlcipher");
        return writeFakeDriver("4.5.6 community");
      },
    });

    await expect(snapshot(join(tempRoot, "out.sqlite"))).resolves.toEqual({
      schemaVersion: 0,
      encrypted: true,
    });
  });
});
