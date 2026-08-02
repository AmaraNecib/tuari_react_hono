import { dirname, resolve } from "node:path";

const defaultDbPath = resolve(process.cwd(), "data", "tuari.sqlite");

const resolveAttachmentsRootPath = (source: NodeJS.ProcessEnv, databasePath: string) => {
  if (source.APP_ATTACHMENTS_ROOT?.trim()) {
    return resolve(source.APP_ATTACHMENTS_ROOT.trim());
  }

  return resolve(dirname(databasePath), "attachments", "invoices");
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
