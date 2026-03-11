import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");
const apiRoot = path.resolve(workspaceRoot, "apps", "api");
const desktopRoot = path.resolve(__dirname, "..");
const binDir = path.resolve(desktopRoot, "src-tauri", "bin");
const runtimeDir = path.resolve(binDir, "api-runtime");
const nodeBinaryOutput = path.resolve(binDir, "node.exe");
const apiDistDir = path.resolve(apiRoot, "dist");
const prismaClientDir = realpathSync(path.resolve(apiRoot, "node_modules", "@prisma", "client"));
const generatedPrismaDir = path.resolve(prismaClientDir, "..", "..", ".prisma", "client");

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
  cpSync(sourceDir, targetDir, { recursive: true });

  return path.join(sourceDir, "package.json");
};

const ensureBetterSqliteBinary = () => {
  const betterSqlite3Dir = resolvePackageDir("better-sqlite3");
  const binaryPath = path.join(betterSqlite3Dir, "build", "Release", "better_sqlite3.node");

  if (existsSync(binaryPath)) {
    return;
  }

  const installCommand = process.platform === "win32"
    ? ["cmd.exe", ["/c", "node_modules\\.bin\\prebuild-install.cmd"]]
    : ["./node_modules/.bin/prebuild-install", []];

  execFileSync(installCommand[0], installCommand[1], {
    cwd: betterSqlite3Dir,
    stdio: "inherit",
  });

  if (!existsSync(binaryPath)) {
    throw new Error("better-sqlite3 native binary is missing after prebuild-install.");
  }
};

rmSync(runtimeDir, { recursive: true, force: true });
rmSync(nodeBinaryOutput, { force: true });
mkdirSync(path.resolve(runtimeDir, "node_modules", "@prisma"), { recursive: true });
mkdirSync(path.resolve(runtimeDir, "node_modules", ".prisma"), { recursive: true });

console.log("Generating Prisma client...");
execSync("pnpm --filter @tuari/api prisma:generate", {
  cwd: workspaceRoot,
  stdio: "inherit",
});

console.log("Building bundled API runtime...");
execSync("pnpm --filter @tuari/api build", {
  cwd: workspaceRoot,
  stdio: "inherit",
});

ensureBetterSqliteBinary();

cpSync(apiDistDir, path.resolve(runtimeDir, "dist"), { recursive: true });
cpSync(prismaClientDir, path.resolve(runtimeDir, "node_modules", "@prisma", "client"), {
  recursive: true,
});
cpSync(generatedPrismaDir, path.resolve(runtimeDir, "node_modules", ".prisma", "client"), {
  recursive: true,
});
copyPackage("@prisma/client-runtime-utils", path.join(prismaClientDir, "package.json"));
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

console.log(`Local API runtime ready at ${runtimeDir}`);
console.log(`Bundled Node runtime ready at ${nodeBinaryOutput}`);
