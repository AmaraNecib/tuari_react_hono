import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const normalizePath = (value) => path.normalize(path.resolve(value));

export const resolvePnpmExecution = ({
  env = process.env,
  nodeExecPath = process.execPath,
} = {}) => {
  const npmExecPath = env.npm_execpath;

  if (!npmExecPath || !path.isAbsolute(npmExecPath)) {
    throw new Error("Unable to resolve pnpm from npm_execpath. Run this script via pnpm.");
  }

  const normalizedExecPath = normalizePath(npmExecPath);
  const basename = path.basename(normalizedExecPath).toLowerCase();

  if (!basename.includes("pnpm")) {
    throw new Error(`Resolved package manager is not pnpm: ${normalizedExecPath}`);
  }

  if (!existsSync(normalizedExecPath)) {
    throw new Error(`Resolved pnpm executable does not exist: ${normalizedExecPath}`);
  }

  return {
    command: nodeExecPath,
    argsPrefix: [normalizedExecPath],
  };
};

export const runPnpmCommand = (args, options = {}) => {
  const { command, argsPrefix } = resolvePnpmExecution();

  execFileSync(command, [...argsPrefix, ...args], {
    stdio: "inherit",
    ...options,
  });
};

export const resolveTrustedTarPath = ({
  platform = process.platform,
  env = process.env,
  exists = existsSync,
} = {}) => {
  if (platform !== "win32") {
    throw new Error("Portable packaging is only supported on Windows hosts.");
  }

  const windowsRoots = [...new Set([env.SystemRoot, env.windir].filter(Boolean).map(normalizePath))];
  const candidates = windowsRoots.flatMap((root) => [
    path.join(root, "System32", "tar.exe"),
    path.join(root, "Sysnative", "tar.exe"),
  ]);

  for (const candidate of candidates) {
    if (exists(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to locate a trusted Windows tar.exe under System32 or Sysnative.");
};

export const validateReleaseBinEntries = (binDir, expectedEntries = ["api-runtime", "node.exe"]) => {
  const actualEntries = readdirSync(binDir, { withFileTypes: true }).map((entry) => entry.name).sort();
  const expected = [...expectedEntries].sort();
  const unexpected = actualEntries.filter((entry) => !expected.includes(entry));
  const missing = expected.filter((entry) => !actualEntries.includes(entry));

  if (unexpected.length > 0 || missing.length > 0) {
    const details = [
      unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : null,
      missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
    ].filter(Boolean).join("; ");

    throw new Error(`Release bin contents failed validation (${details}).`);
  }
};

export const copyValidatedTree = (sourceDir, destinationDir) => {
  const sourceStats = lstatSync(sourceDir);

  if (sourceStats.isSymbolicLink()) {
    throw new Error(`Refusing to package symbolic link root: ${sourceDir}`);
  }

  if (!sourceStats.isDirectory()) {
    throw new Error(`Expected directory to copy: ${sourceDir}`);
  }

  mkdirSync(destinationDir, { recursive: true });

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing to package symbolic link: ${sourcePath}`);
    }

    if (entry.isDirectory()) {
      copyValidatedTree(sourcePath, destinationPath);
      continue;
    }

    if (entry.isFile()) {
      mkdirSync(path.dirname(destinationPath), { recursive: true });
      copyFileSync(sourcePath, destinationPath);
      continue;
    }

    throw new Error(`Refusing to package unsupported entry type: ${sourcePath}`);
  }
};
