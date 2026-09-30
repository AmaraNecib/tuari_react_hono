import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateBackupsRootPath } from "./backup.settings";

describe("validateBackupsRootPath", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tuari-backup-settings-"));
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

  it("rejects a path that cannot be created or accessed, naming the problem", () => {
    // A parent that is a FILE cannot contain a directory: mkdir fails.
    const parentFile = join(tempDir, "parent-file");
    writeFileSync(parentFile, "x");

    const result = validateBackupsRootPath(join(parentFile, "backups"));

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain(
      "cannot use this folder",
    );
  });
});
