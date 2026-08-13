import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createConfigFileKeyPersister } from "./database-key-persister";

describe("createConfigFileKeyPersister", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tuari-persist-"));
    configPath = join(tempDir, "config.json");
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
