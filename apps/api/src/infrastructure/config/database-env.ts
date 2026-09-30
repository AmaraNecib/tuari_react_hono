import { dirname, resolve } from "node:path";

const defaultDbPath = resolve(process.cwd(), "data", "tuari.sqlite");

const resolveAttachmentsRootPath = (source: NodeJS.ProcessEnv, databasePath: string) => {
  if (source.APP_ATTACHMENTS_ROOT?.trim()) {
    return resolve(source.APP_ATTACHMENTS_ROOT.trim());
  }

  return resolve(dirname(databasePath), "attachments", "invoices");
};

/**
 * Resolve the root that holds the daily backup folders (#430).
 *
 * Defaults to a sibling of the database's directory (`../backups`), NOT a
 * directory inside it: the data dir is the thing an operator resets when they
 * want to start over, and that reset must not delete the backups. When
 * `APP_BACKUPS_ROOT` is set it wins. On the desktop the shell does not forward
 * this variable; instead the backup-folder setting (#436) writes `backups_root`
 * into the config file the sidecar reads, which resolves here as well.
 */
export const resolveBackupsRootPath = (
  source: NodeJS.ProcessEnv,
  databasePath: string,
) => {
  if (source.APP_BACKUPS_ROOT?.trim()) {
    return resolve(source.APP_BACKUPS_ROOT.trim());
  }

  return resolve(dirname(databasePath), "..", "backups");
};

const toSqliteUrl = (filePath: string) => {
  const normalized = filePath.replace(/\\/g, "/");

  return `file:${normalized}`;
};

const fromSqliteUrl = (value: string) => {
  if (!value.startsWith("file:")) {
    throw new Error(
      `DATABASE_URL must use a SQLite file: URL, received "${value}"`,
    );
  }

  return value.slice("file:".length);
};

export const resolveDatabaseEnv = (source: NodeJS.ProcessEnv = process.env) => {
  const databasePath =
    source.APP_DB_PATH ??
    source.AUTH_DB_PATH ??
    (source.DATABASE_URL ? fromSqliteUrl(source.DATABASE_URL) : defaultDbPath);
  const attachmentsRootPath = resolveAttachmentsRootPath(source, databasePath);

  return {
    attachmentsRootPath,
    databasePath,
    databaseUrl: toSqliteUrl(databasePath),
  } as const;
};
