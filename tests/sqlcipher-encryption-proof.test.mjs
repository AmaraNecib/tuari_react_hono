import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  READ_ROWS_PROBE_SOURCE,
  SQLITE_HEADER_MAGIC,
  WRITE_ROW_PROBE_SOURCE,
  assertNotPlaintextDatabase,
  findSnapshotDatabase,
  isPlaintextSqliteFile,
  parseArgs,
  readFileHeader,
  requiredRuntimeFiles,
} from "../apps/desktop/scripts/sqlcipher-encryption-proof.mjs";

const withTempDir = (run) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tuari-proof-test-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("isPlaintextSqliteFile recognises the SQLite magic", () => {
  withTempDir((dir) => {
    const plaintext = path.join(dir, "plain.sqlite");
    writeFileSync(plaintext, Buffer.concat([SQLITE_HEADER_MAGIC, Buffer.from("payload")]));
    assert.equal(isPlaintextSqliteFile(plaintext), true);
  });
});

test("isPlaintextSqliteFile rejects SQLCipher's encrypted header", () => {
  withTempDir((dir) => {
    // SQLCipher replaces the magic on page 1, so the file starts with ciphertext.
    const encrypted = path.join(dir, "encrypted.sqlite");
    writeFileSync(encrypted, Buffer.from("a1b2c3d4e5f60718293a4b5c6d7e8f90", "hex"));
    assert.equal(isPlaintextSqliteFile(encrypted), false);
  });
});

test("a truncated or empty file is not proof of encryption", () => {
  withTempDir((dir) => {
    // The magic is 16 bytes; a shorter file cannot be a SQLite database AND
    // cannot be SQLCipher page 1, so it must not be read as "encrypted".
    const truncated = path.join(dir, "truncated.sqlite");
    writeFileSync(truncated, SQLITE_HEADER_MAGIC.subarray(0, 8));
    assert.equal(isPlaintextSqliteFile(truncated), false);
    assert.equal(readFileHeader(truncated).length, 8);

    const empty = path.join(dir, "empty.sqlite");
    writeFileSync(empty, Buffer.alloc(0));
    assert.equal(isPlaintextSqliteFile(empty), false);
  });
});

test("findSnapshotDatabase returns the newest dated backup", () => {
  withTempDir((dir) => {
    const write = (name) => {
      mkdirSync(path.join(dir, name), { recursive: true });
      writeFileSync(path.join(dir, name, "tuari.sqlite"), Buffer.from("x"));
      writeFileSync(path.join(dir, name, "snapshot.json"), '{"app":"tuari"}');
    };
    write("2026-01-01");
    write("2026-03-02");

    assert.equal(findSnapshotDatabase(dir), path.join(dir, "2026-03-02", "tuari.sqlite"));
  });
});

test("findSnapshotDatabase ignores folders that are not snapshots", () => {
  withTempDir((dir) => {
    // A dated folder the app never marked is not one of ours, even with a
    // database file in it.
    mkdirSync(path.join(dir, "2026-03-01"), { recursive: true });
    writeFileSync(path.join(dir, "2026-03-01", "tuari.sqlite"), Buffer.from("x"));
    // An undated folder is not a backup period.
    mkdirSync(path.join(dir, "not-a-date"), { recursive: true });
    writeFileSync(path.join(dir, "not-a-date", "tuari.sqlite"), Buffer.from("x"));
    writeFileSync(path.join(dir, "not-a-date", "snapshot.json"), "{}");
    // A marked folder with no database is a failed run, not a backup.
    mkdirSync(path.join(dir, "2026-03-02"), { recursive: true });
    writeFileSync(path.join(dir, "2026-03-02", "snapshot.json"), "{}");

    assert.equal(findSnapshotDatabase(dir), null);
    assert.equal(findSnapshotDatabase(path.join(dir, "missing")), null);
  });
});

test("findSnapshotDatabase falls back to the newest complete backup", () => {
  withTempDir((dir) => {
    // Tomorrow's run failed (it wrote a database but never the marker), so the
    // newest complete snapshot is the one before it. The proof's backups root
    // is a fresh temp directory, so this cannot mask a broken run in practice —
    // but the helper's contract must be the newest *complete* backup, not
    // "null because the newest folder is broken".
    const write = (name, { database = true, marker = true } = {}) => {
      mkdirSync(path.join(dir, name), { recursive: true });
      if (database) writeFileSync(path.join(dir, name, "tuari.sqlite"), Buffer.from("x"));
      if (marker) writeFileSync(path.join(dir, name, "snapshot.json"), '{"app":"tuari"}');
    };
    write("2026-03-01");
    write("2026-03-02", { marker: false });

    assert.equal(findSnapshotDatabase(dir), path.join(dir, "2026-03-01", "tuari.sqlite"));
  });
});

