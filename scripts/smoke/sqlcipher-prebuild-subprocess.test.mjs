import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertSqlcipherPrebuildInSubprocess } from "./sqlcipher-prebuild-subprocess.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const require = createRequire(path.join(REPO_ROOT, "apps", "api", "package.json"));
const API_NODE_MODULES = path.join(REPO_ROOT, "apps", "api", "node_modules");

const locateSqlcipherPackage = () => {
  try {
    let directory = path.dirname(require.resolve("better-sqlite3-multiple-ciphers"));
    while (directory !== path.dirname(directory)) {
      const manifest = path.join(directory, "package.json");
      if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === "better-sqlite3-multiple-ciphers") {
        return directory;
      }
      directory = path.dirname(directory);
    }
    return null;
  } catch {
    return null;
  }
};

test("native validation exits before the caller deletes its copied prebuild", async (t) => {
  if (process.platform !== "win32") {
    t.skip("Windows native DLL unloading is the behavior under test.");
    return;
  }

  const installedPackage = locateSqlcipherPackage();
  if (!installedPackage) {
    if (process.env.CI) {
      assert.fail("better-sqlite3-multiple-ciphers must be installed for the CI native cleanup regression.");
    }
    t.skip("better-sqlite3-multiple-ciphers is not installed in this checkout.");
    return;
  }

  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "tuari-sqlcipher-lock-"));
  const packageCopy = path.join(fixtureRoot, "node_modules", "better-sqlite3-multiple-ciphers");
  mkdirSync(path.dirname(packageCopy), { recursive: true });
  cpSync(installedPackage, packageCopy, { recursive: true });

  try {
    const previousNodePath = process.env.NODE_PATH;
    process.env.NODE_PATH = [API_NODE_MODULES, previousNodePath].filter(Boolean).join(path.delimiter);
    let validatedPrebuild;
    try {
      validatedPrebuild = assertSqlcipherPrebuildInSubprocess(packageCopy);
    } finally {
      if (previousNodePath === undefined) {
        delete process.env.NODE_PATH;
      } else {
        process.env.NODE_PATH = previousNodePath;
      }
    }
    assert.ok(validatedPrebuild.startsWith(packageCopy), `unexpected prebuild path: ${validatedPrebuild}`);

    // This runs in the original test process, after the validating child exits.
    rmSync(fixtureRoot, { recursive: true, force: false });
    assert.equal(existsSync(fixtureRoot), false);
  } finally {
    if (existsSync(fixtureRoot)) {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }
});

test("subprocess validation rejects a missing shipped prebuild with child diagnostics", () => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "tuari-sqlcipher-missing-"));

  try {
    const packageDir = path.join(fixtureRoot, "package");
    mkdirSync(path.join(packageDir, "lib"), { recursive: true });
    writeFileSync(path.join(packageDir, "package.json"), "{}\n");
    writeFileSync(path.join(packageDir, "lib", "binding.js"), "exports.getPrebuildPath = () => null;\n");

    assert.throws(
      () => assertSqlcipherPrebuildInSubprocess(packageDir),
      /exited with code 1:[\s\S]*Missing encrypted SQLite shipped prebuild[\s\S]*no rebuild or plaintext fallback/
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("subprocess validation propagates invalid native package diagnostics", () => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "tuari-sqlcipher-invalid-"));

  try {
    const packageDir = path.join(fixtureRoot, "package");
    mkdirSync(path.join(packageDir, "lib"), { recursive: true });
    writeFileSync(path.join(packageDir, "package.json"), "{}\n");
    writeFileSync(path.join(packageDir, "lib", "binding.js"), "exports.getPrebuildPath = () => __filename;\n");

    assert.throws(
      () => assertSqlcipherPrebuildInSubprocess(packageDir),
      /Cannot find module|Invalid|Error:.*exit code 1/s,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
