import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SQLITE_HEADER_MAGIC,
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
    };
    write("2026-01-01");
    write("2026-03-02");

    assert.equal(findSnapshotDatabase(dir), path.join(dir, "2026-03-02", "tuari.sqlite"));
  });
});

test("findSnapshotDatabase ignores folders that are not snapshots", () => {
  withTempDir((dir) => {
    mkdirSync(path.join(dir, "not-a-date"), { recursive: true });
    writeFileSync(path.join(dir, "not-a-date", "tuari.sqlite"), Buffer.from("x"));
    mkdirSync(path.join(dir, "2026-03-02"), { recursive: true });
    writeFileSync(path.join(dir, "2026-03-02", "snapshot.json"), "{}");

    assert.equal(findSnapshotDatabase(dir), null);
    assert.equal(findSnapshotDatabase(path.join(dir, "missing")), null);
  });
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