test("assertNotPlaintextDatabase rejects a database that is missing, a directory, too small, or plaintext", () => {
  withTempDir((dir) => {
    const missing = path.join(dir, "missing.sqlite");
    assert.throws(() => assertNotPlaintextDatabase(missing, "probe"), /probe: expected a database .* found none/);

    // A mis-resolved runtime path is usually a directory; the label must
    // survive, not read as a raw EISDIR from somewhere deeper.
    assert.throws(
      () => assertNotPlaintextDatabase(dir, "probe"),
      /probe: expected a database .* found a directory/,
    );

    const empty = path.join(dir, "empty.sqlite");
    writeFileSync(empty, Buffer.alloc(0));
    assert.throws(() => assertNotPlaintextDatabase(empty, "probe"), /probe: .* is 0 bytes/);

    const short = path.join(dir, "short.sqlite");
    writeFileSync(short, SQLITE_HEADER_MAGIC.subarray(0, 8));
    assert.throws(() => assertNotPlaintextDatabase(short, "probe"), /probe: .* is 8 bytes/);

    const plaintext = path.join(dir, "plain.sqlite");
    writeFileSync(plaintext, Buffer.concat([SQLITE_HEADER_MAGIC, Buffer.from("rows")]));
    assert.throws(() => assertNotPlaintextDatabase(plaintext, "probe"), /probe: .* is a PLAINTEXT database/);
  });
});

test("assertNotPlaintextDatabase accepts a non-plaintext file at and above the header size", () => {
  withTempDir((dir) => {
    // Exactly the header length is the boundary: anything shorter is rejected
    // as too small, so 16 non-magic bytes is the smallest accepted file.
    const boundary = path.join(dir, "boundary.sqlite");
    writeFileSync(boundary, Buffer.alloc(SQLITE_HEADER_MAGIC.length, 0xab));
    assert.equal(assertNotPlaintextDatabase(boundary, "probe"), SQLITE_HEADER_MAGIC.length);

    const encrypted = path.join(dir, "encrypted.sqlite");
    writeFileSync(encrypted, Buffer.alloc(2048, 0xab));
    assert.equal(assertNotPlaintextDatabase(encrypted, "probe"), 2048);
  });
});

test("the probes apply the key before they touch the database", () => {
  // Structural, not behavioural: the keyed write is the guarantee, and no test
  // that runs without the native binding can observe it. Deleting the key
  // pragma has to fail something.
  for (const source of [WRITE_ROW_PROBE_SOURCE, READ_ROWS_PROBE_SOURCE]) {
    assert.match(source, /db\.pragma\("key = /);
    assert.match(source, /db\.pragma\("cipher_compatibility = 4"\)/);
  }
  assert.match(WRITE_ROW_PROBE_SOURCE, /INSERT INTO proof/);
  assert.match(READ_ROWS_PROBE_SOURCE, /process\.env\.TUARI_PROOF_SQL/);
});

test("requiredRuntimeFiles names the shipped binding, entry point and interpreter", () => {
  const files = requiredRuntimeFiles("/runtime", "/runtime/node.exe");
  assert.deepEqual(
    files.map((file) => file.path),
    [
      "/runtime/node.exe",
      path.join("/runtime", "dist", "index.cjs"),
      path.join("/runtime", "node_modules", "better-sqlite3-sqlcipher", "package.json"),
    ],
  );
  assert.equal(files[0].what, "the bundled Node runtime");
  assert.ok(files[2].what.includes("better-sqlite3-sqlcipher"));
});

test("parseArgs defaults to the sidecar build output", () => {
  const options = parseArgs([]);
  assert.match(options.runtimeDir, /src-tauri[\\/]bin[\\/]api-runtime$/);
  assert.match(options.nodeExe, /src-tauri[\\/]bin[\\/]node\.exe$/);
  assert.equal(options.keep, false);
});

test("parseArgs honours overrides and rejects unknown flags", () => {
  const options = parseArgs(["--runtime", "./tmp/rt", "--node", "./tmp/node.exe", "--keep"]);
  assert.equal(options.runtimeDir, path.resolve("./tmp/rt"));
  assert.equal(options.nodeExe, path.resolve("./tmp/node.exe"));
  assert.equal(options.keep, true);

  assert.throws(() => parseArgs(["--nope"]), /Unknown option: --nope/);
});

test("parseArgs rejects a single-dash typo or a bare positional instead of ignoring it", () => {
  // Silently ignoring these means the gate proves the default runtime while the
  // caller believes they named one.
  assert.throws(() => parseArgs(["-runtime", "./tmp/rt"]), /Unknown option: -runtime/);
  assert.throws(() => parseArgs(["./tmp/rt"]), /Unknown option: \.\/tmp\/rt/);
});

test("parseArgs rejects a flag with no value and a non-numeric timeout", () => {
  // `path.resolve(undefined)` would throw a bare TypeError, and a NaN timeout
  // makes the wait fail instantly with a message about `NaNms`.
  assert.throws(() => parseArgs(["--runtime"]), /--runtime needs a value/);
  assert.throws(() => parseArgs(["--runtime", "--keep"]), /--runtime needs a value/);
  assert.throws(() => parseArgs(["--health-timeout-ms", "soon"]), /--health-timeout-ms needs a positive number/);
  assert.throws(() => parseArgs(["--backup-timeout-ms", "0"]), /--backup-timeout-ms needs a positive number/);
  assert.equal(parseArgs(["--health-timeout-ms", "5000"]).healthTimeoutMs, 5000);
});
