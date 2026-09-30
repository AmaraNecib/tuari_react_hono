import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfigFile } from "../../config/loader";
import { createConfigFileBackupFolderPersister } from "./backup-folder-persister";

describe("createConfigFileBackupFolderPersister", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tuari-backup-persist-"));
    configPath = join(tempDir, "config.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes backups_root preserving existing fields", () => {
    writeFileSync(
      configPath,
      JSON.stringify({ db_adapter: "sqlite", db_path: "data/tuari.sqlite" }),
    );

    const persister = createConfigFileBackupFolderPersister(configPath);
    expect(persister.persistBackupsRoot("/mnt/usb/backups")).toEqual({
      success: true,
      persisted: true,
    });

    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({
      db_adapter: "sqlite",
      db_path: "data/tuari.sqlite",
      backups_root: "/mnt/usb/backups",
    });
  });

  it("creates the config file when it does not exist yet", () => {
    const persister = createConfigFileBackupFolderPersister(configPath);
    expect(persister.persistBackupsRoot("/mnt/usb/backups")).toEqual({
      success: true,
      persisted: true,
    });

    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({
      backups_root: "/mnt/usb/backups",
    });
  });

  it("overwrites a previously persisted backups_root", () => {
    writeFileSync(
      configPath,
      JSON.stringify({ backups_root: "/old/backups" }),
    );

    const persister = createConfigFileBackupFolderPersister(configPath);
    expect(persister.persistBackupsRoot("/new/backups")).toEqual({
      success: true,
      persisted: true,
    });

    expect(JSON.parse(readFileSync(configPath, "utf8")).backups_root).toBe(
      "/new/backups",
    );
  });

  it("reports a session-only success when no config file is configured", () => {
    const persister = createConfigFileBackupFolderPersister(null);
    expect(persister.persistBackupsRoot("/mnt/usb/backups")).toEqual({
      success: true,
      persisted: false,
    });
  });

  it("leaves no tmp file behind after a successful write", () => {
    const persister = createConfigFileBackupFolderPersister(configPath);
    expect(persister.persistBackupsRoot("/mnt/usb/backups").success).toBe(true);

    expect(readdirSync(tempDir).some((name) => name.endsWith(".tmp"))).toBe(
      false,
    );
  });

  it("fails honestly and leaves the file untouched when it is not a JSON object", () => {
    writeFileSync(configPath, "[]");

    const persister = createConfigFileBackupFolderPersister(configPath);
    expect(persister.persistBackupsRoot("/mnt/usb/backups")).toEqual({
      success: false,
      error: "Failed to persist the backup folder",
    });
    expect(readFileSync(configPath, "utf8")).toBe("[]");
  });

  it("writes a config the loader accepts (round-trip with loadConfigFile)", () => {
    const persister = createConfigFileBackupFolderPersister(configPath);
    expect(persister.persistBackupsRoot("/mnt/usb/backups").success).toBe(true);

    expect(loadConfigFile({ TUARI_CONFIG_FILE: configPath })).toEqual({
      backups_root: "/mnt/usb/backups",
    });
  });
});
