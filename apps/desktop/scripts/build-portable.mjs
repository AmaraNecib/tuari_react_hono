import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

cpSync(appExePath, path.resolve(tempPortableDir, "Tuari.exe"));
cpSync(binDir, path.resolve(tempPortableDir, "bin"), { recursive: true });

const resourcesDir = path.resolve(releaseRoot, "resources");
if (existsSync(resourcesDir)) {
  cpSync(resourcesDir, path.resolve(tempPortableDir, "resources"), { recursive: true });
}

renameSync(tempPortableDir, finalPortableDir);

// `tar.exe` is available on Windows and creates a zip when used with `-a`.
const { spawnSync } = await import("node:child_process");
const zipResult = spawnSync(
  "tar.exe",
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
