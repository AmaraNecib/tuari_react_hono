import { describe, expect, it } from "vitest";

import { resolveBackupsRootPath, resolveDatabaseEnv } from "./database-env";

describe("resolveDatabaseEnv", () => {
  it("uses one sqlite file by default", () => {
    const env = resolveDatabaseEnv({});

    expect(env.attachmentsRootPath).toMatch(/data[\\/]attachments[\\/]invoices$/);
    expect(env.databasePath).toMatch(/data[\\/]tuari\.sqlite$/);
    expect(env.databaseUrl).toMatch(/^file:.*data[\\/]tuari\.sqlite$/);
  });

  it("prefers APP_DB_PATH as the runtime database source of truth", () => {
    const env = resolveDatabaseEnv({
      APP_DB_PATH: "./data/custom.sqlite",
      DATABASE_URL: "file:./data/ignored.sqlite",
    });

    expect(env.attachmentsRootPath).toMatch(/data[\\/]attachments[\\/]invoices$/);
    expect(env.databasePath).toBe("./data/custom.sqlite");
    expect(env.databaseUrl).toBe("file:./data/custom.sqlite");
  });

  it("falls back to AUTH_DB_PATH for deprecated legacy single-file setups", () => {
    const env = resolveDatabaseEnv({
      AUTH_DB_PATH: "./data/legacy.sqlite",
    });

    expect(env.attachmentsRootPath).toMatch(/data[\\/]attachments[\\/]invoices$/);
    expect(env.databasePath).toBe("./data/legacy.sqlite");
    expect(env.databaseUrl).toBe("file:./data/legacy.sqlite");
  });

  it("derives the runtime path from DATABASE_URL when only that value is set", () => {
    const env = resolveDatabaseEnv({
      DATABASE_URL: "file:./data/from-url.sqlite",
    });

    expect(env.attachmentsRootPath).toMatch(/data[\\/]attachments[\\/]invoices$/);
    expect(env.databasePath).toBe("./data/from-url.sqlite");
    expect(env.databaseUrl).toBe("file:./data/from-url.sqlite");
  });

  it("prefers APP_ATTACHMENTS_ROOT when explicitly provided", () => {
    const env = resolveDatabaseEnv({
      APP_DB_PATH: "./data/custom.sqlite",
      APP_ATTACHMENTS_ROOT: "./private-files/invoices",
    });

    expect(env.attachmentsRootPath).toMatch(/[\\/]private-files[\\/]invoices$/);
    expect(env.databasePath).toBe("./data/custom.sqlite");
  });

  it("rejects non-sqlite database URLs", () => {
    expect(() =>
      resolveDatabaseEnv({
        DATABASE_URL: "postgres://localhost/tuari",
      }),
    ).toThrow('DATABASE_URL must use a SQLite file: URL');
  });
});

describe("resolveBackupsRootPath", () => {
  it("defaults to a sibling of the database directory, not inside it", () => {
    const backupsRoot = resolveBackupsRootPath({}, "/srv/tuari/projects/default/tuari.sqlite");

    expect(backupsRoot).toMatch(/[\\/]projects[\\/]backups$/);
  });

  it("prefers APP_BACKUPS_ROOT when provided", () => {
    const backupsRoot = resolveBackupsRootPath(
      { APP_BACKUPS_ROOT: "./private/backups" },
      "/srv/tuari/tuari.sqlite",
    );

    expect(backupsRoot).toMatch(/[\\/]private[\\/]backups$/);
  });
});
