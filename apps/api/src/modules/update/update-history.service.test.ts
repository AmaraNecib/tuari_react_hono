/**
 * UpdateHistoryService tests — record, list, get latest update records.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { schemaStatements } from "../../infrastructure/database/schema-definitions";
import { UpdateHistoryService } from "./update-history.service";
import { SqliteUpdateHistoryPort } from "./adapters/sqlite-update-history.port";
import { createFifoLock, FifoLockBusyError } from "../../infrastructure/database/fifo-lock";

function createTestEnv() {
  const dbDir = mkdtempSync(join(tmpdir(), "update-history-test-"));
  const dbPath = join(dbDir, "test.sqlite");
  const rawDb = new Database(dbPath);
  rawDb.pragma("foreign_keys = ON");
  for (const stmt of schemaStatements) {
    rawDb.exec(stmt);
  }
  const service = new UpdateHistoryService(new SqliteUpdateHistoryPort(rawDb));
  return {
    service,
    teardown: () => {
      rawDb.close();
      rmSync(dbDir, { recursive: true, force: true });
    },
  };
}

describe("UpdateHistoryService", () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    env.teardown();
  });

  describe("recordUpdate", () => {
    it("records a successful update", () => {
      const record = env.service.recordUpdate({ version: "1.2.3", success: true });
      expect(record.id).toBeGreaterThan(0);
      expect(record.version).toBe("1.2.3");
      expect(record.success).toBe(true);
      expect(record.errorMessage).toBeNull();
      expect(record.appliedAt).toBeTruthy();
    });

    it("records a failed update with error message", () => {
      const record = env.service.recordUpdate({
        version: "1.2.3",
        success: false,
        errorMessage: "Signature verification failed",
      });
      expect(record.success).toBe(false);
      expect(record.errorMessage).toBe("Signature verification failed");
    });

    it("assigns incrementing IDs", () => {
      const r1 = env.service.recordUpdate({ version: "1.0.0", success: true });
      const r2 = env.service.recordUpdate({ version: "1.1.0", success: true });
      expect(r2.id).toBe(r1.id + 1);
    });
  });

  describe("getHistory", () => {
    it("returns empty list when no updates recorded", () => {
      const history = env.service.getHistory();
      expect(history).toHaveLength(0);
    });

    it("returns records in reverse chronological order", () => {
      env.service.recordUpdate({ version: "1.0.0", success: true });
      env.service.recordUpdate({ version: "1.1.0", success: true });
      env.service.recordUpdate({ version: "1.2.0", success: true });

      const history = env.service.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0]!.version).toBe("1.2.0");
      expect(history[1]!.version).toBe("1.1.0");
      expect(history[2]!.version).toBe("1.0.0");
    });

    it("respects the limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        env.service.recordUpdate({ version: `1.${i}.0`, success: true });
      }

      const limited = env.service.getHistory(3);
      expect(limited).toHaveLength(3);
    });
  });

  describe("getLatestUpdate", () => {
    it("returns null when no updates recorded", () => {
      expect(env.service.getLatestUpdate()).toBeNull();
    });

    it("returns the most recent update", () => {
      env.service.recordUpdate({ version: "1.0.0", success: true });
      env.service.recordUpdate({ version: "1.1.0", success: true });

      const latest = env.service.getLatestUpdate();
      expect(latest).not.toBeNull();
      expect(latest?.version).toBe("1.1.0");
      expect(latest?.success).toBe(true);
    });

    it("returns the only update in a single-record history", () => {
      env.service.recordUpdate({ version: "1.0.0", success: false, errorMessage: "Failed" });

      const latest = env.service.getLatestUpdate();
      expect(latest).not.toBeNull();
      expect(latest?.version).toBe("1.0.0");
      expect(latest?.success).toBe(false);
      expect(latest?.errorMessage).toBe("Failed");
    });
  });
});

describe("SqliteUpdateHistoryPort lock guard (issue #322)", () => {
  let dbDir: string;
  let rawDb: Database.Database;
  let lock: ReturnType<typeof createFifoLock>;
  let port: SqliteUpdateHistoryPort;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "update-history-guard-"));
    const dbPath = join(dbDir, "test.sqlite");
    rawDb = new Database(dbPath);
    rawDb.pragma("foreign_keys = ON");
    for (const stmt of schemaStatements) {
      rawDb.exec(stmt);
    }
    lock = createFifoLock();
    port = new SqliteUpdateHistoryPort(rawDb, lock);
  });

  afterEach(() => {
    rawDb.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("writes normally when the connection lock is free", () => {
    const record = port.recordUpdate({ version: "1.2.3", success: true });
    expect(record.version).toBe("1.2.3");
  });

  it("throws FifoLockBusyError instead of joining a foreign open transaction", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    // A foreign async flow holds the connection across a real await; the
    // plain update-history write must not silently join it (issue #322).
    const holder = lock.run(async () => {
      await gate;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(() => port.recordUpdate({ version: "1.2.3", success: true })).toThrow(
      FifoLockBusyError,
    );

    release();
    await holder;

    // The write succeeds once the connection is free.
    const record = port.recordUpdate({ version: "1.2.4", success: true });
    expect(record.version).toBe("1.2.4");
  });
});
