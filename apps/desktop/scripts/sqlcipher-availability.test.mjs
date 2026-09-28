import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  SQLCIPHER_ADDON_RELATIVE_PATH,
  SQLCIPHER_PROBE_SOURCE,
  SQLCIPHER_WINDOWS_DLL_RELATIVE_PATH,
  inspectSqlcipherArtifact,
  probeSqlcipherBinding,
  requiredSqlcipherFiles,
  resolveSqlcipherArtifact,
} from "./sqlcipher-availability.mjs";

/**
 * Coverage boundary: every test here proves the PLUMBING around the SQLCipher
 * binding — the loader path the fork expects, the files its package must carry,
 * and the probe's refusal paths (missing, unloadable, and non-reporting
 * bindings). None of them proves the binding encrypts: a real fork build needs
 * the Windows SDK, and the JavaScript stand-ins below cannot encrypt anything.
 *
 * Real encryption is proven only by the CI job tracked in #410 — build the
 * native fork, write a row through a keyed connection, assert the file does not
 * start with `SQLite format 3`, then reopen it with the key and read the row
 * back. No test in this file substitutes for that job, and none should be
 * described as proving the artifact encrypts.
 */

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

test("probeSqlcipherBinding runs the probe with the bundled Node and returns the version", () => {
  const calls = [];
  const version = probeSqlcipherBinding({
    nodeExecPath: path.join("C:", "bundle", "node.exe"),
    runtimeDir: path.join("C:", "bundle", "api-runtime"),
    execFile: (file, args, options) => {
      calls.push({ file, args, options });
      return "4.5.6 community\n";
    },
  });

  assert.equal(version, "4.5.6 community");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, path.join("C:", "bundle", "node.exe"));
  assert.deepEqual(calls[0].args, ["-e", SQLCIPHER_PROBE_SOURCE]);
  // cwd is how the fork (and its `integer` dependency) resolves from the
  // sidecar's node_modules, so it is part of the contract, not an accident.
  assert.equal(calls[0].options.cwd, path.join("C:", "bundle", "api-runtime"));
  assert.equal(calls[0].options.encoding, "utf8");
  // The probe must exercise the keyed path and ask for the capability, not
  // just load the module.
  assert.match(SQLCIPHER_PROBE_SOURCE, /cipher_version/);
  assert.match(SQLCIPHER_PROBE_SOURCE, /better-sqlite3-sqlcipher/);
  assert.match(SQLCIPHER_PROBE_SOURCE, /pragma\("key = /);
  assert.match(SQLCIPHER_PROBE_SOURCE, /cipher_compatibility = 4/);
});

test("probeSqlcipherBinding surfaces the loader's stderr when the addon cannot load", () => {
  const failure = new Error("Command failed: node -e ...");
  failure.stderr = "Error: The module was compiled against a different Node.js version\n";

  assert.throws(
    () => probeSqlcipherBinding({
      nodeExecPath: "node.exe",
      runtimeDir: "C:/bundle/api-runtime",
      execFile: () => {
        throw failure;
      },
    }),
    /compiled against a different Node\.js version/,
  );
});

test("probeSqlcipherBinding rejects an empty cipher version even on a clean exit", () => {
  assert.throws(
    () => probeSqlcipherBinding({
      nodeExecPath: "node.exe",
      runtimeDir: "C:/bundle/api-runtime",
      execFile: () => "   \n",
    }),
    /reported no cipher_version/,
  );
});

test("a synthetic addon that exists but cannot load fails the real probe", () => {
  // End-to-end refusal path: the file check would accept this artifact, but the
  // bundled Node cannot load it, so the build gate must fail with the loader's
  // error instead of shipping a broken binding (#409).
  const runtimeDir = mkdtempSync(path.join(os.tmpdir(), "tuari-sqlcipher-probe-"));
  try {
    const packageDir = path.join(runtimeDir, "node_modules", "better-sqlite3-sqlcipher");
    const addonPath = path.join(packageDir, "build", "better_sqlite3.node");
    mkdirSync(path.dirname(addonPath), { recursive: true });
    writeFileSync(addonPath, "not a real native addon");
    writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify({ name: "better-sqlite3-sqlcipher", version: "0.0.0", main: "index.js" }),
    );
    writeFileSync(path.join(packageDir, "index.js"), 'require("./build/better_sqlite3.node");');

    assert.throws(
      () => probeSqlcipherBinding({ nodeExecPath: process.execPath, runtimeDir }),
      /could not be loaded/,
    );
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("a synthetic binding that reports a cipher version proves the probe's plumbing, not encryption", () => {
  // Positive control for the spawned-Node path: proves the probe spawns, loads
  // the copied package, reads the version, and returns it. It does NOT prove
  // encryption — the stand-in never writes or encrypts a database. The
  // end-to-end proof (real fork, write with a key, assert the file is not
  // `SQLite format 3`, reopen and read) is the CI job tracked in #410.
  const runtimeDir = mkdtempSync(path.join(os.tmpdir(), "tuari-sqlcipher-probe-"));
  try {
    const packageDir = path.join(runtimeDir, "node_modules", "better-sqlite3-sqlcipher");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify({ name: "better-sqlite3-sqlcipher", version: "0.0.0", main: "index.js" }),
    );
    writeFileSync(
      path.join(packageDir, "index.js"),
      [
        "class FakeDatabase {",
        "  pragma(source) {",
        '    if (source === "cipher_version") return "4.5.6 community";',
        "    return [];",
        "  }",
        "  close() {}",
        "}",
        "module.exports = FakeDatabase;",
      ].join("\n"),
    );

    assert.equal(
      probeSqlcipherBinding({ nodeExecPath: process.execPath, runtimeDir }),
      "4.5.6 community",
    );
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("a synthetic binding whose cipher_version comes back empty fails the real probe", () => {
  // Distinct from the injected-`execFile` test above: this drives the real
  // spawned Node and the probe source's own empty-version check (`process.exit(3)`),
  // so a binding that loads but reports no cipher version is refused.
  const runtimeDir = mkdtempSync(path.join(os.tmpdir(), "tuari-sqlcipher-probe-"));
  try {
    const packageDir = path.join(runtimeDir, "node_modules", "better-sqlite3-sqlcipher");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify({ name: "better-sqlite3-sqlcipher", version: "0.0.0", main: "index.js" }),
    );
    writeFileSync(
      path.join(packageDir, "index.js"),
      [
        "class FakeDatabase {",
        "  pragma(source) {",
        '    if (source === "cipher_version") return "";',
        "    return [];",
        "  }",
        "  close() {}",
        "}",
        "module.exports = FakeDatabase;",
      ].join("\n"),
    );

    assert.throws(
      () => probeSqlcipherBinding({ nodeExecPath: process.execPath, runtimeDir }),
      /PRAGMA cipher_version returned no version/,
    );
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("a waived ephemeral run does not attempt the SQLCipher native build", () => {
  // The #409 finding: `typecheck` runs `--allow-plaintext --ephemeral`, and a
  // missing addon used to trigger `node-gyp rebuild` in the real dependency
  // tree before the waiver took effect. The build callback must never run.
  let buildCalls = 0;
  const logs = [];

  const result = resolveSqlcipherArtifact({
    packageDir: "C:/packages/better-sqlite3-sqlcipher",
    platform: "linux",
    plaintextAllowed: true,
    ephemeral: true,
    exists: () => false,
    buildNative: () => {
      buildCalls += 1;
    },
    log: (message) => logs.push(message),
  });

  assert.equal(buildCalls, 0);
  assert.equal(result.attemptedBuild, false);
  assert.equal(result.availability.available, false);
  assert.match(logs.join("\n"), /skipping the native build/i);
});

test("a waived publishing run still attempts the SQLCipher native build", () => {
  // The waiver is not a blanket "never build": a real artifact is only produced
  // plaintext when the binding genuinely cannot be built.
  let buildCalls = 0;

  const result = resolveSqlcipherArtifact({
    packageDir: "C:/packages/better-sqlite3-sqlcipher",
    platform: "linux",
    plaintextAllowed: true,
    ephemeral: false,
    exists: () => false,
    buildNative: () => {
      buildCalls += 1;
    },
    log: () => {},
  });

  assert.equal(buildCalls, 1);
  assert.equal(result.attemptedBuild, true);
});

test("without the waiver the SQLCipher native build is always attempted", () => {
  let buildCalls = 0;

  resolveSqlcipherArtifact({
    packageDir: "C:/packages/better-sqlite3-sqlcipher",
    platform: "linux",
    plaintextAllowed: false,
    ephemeral: true,
    exists: () => false,
    buildNative: () => {
      buildCalls += 1;
    },
    log: () => {},
  });

  assert.equal(buildCalls, 1);
});

test("an available binding never triggers a native build", () => {
  let buildCalls = 0;

  const result = resolveSqlcipherArtifact({
    packageDir: "C:/packages/better-sqlite3-sqlcipher",
    platform: "linux",
    plaintextAllowed: false,
    ephemeral: false,
    exists: () => true,
    buildNative: () => {
      buildCalls += 1;
    },
    log: () => {},
  });

  assert.equal(buildCalls, 0);
  assert.equal(result.availability.available, true);
  assert.equal(result.attemptedBuild, false);
});

test("a failed native build is reported in detail instead of thrown", () => {
  const result = resolveSqlcipherArtifact({
    packageDir: "C:/packages/better-sqlite3-sqlcipher",
    platform: "linux",
    plaintextAllowed: false,
    ephemeral: false,
    exists: () => false,
    buildNative: () => {
      throw new Error("node-gyp rebuild failed: no C++ toolchain");
    },
    log: () => {},
  });

  assert.equal(result.attemptedBuild, true);
  assert.equal(result.availability.available, false);
  assert.match(result.detail, /node-gyp rebuild failed/);
});
