import { copyFileSync, existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSqlcipherPrebuild, copyValidatedTree, runPnpmCommand } from "./script-security-utils.mjs";
import { buildProbeAndPublishRuntime } from "./runtime-staging.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");
const apiRoot = path.resolve(workspaceRoot, "apps", "api");
const desktopRoot = path.resolve(__dirname, "..");
const binDir = path.resolve(desktopRoot, "src-tauri", "bin");
const stagingDir = path.resolve(desktopRoot, "src-tauri", `.bin-staging-${process.pid}-${Date.now()}`);
const runtimeDir = path.resolve(stagingDir, "api-runtime");
const nodeBinaryOutput = path.resolve(stagingDir, "node.exe");
const apiDistDir = path.resolve(apiRoot, "dist");

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
  const targetDir = path.resolve(runtimeDir, "node_modules", packageName);

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

const ensureSqlcipherBinary = () => {
  const sqlcipherDir = resolvePackageDir("better-sqlite3-multiple-ciphers");
  const binaryPath = assertSqlcipherPrebuild(sqlcipherDir);
  console.log(`Encrypted SQLite prebuild loaded: ${binaryPath}`);
};

buildProbeAndPublishRuntime({
  stagingDir,
  destinationDir: binDir,
  build: () => {
    mkdirSync(runtimeDir, { recursive: true });
    console.log("Building bundled API runtime in an isolated staging tree...");
    runPnpmCommand(["--filter", "@tuari/api", "build"], {
      cwd: workspaceRoot,
    });

    ensureBetterSqliteBinary();
    ensureSqlcipherBinary();
    copyValidatedTree(apiDistDir, path.resolve(runtimeDir, "dist"));

    // The factory uses the plain driver without a key and the encrypted driver with one.
    copyPackage("better-sqlite3-multiple-ciphers");
    const betterSqlite3PackageJson = copyPackage("better-sqlite3");
    const bindingsPackageJson = copyPackage("bindings", betterSqlite3PackageJson);
    copyPackage("file-uri-to-path", bindingsPackageJson);

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
  },
  probe: () => {
    // Verify the staged package before acquiring the publication lock. The
    // helper holds the lock across recovery, swap, rollback and cleanup.
    assertSqlcipherPrebuild(path.join(runtimeDir, "node_modules", "better-sqlite3-multiple-ciphers"));
  },
});

console.log(`Local API runtime ready at ${path.resolve(binDir, "api-runtime")}`);
console.log(`Bundled Node runtime ready at ${path.resolve(binDir, "node.exe")}`);
