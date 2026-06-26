/**
 * Shared SQLite database type.
 *
 * better-sqlite3 and better-sqlite3-sqlcipher share an identical API but have
 * different TypeScript type definitions.  We re-export the better-sqlite3
 * Database type here so all consumers share a single canonical import.
 */
import Database from "better-sqlite3";

/** SQLite database instance — re-export for convenience. */
export type BetterSqliteDatabase = Database.Database;
