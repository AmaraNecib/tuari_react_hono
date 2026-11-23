import { mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateBackupsRootPath } from "./backup.settings";

// Wrap the fs calls the writability probe depends on so each step can be
// forced to fail on demand (a real read-only/rename-denied directory is
// unreliable cross-platform). Every other call delegates to the real
// implementation.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    writeFileSync: vi.fn((...args: Parameters<typeof actual.writeFileSync>) =>
      actual.writeFileSync(...args),
    ),
    renameSync: vi.fn((...args: Parameters<typeof actual.renameSync>) =>
      actual.renameSync(...args),
    ),
    rmSync: vi.fn((...args: Parameters<typeof actual.rmSync>) =>
      actual.rmSync(...args),
    ),
  };
});

const writeFileSyncMock = vi.mocked(writeFileSync);
const renameSyncMock = vi.mocked(renameSync);
const rmSyncMock = vi.mocked(rmSync);

describe("validateBackupsRootPath", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tuari-backup-settings-"));
    writeFileSyncMock.mockClear();
    renameSyncMock.mockClear();
    rmSyncMock.mockClear();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("accepts an existing writable directory and returns it absolute", () => {
    const result = validateBackupsRootPath(tempDir);
    expect(result).toEqual({ success: true, path: resolve(tempDir) });
  });

  it("creates a missing directory", () => {
    const target = join(tempDir, "nested", "backups");
    const result = validateBackupsRootPath(target);

    expect(result.success).toBe(true);
    expect(result.success && result.path).toBe(resolve(target));
  });

  it("rejects an empty path, naming the problem", () => {
    const result = validateBackupsRootPath("   ");
    expect(result).toEqual({
      success: false,
      error: "backup folder path is required",
    });
  });

  it("rejects a file at the path, naming the problem", () => {
    const filePath = join(tempDir, "a-file");
    writeFileSync(filePath, "not a folder");

    const result = validateBackupsRootPath(filePath);

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain("not a folder");
    expect(result.success === false && result.error).toContain(filePath);
  });

  it("rejects a path whose parent cannot be created, naming the problem", () => {
    // A parent that is a FILE cannot contain a directory: mkdir fails.
    const parentFile = join(tempDir, "parent-file");
    writeFileSync(parentFile, "x");

    const result = validateBackupsRootPath(join(parentFile, "backups"));

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain(
      "cannot use this folder",
    );
    // The OS reason is included, not just the prefix.
    expect(
      result.success === false &&
        result.error.slice("cannot use this folder: ".length).length,
    ).toBeGreaterThan(0);
  });

  it("rejects a folder the process cannot write to, naming the problem", () => {
    // A directory that stats as a directory but rejects the write probe must
    // not validate: the owner would be told the choice succeeded and the first
    // real snapshot would fail later. `accessSync(W_OK)` cannot see this on
    // Windows, which is why the validator actually writes.
    writeFileSyncMock.mockImplementationOnce(() => {
      throw new Error("EACCES: permission denied, open 'probe'");
    });

    const result = validateBackupsRootPath(tempDir);

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain(
      "cannot use this folder",
    );
    expect(result.success === false && result.error).toContain("EACCES");
  });

  it("rejects a folder that cannot rename within itself, naming the problem", () => {
    // A folder can allow file creation yet deny renaming, which is how the
    // engine moves a finished staging folder into place. That must fail here,
    // not at the next run.
    renameSyncMock.mockImplementationOnce(() => {
      throw new Error("EPERM: operation not permitted, rename 'probe'");
    });

    const result = validateBackupsRootPath(tempDir);

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain(
      "cannot use this folder",
    );
    expect(result.success === false && result.error).toContain("EPERM");
  });

  it("rejects a folder that cannot delete, naming the problem", () => {
    // Create-denied is caught by the write probe; DELETE-denied is a different
    // ACL. Without this step a save looks successful, leaks a probe directory
    // every time, and the engine's prune/cleanup fails later.
    rmSyncMock.mockImplementationOnce(() => {
      throw new Error("EPERM: operation not permitted, rmdir 'probe'");
    });

    const result = validateBackupsRootPath(tempDir);

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain(
      "cannot use this folder",
    );
    expect(result.success === false && result.error).toContain("EPERM");
  });

  it("leaves no probe behind after a successful validation", () => {
    const result = validateBackupsRootPath(tempDir);

    expect(result.success).toBe(true);
    expect(readdirSync(tempDir)).toEqual([]);
  });

  it("falls back to the thrown value when a failure carries no message", () => {
    writeFileSyncMock.mockImplementationOnce(() => {
      throw new Error("");
    });

    const result = validateBackupsRootPath(tempDir);

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain(
      "cannot use this folder: Error",
    );
  });
});
