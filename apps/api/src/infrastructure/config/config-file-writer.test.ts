import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfigFile } from "../../config/loader";
import { updateConfigFile } from "./config-file-writer";

// Wrap renameSync so the atomic-rename step can be forced to fail on demand
// (a real read-only dir is unreliable cross-platform). Every other fs call
// delegates to the real implementation.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync: vi.fn((...args: Parameters<typeof actual.renameSync>) =>
      actual.renameSync(...args),
    ),
  };
});

const renameSyncMock = vi.mocked(renameSync);

describe("updateConfigFile", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tuari-config-writer-"));
    configPath = join(tempDir, "config.json");
    renameSyncMock.mockClear();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("applies the mutation and preserves every other field", () => {
    writeFileSync(
      configPath,
      JSON.stringify({ db_adapter: "sqlite", db_path: "data/tuari.sqlite" }),
    );

    const result = updateConfigFile(configPath, (config) => {
      config.backups_root = "/mnt/usb/backups";
    });

    expect(result).toEqual({ success: true });
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({
      db_adapter: "sqlite",
      db_path: "data/tuari.sqlite",
      backups_root: "/mnt/usb/backups",
    });
  });

  it("creates the file when it does not exist", () => {
    const result = updateConfigFile(configPath, (config) => {
      config.db_key = "new-key-123";
    });

    expect(result).toEqual({ success: true });
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({
      db_key: "new-key-123",
    });
  });

  it("writes a document the loader accepts (round-trip)", () => {
    updateConfigFile(configPath, (config) => {
      config.backups_root = "/mnt/usb/backups";
    });

    expect(loadConfigFile({ TUARI_CONFIG_FILE: configPath })).toEqual({
      backups_root: "/mnt/usb/backups",
    });
  });

  it("refuses a non-object document and leaves it untouched", () => {
    writeFileSync(configPath, "[]");

    const result = updateConfigFile(configPath, (config) => {
      config.backups_root = "/mnt/usb/backups";
    });

    expect(result.success).toBe(false);
    expect(readFileSync(configPath, "utf8")).toBe("[]");
  });

  it("refuses a merged document the loader would reject, leaving the file untouched", () => {
    writeFileSync(configPath, JSON.stringify({ pg_port: "abc" }));

    const result = updateConfigFile(configPath, (config) => {
      config.backups_root = "/mnt/usb/backups";
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain(
      "would be rejected by the loader",
    );
    expect(readFileSync(configPath, "utf8")).toBe(
      JSON.stringify({ pg_port: "abc" }),
    );
  });

  it("reports the failure reason and cleans up the temp file when the rename fails", () => {
    renameSyncMock.mockImplementationOnce(() => {
      throw new Error("rename denied");
    });

    const result = updateConfigFile(configPath, (config) => {
      config.db_key = "new-key-123";
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain("rename denied");
    expect(readdirSync(tempDir).some((name) => name.endsWith(".tmp"))).toBe(
      false,
    );
    expect(renameSyncMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic reason when the failure carries no message", () => {
    renameSyncMock.mockImplementationOnce(() => {
      throw new Error("");
    });

    const result = updateConfigFile(configPath, (config) => {
      config.db_key = "new-key-123";
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toBe(
      "the config file could not be written",
    );
  });

  // File modes are meaningless on Windows — the POSIX permission check only
  // runs where chmod semantics exist.
  it.skipIf(process.platform === "win32")(
    "writes the replacement file with restrictive 0600 permissions",
    () => {
      updateConfigFile(configPath, (config) => {
        config.db_key = "new-key-123";
      });

      expect(statSync(configPath).mode & 0o777).toBe(0o600);
    },
  );
});
