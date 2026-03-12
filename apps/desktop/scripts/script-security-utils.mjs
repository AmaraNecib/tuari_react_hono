import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const normalizePath = (value) => path.normalize(path.resolve(value));

const isNodeScriptExtension = (extension) => [".js", ".cjs", ".mjs"].includes(extension);
const isDirectExecutableExtension = (extension) => ["", ".exe", ".com"].includes(extension);
const isWindowsShellScriptExtension = (extension) => [".cmd", ".bat"].includes(extension);

const resolveTrustedWindowsBinaryPath = ({
  binaryName,
  env = process.env,
  exists = existsSync,
}) => {
  const windowsRoots = [...new Set([env.SystemRoot, env.windir].filter(Boolean).map(normalizePath))];
  const candidates = windowsRoots.flatMap((root) => [
    path.join(root, "System32", binaryName),
    path.join(root, "Sysnative", binaryName),
  ]);

  for (const candidate of candidates) {
    if (exists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to locate trusted ${binaryName} under System32 or Sysnative.`);
};

const quoteForWindowsCommandProcessor = (value) => {
  const escaped = value.replace(/([()%!^"<>&|])/g, "^$1");
  return `"${escaped}"`;
};

export const resolvePnpmExecution = ({
  env = process.env,
  nodeExecPath = process.execPath,
  platform = process.platform,
} = {}) => {
  const npmExecPath = env.npm_execpath;

  if (!npmExecPath || !path.isAbsolute(npmExecPath)) {
    throw new Error("Unable to resolve pnpm from npm_execpath. Run this script via pnpm.");
  }

  const normalizedExecPath = normalizePath(npmExecPath);
  const basename = path.basename(normalizedExecPath).toLowerCase();
  const extension = path.extname(basename);

  if (!basename.includes("pnpm")) {
    throw new Error(`Resolved package manager is not pnpm: ${normalizedExecPath}`);
  }

  if (!existsSync(normalizedExecPath)) {
    throw new Error(`Resolved pnpm executable does not exist: ${normalizedExecPath}`);
  }

  if (isNodeScriptExtension(extension)) {
    return {
      command: nodeExecPath,
      argsPrefix: [normalizedExecPath],
    };
  }

  if (isDirectExecutableExtension(extension)) {
    return {
      command: normalizedExecPath,
      argsPrefix: [],
    };
  }

  if (platform === "win32" && isWindowsShellScriptExtension(extension)) {
    return {
      command: resolveTrustedWindowsBinaryPath({ binaryName: "cmd.exe", env }),
      argsPrefix: ["/d", "/s", "/c", quoteForWindowsCommandProcessor(normalizedExecPath)],
      useWindowsCommandString: true,
    };
  }

  throw new Error(`Unsupported pnpm executable type: ${normalizedExecPath}`);
};

export const runPnpmCommand = (args, options = {}) => {
  const { command, argsPrefix, useWindowsCommandString } = resolvePnpmExecution();

  const commandArgs = useWindowsCommandString
    ? [
      ...argsPrefix,
      ...args.map((arg) => quoteForWindowsCommandProcessor(arg)),
    ]
    : [...argsPrefix, ...args];

  execFileSync(command, commandArgs, {
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

  return resolveTrustedWindowsBinaryPath({
    binaryName: "tar.exe",
    env,
    exists,
  });
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
