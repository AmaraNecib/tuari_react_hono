import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
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
import { createConfigFileKeyPersister } from "./database-key-persister";

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

describe("createConfigFileKeyPersister", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tuari-persist-"));
    configPath = join(tempDir, "config.json");
    renameSyncMock.mockClear();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes db_key into the config file preserving existing fields", () => {
    writeFileSync(configPath, JSON.stringify({ db_adapter: "sqlite", db_path: "data/tuari.sqlite" }));

    const persister = createConfigFileKeyPersister(configPath);
    expect(persister.persistKey("new-key-123")).toEqual({ success: true });

    const saved = JSON.parse(readFileSync(configPath, "utf8"));
    expect(saved).toEqual({
      db_adapter: "sqlite",
      db_path: "data/tuari.sqlite",
      db_key: "new-key-123",
    });
  });

  it("creates the config file when it does not exist yet", () => {
    const persister = createConfigFileKeyPersister(configPath);
    expect(persister.persistKey("fresh-key-123")).toEqual({ success: true });

    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({ db_key: "fresh-key-123" });
  });

  it("overwrites a previously persisted db_key", () => {
    writeFileSync(configPath, JSON.stringify({ db_key: "old-key-123" }));

    const persister = createConfigFileKeyPersister(configPath);
    expect(persister.persistKey("newer-key-456")).toEqual({ success: true });

    expect(JSON.parse(readFileSync(configPath, "utf8")).db_key).toBe("newer-key-456");
  });

  it("leaves no tmp file behind after a successful write", () => {
    const persister = createConfigFileKeyPersister(configPath);
    expect(persister.persistKey("new-key-123")).toEqual({ success: true });

    // The temp file was renamed over the target — nothing with a .tmp
    // suffix remains.
    expect(readdirSync(tempDir).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  // File modes are meaningless on Windows — the POSIX permission check only
  // runs where chmod semantics exist.
  it.skipIf(process.platform === "win32")(
    "writes the key-bearing config file with restrictive 0600 permissions",
    () => {
      const persister = createConfigFileKeyPersister(configPath);
      expect(persister.persistKey("new-key-123")).toEqual({ success: true });

      // The temp file is opened with an explicit 0600 mode (mirroring the
      // desktop secret-file writer) and the rename preserves that mode over
      // the target — a permissive umask must never widen the key-bearing
      // file's permissions (Greptile P1).
      expect(statSync(configPath).mode & 0o777).toBe(0o600);
    },
  );

  it("cleans up the tmp file when the atomic rename fails (honest failure, no stale tmp)", () => {
    const persister = createConfigFileKeyPersister(configPath);
    renameSyncMock.mockImplementationOnce(() => {
      throw new Error("rename denied");
    });

    expect(persister.persistKey("new-key-123")).toEqual({
      success: false,
      error: "Failed to persist database encryption key",
    });

    // The tmp file was written but the rename failed — the best-effort
    // cleanup must remove it so no stale `.pid.tmp` is left behind.
    expect(readdirSync(tempDir).some((name) => name.endsWith(".tmp"))).toBe(false);
    expect(renameSyncMock).toHaveBeenCalledTimes(1);
  });

  it("refuses to write a merged config the loader would reject (honest failure, file untouched)", () => {
    // A user-edited config that broke a field's type (pg_port must be a
    // number). Writing db_key into it would produce a config a restart
    // IGNORES — stale-key startup → DB loss. The persister must fail here.
    writeFileSync(configPath, JSON.stringify({ pg_port: "abc" }));

    const persister = createConfigFileKeyPersister(configPath);
    expect(persister.persistKey("new-key-123")).toEqual({
      success: false,
      error: "Failed to persist database encryption key",
    });
    // The original content is untouched.
    expect(readFileSync(configPath, "utf8")).toBe(JSON.stringify({ pg_port: "abc" }));
  });

  it("writes a config the loader accepts (round-trip with loadConfigFile)", () => {
    const persister = createConfigFileKeyPersister(configPath);
    expect(persister.persistKey("new-key-123")).toEqual({ success: true });

    // The loader must be able to read back exactly what the persister wrote
    // (persister output and loader schema stay aligned).
    expect(loadConfigFile({ TUARI_CONFIG_FILE: configPath })).toEqual({ db_key: "new-key-123" });
  });

  it("reports an honest failure (never throws) when the config file is not a JSON object", () => {
    // A bare array is parseable JSON but has no object fields to preserve —
    // overwriting it with the key would silently delete the existing content.
    writeFileSync(configPath, "[]");

    const persister = createConfigFileKeyPersister(configPath);
    expect(persister.persistKey("new-key-123")).toEqual({
      success: false,
      error: "Failed to persist database encryption key",
    });
    // The original content is untouched.
    expect(readFileSync(configPath, "utf8")).toBe("[]");
  });

  it("reports an honest failure (never throws) when the config file is unreadable", () => {
    // Invalid JSON makes the read-modify-write fail without touching the file.
    writeFileSync(configPath, "not-json{");

    const persister = createConfigFileKeyPersister(configPath);
    expect(persister.persistKey("new-key-123")).toEqual({
      success: false,
      error: "Failed to persist database encryption key",
    });
  });

  it("reports an honest failure (never throws) when the write target is invalid", () => {
    // A config path under a missing parent directory makes the write fail.
    const persister = createConfigFileKeyPersister(join(tempDir, "missing", "config.json"));
    expect(persister.persistKey("new-key-123")).toEqual({
      success: false,
      error: "Failed to persist database encryption key",
    });
  });

  it("skips persistence (success) when no config file is configured", () => {
    const persister = createConfigFileKeyPersister(null);
    expect(persister.persistKey("new-key-123")).toEqual({ success: true });
  });
});
