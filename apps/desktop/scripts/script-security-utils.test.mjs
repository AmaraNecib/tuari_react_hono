import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  copyValidatedTree,
  resolvePnpmExecution,
  resolveTrustedTarPath,
  validateReleaseBinEntries,
} from "./script-security-utils.mjs";

test("resolvePnpmExecution uses pnpm from npm_execpath", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "tuari-pnpm-"));
  try {
    const pnpmExecPath = path.join(tempDir, "pnpm.cjs");
    writeFileSync(pnpmExecPath, "module.exports = {};\n");

    const execution = resolvePnpmExecution({
      env: {
        npm_execpath: pnpmExecPath,
      },
      nodeExecPath: "/node.exe",
    });

    assert.equal(execution.command, "/node.exe");
    assert.deepEqual(execution.argsPrefix, [path.resolve(pnpmExecPath)]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("resolvePnpmExecution rejects non-pnpm npm_execpath", () => {
  assert.throws(
    () => resolvePnpmExecution({ env: { npm_execpath: path.resolve("C:/tools/npm-cli.js") } }),
    /not pnpm/,
  );
});

test("resolvePnpmExecution uses executable pnpm paths directly", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "tuari-pnpm-exe-"));

  try {
    const pnpmExecPath = path.join(tempDir, "pnpm.exe");
    writeFileSync(pnpmExecPath, "binary");

    const execution = resolvePnpmExecution({
      env: {
        npm_execpath: pnpmExecPath,
      },
      nodeExecPath: "/node.exe",
      platform: "win32",
    });

    assert.equal(execution.command, path.resolve(pnpmExecPath));
    assert.deepEqual(execution.argsPrefix, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("resolvePnpmExecution wraps pnpm cmd paths with trusted cmd.exe", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "tuari-pnpm-cmd-"));

  try {
    const pnpmExecPath = path.join(tempDir, "pnpm.cmd");
    writeFileSync(pnpmExecPath, "@echo off\r\n");

    const trustedCmdPath = path.join(path.resolve("C:/Windows"), "System32", "cmd.exe");

    const execution = resolvePnpmExecution({
      env: {
        npm_execpath: pnpmExecPath,
        SystemRoot: "C:/Windows",
      },
      nodeExecPath: "/node.exe",
      platform: "win32",
      // Windows-only branch, host-independent: stub the System32 probe so the
      // assertion also runs on the Linux CI runner (the previous version did a
      // real existsSync("C:/Windows/System32/cmd.exe") and threw on Linux).
      exists: (candidate) => candidate === trustedCmdPath,
    });

    assert.equal(execution.command, trustedCmdPath);
    assert.deepEqual(execution.argsPrefix, [
      "/d",
      "/s",
      "/c",
      `"${path.resolve(pnpmExecPath)}"`,
    ]);
    assert.equal(execution.useWindowsCommandString, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("resolveTrustedTarPath prefers trusted Windows locations", () => {
  const tarPath = resolveTrustedTarPath({
    platform: "win32",
    env: {
      SystemRoot: "C:/Windows",
    },
    exists: (candidate) => candidate === path.join(path.resolve("C:/Windows"), "System32", "tar.exe"),
  });

  assert.equal(tarPath, path.join(path.resolve("C:/Windows"), "System32", "tar.exe"));
});

test("validateReleaseBinEntries rejects unexpected release files", async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "tuari-bin-"));

  try {
    mkdirSync(path.join(tempDir, "api-runtime"));
    writeFileSync(path.join(tempDir, "node.exe"), "node");
    writeFileSync(path.join(tempDir, "extra.dll"), "extra");

    assert.throws(() => validateReleaseBinEntries(tempDir), /unexpected: extra\.dll/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("copyValidatedTree copies nested files", async () => {
  const sourceDir = mkdtempSync(path.join(os.tmpdir(), "tuari-copy-src-"));
  const destinationDir = mkdtempSync(path.join(os.tmpdir(), "tuari-copy-dst-"));

  try {
    mkdirSync(path.join(sourceDir, "nested"), { recursive: true });
    writeFileSync(path.join(sourceDir, "nested", "file.txt"), "hello");

    copyValidatedTree(sourceDir, path.join(destinationDir, "copied"));

    const copiedFile = path.join(destinationDir, "copied", "nested", "file.txt");
    assert.equal(readFileSync(copiedFile, "utf8"), "hello");
  } finally {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(destinationDir, { recursive: true, force: true });
  }
});

test("copyValidatedTree rejects file symlinks", async (t) => {
  const sourceDir = mkdtempSync(path.join(os.tmpdir(), "tuari-copy-link-src-"));
  const destinationDir = mkdtempSync(path.join(os.tmpdir(), "tuari-copy-link-dst-"));

  try {
    const targetFile = path.join(sourceDir, "target.txt");
    writeFileSync(targetFile, "hello");

    try {
      symlinkSync(targetFile, path.join(sourceDir, "linked.txt"));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
        t.skip("File symlink creation is not permitted in this environment.");
        return;
      }

      throw error;
    }

    assert.throws(
      () => copyValidatedTree(sourceDir, path.join(destinationDir, "copied")),
      /Refusing to package symbolic link/,
    );
  } finally {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(destinationDir, { recursive: true, force: true });
  }
});

test("copyValidatedTree rejects directory junctions", async () => {
  const sourceDir = mkdtempSync(path.join(os.tmpdir(), "tuari-copy-junction-src-"));
  const destinationDir = mkdtempSync(path.join(os.tmpdir(), "tuari-copy-junction-dst-"));
  const targetDir = mkdtempSync(path.join(os.tmpdir(), "tuari-copy-junction-target-"));

  try {
    writeFileSync(path.join(targetDir, "hello.txt"), "hello");
    symlinkSync(targetDir, path.join(sourceDir, "linked-dir"), "junction");

    assert.throws(
      () => copyValidatedTree(sourceDir, path.join(destinationDir, "copied")),
      /Refusing to package symbolic link/,
    );
  } finally {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(destinationDir, { recursive: true, force: true });
    await rm(targetDir, { recursive: true, force: true });
  }
});
