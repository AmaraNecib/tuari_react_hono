import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  SQLCIPHER_ADDON_RELATIVE_PATH,
  SQLCIPHER_WINDOWS_DLL_RELATIVE_PATH,
  inspectSqlcipherArtifact,
  requiredSqlcipherFiles,
} from "./sqlcipher-availability.mjs";

/** Create a temp package dir, run `populate(dir)`, then inspect it. */
const withTempPackage = (populate, platform = process.platform) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tuari-sqlcipher-"));
  try {
    populate(dir);
    return inspectSqlcipherArtifact({ packageDir: dir, platform });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const write = (dir, relativePath) => {
  const target = path.join(dir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, "");
};

test("the addon is looked up at the fork's loader path, not build/Release", () => {
  // The regression that caused #402: a correctly built fork copies the addon to
  // build/better_sqlite3.node, so build/Release must NOT satisfy the check.
  assert.equal(SQLCIPHER_ADDON_RELATIVE_PATH, path.join("build", "better_sqlite3.node"));

  const result = withTempPackage(
    (dir) => write(dir, path.join("build", "Release", "better_sqlite3.node")),
    "linux",
  );

  assert.equal(result.available, false);
  assert.deepEqual(result.missing, [SQLCIPHER_ADDON_RELATIVE_PATH]);
});

test("a build/better_sqlite3.node addon is accepted on non-Windows", () => {
  const result = withTempPackage((dir) => write(dir, SQLCIPHER_ADDON_RELATIVE_PATH), "linux");

  assert.equal(result.available, true);
  assert.deepEqual(result.missing, []);
});

test("Windows also requires the libeay32.dll the addon links against", () => {
  assert.deepEqual(requiredSqlcipherFiles("win32"), [
    SQLCIPHER_ADDON_RELATIVE_PATH,
    SQLCIPHER_WINDOWS_DLL_RELATIVE_PATH,
  ]);

  const addonOnly = withTempPackage(
    (dir) => write(dir, SQLCIPHER_ADDON_RELATIVE_PATH),
    "win32",
  );
  assert.equal(addonOnly.available, false);
  assert.deepEqual(addonOnly.missing, [SQLCIPHER_WINDOWS_DLL_RELATIVE_PATH]);

  const complete = withTempPackage((dir) => {
    write(dir, SQLCIPHER_ADDON_RELATIVE_PATH);
    write(dir, SQLCIPHER_WINDOWS_DLL_RELATIVE_PATH);
  }, "win32");
  assert.equal(complete.available, true);
});

test("the non-Windows platform does not require the Windows DLL", () => {
  assert.deepEqual(requiredSqlcipherFiles("darwin"), [SQLCIPHER_ADDON_RELATIVE_PATH]);
});

test("a missing package directory reports every required file as missing", () => {
  const result = inspectSqlcipherArtifact({
    packageDir: path.join(os.tmpdir(), `tuari-sqlcipher-absent-${process.pid}`),
    platform: "win32",
  });

  assert.equal(result.available, false);
  assert.deepEqual(result.missing, [
    SQLCIPHER_ADDON_RELATIVE_PATH,
    SQLCIPHER_WINDOWS_DLL_RELATIVE_PATH,
  ]);
});
