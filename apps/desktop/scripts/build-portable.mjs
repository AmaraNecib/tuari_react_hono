import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyValidatedTree, resolveTrustedTarPath, validateReleaseBinEntries } from "./script-security-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, "..");
const releaseRoot = path.resolve(desktopRoot, "src-tauri", "target", "release");
const bundleRoot = path.resolve(releaseRoot, "bundle");
const portableRoot = path.resolve(bundleRoot, "portable");
const basePortableName = "Tuari-portable";
const portableDir = path.resolve(portableRoot, basePortableName);
const tempPortableDir = path.resolve(portableRoot, ".tmp-Tuari-portable");
const zipPath = path.resolve(portableRoot, `${basePortableName}.zip`);

const appExePath = path.resolve(releaseRoot, "app.exe");
const binDir = path.resolve(releaseRoot, "bin");
if (!existsSync(appExePath)) {
  throw new Error("Missing release app.exe. Run the desktop build first.");
}

if (!existsSync(binDir)) {
  throw new Error("Missing release bin directory. Run the desktop build first.");
}

let finalPortableDir = portableDir;
let finalZipPath = zipPath;

rmSync(tempPortableDir, { recursive: true, force: true });

try {
  rmSync(portableDir, { recursive: true, force: true });
} catch {
  finalPortableDir = path.resolve(portableRoot, `${basePortableName}-new`);
  finalZipPath = path.resolve(portableRoot, `${basePortableName}-new.zip`);
  rmSync(finalPortableDir, { recursive: true, force: true });
}

rmSync(finalZipPath, { force: true });
mkdirSync(tempPortableDir, { recursive: true });

copyFileSync(appExePath, path.resolve(tempPortableDir, "Tuari.exe"));
validateReleaseBinEntries(binDir);
mkdirSync(path.resolve(tempPortableDir, "bin"), { recursive: true });
copyFileSync(path.resolve(binDir, "node.exe"), path.resolve(tempPortableDir, "bin", "node.exe"));
copyValidatedTree(path.resolve(binDir, "api-runtime"), path.resolve(tempPortableDir, "bin", "api-runtime"));

const resourcesDir = path.resolve(releaseRoot, "resources");
if (existsSync(resourcesDir)) {
  copyValidatedTree(resourcesDir, path.resolve(tempPortableDir, "resources"));
}

renameSync(tempPortableDir, finalPortableDir);

const tarExecutable = resolveTrustedTarPath();
const zipResult = spawnSync(
  tarExecutable,
  ["-a", "-c", "-f", finalZipPath, "-C", finalPortableDir, "."],
  {
    stdio: "inherit",
    shell: false,
  },
);

if (zipResult.status !== 0) {
  throw new Error("Failed to create portable zip archive.");
}

console.log(`Portable folder ready at ${finalPortableDir}`);
console.log(`Portable zip ready at ${finalZipPath}`);
