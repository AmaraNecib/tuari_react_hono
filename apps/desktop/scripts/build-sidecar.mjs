import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyValidatedTree, runPnpmCommand } from "./script-security-utils.mjs";
import { buildProbeAndPublishRuntime } from "./runtime-staging.mjs";
import { probeSqlcipherBinding, resolveSqlcipherArtifact } from "./sqlcipher-availability.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");
const apiRoot = path.resolve(workspaceRoot, "apps", "api");
const desktopRoot = path.resolve(__dirname, "..");
const desktopPackageJson = path.join(desktopRoot, "package.json");

/**
 * `--ephemeral` builds the whole runtime into a throwaway temp directory and
 * removes it when done. `typecheck` uses it: it needs the build to run (and the
 * gate to be exercised) but must never leave a plaintext runtime in
 * `src-tauri/bin`, where a later direct `tauri build` could package it. Safe
 * because `cargo check` only needs the tracked `bin/api-runtime` + `bin/node.exe`
 * placeholders to exist for tauri-build's resource copy.
 */
const ephemeral = process.argv.includes("--ephemeral");
const destinationBinDir = path.resolve(desktopRoot, "src-tauri", "bin");
// Both modes assemble the runtime in a staging directory first. The
// non-ephemeral staging directory is a sibling of `src-tauri/bin` (same volume,
// so the final rename is atomic) and only becomes `src-tauri/bin` after the
// probe passes; a rejected probe must never destroy a working local runtime
// (#409).
const binDir = ephemeral
  ? mkdtempSync(path.join(os.tmpdir(), "tuari-sidecar-"))
  : mkdtempSync(path.join(desktopRoot, "src-tauri", ".bin-staging-"));
const runtimeDir = path.resolve(binDir, "api-runtime");
const runtimeNodeModules = path.resolve(runtimeDir, "node_modules");
const nodeBinaryOutput = path.resolve(binDir, "node.exe");
const apiDistDir = path.resolve(apiRoot, "dist");

/**
 * A plaintext-only artifact is only ever produced when the operator asks for
 * one explicitly. Release scripts never pass this: shipping an artifact that
 * cannot honour an `encrypted_db` license is the failure #402 exists to stop.
 */
const plaintextAllowed =
  process.argv.includes("--allow-plaintext")
  || process.env.TUARI_ALLOW_PLAINTEXT_DB === "1";

const findPackageRoot = (resolvedPath) => {
  let currentDir = path.dirname(resolvedPath);

  while (currentDir !== path.dirname(currentDir)) {
    if (existsSync(path.join(currentDir, "package.json"))) {
      return realpathSync(currentDir);
    }

    currentDir = path.dirname(currentDir);
  }

  throw new Error(`Unable to find package root for ${resolvedPath}`);
};

const resolvePackageDir = (packageName, fromFile = path.join(apiRoot, "package.json")) =>
  findPackageRoot(createRequire(fromFile).resolve(packageName));

const copyPackage = (packageName, fromFile = path.join(apiRoot, "package.json")) => {
  const sourceDir = resolvePackageDir(packageName, fromFile);
  const targetDir = path.resolve(runtimeNodeModules, packageName);

  mkdirSync(path.dirname(targetDir), { recursive: true });
  copyValidatedTree(sourceDir, targetDir);

  return path.join(sourceDir, "package.json");
};

const ensureBetterSqliteBinary = () => {
  const betterSqlite3Dir = resolvePackageDir("better-sqlite3");
  const binaryPath = path.join(betterSqlite3Dir, "build", "Release", "better_sqlite3.node");

  if (existsSync(binaryPath)) {
    return;
  }

  throw new Error(
    `Missing better-sqlite3 native binary at ${binaryPath}. Reinstall dependencies so the package is built before packaging.`,
  );
};

const buildSqlcipherNative = (sqlcipherDir) => {
  let nodeGypBin;
  try {
    // node-gyp is a devDependency of @tuari/desktop. `pnpm rebuild` does NOT run
    // the fork's implicit node-gyp build (proved: it exits 0 and produces no
    // addon), so the sidecar build must drive node-gyp itself.
    const nodeGypDir = resolvePackageDir("node-gyp", desktopPackageJson);
    nodeGypBin = path.join(nodeGypDir, "bin", "node-gyp.js");
  } catch (error) {
    throw new Error(
      `node-gyp is not installed, so the SQLCipher binding cannot be built (${error.message}). `
      + "Reinstall workspace dependencies before packaging.",
    );
  }

  console.log("Building better-sqlite3-sqlcipher native binding with node-gyp...");
  execFileSync(process.execPath, [nodeGypBin, "rebuild", "--release"], {
    cwd: sqlcipherDir,
    stdio: "inherit",
  });
};

/**
 * Resolve the SQLCipher package and make sure it carries a loadable native
 * binding, building it once if necessary. The native build is skipped for the
 * waived ephemeral path (`typecheck`), which publishes nothing and does not
 * need a toolchain (#409).
 */
const resolveSqlcipher = () => {
  let sqlcipherDir;
  try {
    sqlcipherDir = resolvePackageDir("better-sqlite3-sqlcipher");
  } catch (error) {
    return { sqlcipherDir: null, availability: { available: false, binaryPath: null, missing: [] }, detail: error.message };
  }

  return {
    sqlcipherDir,
    ...resolveSqlcipherArtifact({
      packageDir: sqlcipherDir,
      plaintextAllowed,
      ephemeral,
      buildNative: () => buildSqlcipherNative(sqlcipherDir),
    }),
  };
};

