import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSqlcipherPrebuild } from "../../apps/desktop/scripts/script-security-utils.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const assertSqlcipherPrebuildInSubprocess = (packageDir) => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--validate", packageDir], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  if (result.error) {
    throw new Error(`Unable to start SQLCipher prebuild validation subprocess: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const diagnostics = (result.stderr || result.stdout || "(no child diagnostics)").trim();
    throw new Error(`SQLCipher prebuild validation subprocess exited with code ${result.status}:\n${diagnostics}`);
  }

  const binaryPath = result.stdout.trim();
  if (!binaryPath) {
    throw new Error("SQLCipher prebuild validation subprocess succeeded without reporting a prebuild path.");
  }
  return path.resolve(binaryPath);
};

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  if (process.argv.length !== 4 || process.argv[2] !== "--validate") {
    console.error("Usage: node sqlcipher-prebuild-subprocess.mjs --validate <package-directory>");
    process.exitCode = 2;
  } else {
    try {
      console.log(assertSqlcipherPrebuild(process.argv[3]));
    } catch (error) {
      console.error(error?.stack ?? String(error));
      process.exitCode = 1;
    }
  }
}
