import { copyFileSync, existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyValidatedTree, runPnpmCommand } from "./script-security-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");
const apiRoot = path.resolve(workspaceRoot, "apps", "api");
const desktopRoot = path.resolve(__dirname, "..");
const binDir = path.resolve(desktopRoot, "src-tauri", "bin");
const runtimeDir = path.resolve(binDir, "api-runtime");
const nodeBinaryOutput = path.resolve(binDir, "node.exe");
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
  try {
    const sqlcipherDir = resolvePackageDir("better-sqlite3-multiple-ciphers");
    const binaryPath = path.join(sqlcipherDir, "build", "Release", "better_sqlite3.node");

    if (existsSync(binaryPath)) {
      console.log("better-sqlite3-multiple-ciphers native binary found.");
      return true;
    }

    // Binary not found — try to build it
    console.log("Building better-sqlite3-multiple-ciphers native binary...");
    runPnpmCommand(["rebuild", "better-sqlite3-multiple-ciphers"], { cwd: apiRoot });

    if (existsSync(binaryPath)) {
      console.log("better-sqlite3-multiple-ciphers built successfully.");
      return true;
    }

    console.warn("Warning: Could not build better-sqlite3-multiple-ciphers. Falling back to better-sqlite3.");
    return false;
  } catch (error) {
    console.warn(`Warning: better-sqlite3-multiple-ciphers not available: ${error.message}`);
    console.warn("Falling back to better-sqlite3 (no encryption support).");
    return false;
  }
};

rmSync(runtimeDir, { recursive: true, force: true });
rmSync(nodeBinaryOutput, { force: true });

console.log("Building bundled API runtime...");
runPnpmCommand(["--filter", "@tuari/api", "build"], {
  cwd: workspaceRoot,
});

ensureBetterSqliteBinary();
const hasSqlcipher = ensureSqlcipherBinary();

copyValidatedTree(apiDistDir, path.resolve(runtimeDir, "dist"));

// Copy the SQLite library: prefer sqlcipher if available, otherwise plain better-sqlite3
if (hasSqlcipher) {
  const sqlcipherDir = resolvePackageDir("better-sqlite3-multiple-ciphers");
  const targetDir = path.resolve(runtimeDir, "node_modules", "better-sqlite3-multiple-ciphers");
  mkdirSync(path.dirname(targetDir), { recursive: true });
  copyValidatedTree(sqlcipherDir, targetDir);
  console.log("Copied better-sqlite3-multiple-ciphers to runtime.");
} else {
  const betterSqlite3PackageJson = copyPackage("better-sqlite3");
  const bindingsPackageJson = copyPackage("bindings", betterSqlite3PackageJson);
  copyPackage("file-uri-to-path", bindingsPackageJson);
  console.log("Copied better-sqlite3 to runtime (no encryption).");
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

console.log(`Local API runtime ready at ${runtimeDir}`);
console.log(`Bundled Node runtime ready at ${nodeBinaryOutput}`);
