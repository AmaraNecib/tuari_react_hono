/**
 * Shared test environment for recovery key tests.
 *
 * File-based SQLite per PRD decision (not in-memory), with the full app
 * schema applied and a real SqliteRecoveryKeyPort + RecoveryKeyService
 * wired exactly like production (dependencies.ts).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schemaStatements } from "../../../infrastructure/database/schema-definitions";
import { createFifoLock } from "../../../infrastructure/database/fifo-lock";
import * as schema from "../../../schema";
import { SqliteRecoveryKeyPort } from "../adapters/sqlite-recovery-key.port";
import { RecoveryKeyService } from "../recovery-key.service";

export function createRecoveryKeyTestEnv() {
  const dbDir = mkdtempSync(join(tmpdir(), "recovery-key-test-"));
  const dbPath = join(dbDir, "test.sqlite");
  const rawDb = new Database(dbPath);
  rawDb.pragma("foreign_keys = ON");
  for (const stmt of schemaStatements) {
    rawDb.exec(stmt);
  }
  const db = drizzle(rawDb, { schema });
  const port = new SqliteRecoveryKeyPort(db, rawDb, createFifoLock());
  const service = new RecoveryKeyService(port);

  return {
    service,
    port,
    rawDb,
    dbPath,
    teardown: () => {
      rawDb.close();
      rmSync(dbDir, { recursive: true, force: true });
    },
  };
}