// Gate BEFORE touching bin/: a failed gate must leave any previous artifact
// intact rather than deleting it and then aborting.
const sqlcipher = resolveSqlcipher();

/**
 * The one banner every plaintext-only path prints, so a waived build states
 * plainly what the artifact cannot do however the waiver was reached.
 */
const printPlaintextOnlyWarning = (detail) => {
  console.error(
    [
      "",
      "================================================================",
      "WARNING: building a PLAINTEXT-ONLY desktop artifact.",
      `Reason: ${detail}`,
      "The runtime cannot encrypt a database.",
      "An encrypted_db license will be refused at runtime instead of",
      "being served by a plaintext database. Never ship this artifact.",
      "================================================================",
      "",
    ].join("\n"),
  );
};

// The gate runs inside the build callback, before the staging tree is
// published, so a refused gate leaves the previous artifact untouched.
const enforceSqlcipherGate = () => {
  if (sqlcipher.availability.available) return;

  const detail = sqlcipher.detail
    ?? (sqlcipher.availability.missing.length > 0
      ? `missing ${sqlcipher.availability.missing.join(", ")}`
      : "unknown reason");

  if (!plaintextAllowed) {
    throw new Error(
      "SQLCipher is required to build the desktop artifact, but its native binding is not available "
      + `(${detail}). Without it an encrypted_db license would silently get a plaintext database (#402). `
      + "Fix the native build (node-gyp + a C++ toolchain, or approve better-sqlite3-sqlcipher's build), "
      + "or produce a knowingly plaintext-only artifact with --allow-plaintext / TUARI_ALLOW_PLAINTEXT_DB=1.",
    );
  }

  printPlaintextOnlyWarning(detail);
};

const buildRuntime = () => {
  console.log("Building bundled API runtime...");
  runPnpmCommand(["--filter", "@tuari/api", "build"], {
    cwd: workspaceRoot,
  });

  ensureBetterSqliteBinary();

  copyValidatedTree(apiDistDir, path.resolve(runtimeDir, "dist"));

  // Plain better-sqlite3 is ALWAYS copied: the API bundle statically imports it
  // for the unencrypted (no-key) path, so the sidecar cannot load without it even
  // when SQLCipher is present.
  const betterSqlite3PackageJson = copyPackage("better-sqlite3");
  const bindingsPackageJson = copyPackage("bindings", betterSqlite3PackageJson);
  copyPackage("file-uri-to-path", bindingsPackageJson);
  console.log("Copied better-sqlite3 to runtime.");

  if (sqlcipher.availability.available) {
    copyValidatedTree(sqlcipher.sqlcipherDir, path.resolve(runtimeNodeModules, "better-sqlite3-sqlcipher"));
    // The fork's lib/index.js re-exports `require('integer')`. Under pnpm's
    // isolated layout that dependency is not nested inside the package, so it
    // has to be copied explicitly or the sidecar cannot require the binding.
    copyPackage("integer", path.join(sqlcipher.sqlcipherDir, "package.json"));
    console.log("Copied better-sqlite3-sqlcipher + integer to runtime.");
  }

  writeFileSync(
    path.resolve(runtimeDir, "package.json"),
    JSON.stringify(
      {
        name: "tuari-api-runtime",
        private: true,
      },
      null,
      2,
    ),
  );

  copyFileSync(process.execPath, nodeBinaryOutput);
};

/**
 * Prove the staged runtime loads its copied SQLCipher addon with the Node
 * executable that ships beside it, before anything replaces the previous
 * runtime. The existence check only proves the addon is there; an addon built
 * against another Node ABI must fail here instead of on a customer machine
 * (#409). This is the strongest gate available without a native build
 * toolchain: it proves the binding loads and reports a cipher version, not that
 * a keyed write encrypts the file (that is the #410 CI job).
 *
 * With `--allow-plaintext` the refusal downgrades to the same loud warning the
 * missing-addon gate prints. The waiver exists to produce a knowingly
 * plaintext-only artifact, so it must cover an addon that is present but cannot
 * load as well as one that is absent; otherwise it looks supported and then
 * blocks the very builds it exists for.
 */
const probeStagedRuntime = () => {
  if (!sqlcipher.availability.available) return;

  let cipherVersion;
  try {
    cipherVersion = probeSqlcipherBinding({
      nodeExecPath: nodeBinaryOutput,
      runtimeDir,
    });
  } catch (error) {
    if (!plaintextAllowed) throw error;

    printPlaintextOnlyWarning(
      "the SQLCipher binding is present but the bundled Node cannot load it "
      + `(${error instanceof Error ? error.message : String(error)})`,
    );
    return;
  }

  console.log(
    `Verified the bundled Node runtime loads the SQLCipher binding (cipher_version ${cipherVersion}).`,
  );
};

try {
  buildProbeAndPublishRuntime({
    stagingDir: binDir,
    destinationDir: destinationBinDir,
    publish: !ephemeral,
    build: () => {
      enforceSqlcipherGate();
      buildRuntime();
    },
    probe: probeStagedRuntime,
  });

  if (!ephemeral) {
    console.log(`Local API runtime ready at ${path.resolve(destinationBinDir, "api-runtime")}`);
    console.log(`Bundled Node runtime ready at ${path.resolve(destinationBinDir, "node.exe")}`);
  }
} finally {
  if (ephemeral) {
    console.log("Removed the ephemeral sidecar build; nothing was left in src-tauri/bin.");
  }
}
