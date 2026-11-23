import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock, FifoLockBusyError } from "../../infrastructure/database/fifo-lock";
import { BetterSqlite3Executor } from "../../infrastructure/database/sqlite-executor";
import { ensureDatabaseSchema } from "../../infrastructure/database/schema";
import { exactDebtSchemaStatements } from "./adapters/exact-finance-schema";
import { SqliteExactFinanceRepository } from "./adapters/sqlite-exact-finance.repository";
import { ExactFinanceService } from "./exact-finance.service";

const partyId = "00000000-0000-4000-8000-000000000999";
const party = { partyType: "EXTERNAL_COUNTERPARTY" as const, externalCounterpartyId: partyId, direction: "PAYABLE" as const };
const dependencies = { id: randomUUID, now: () => "2026-11-10T10:00:00.000Z" };
function fixture(key: string) {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-524-race-")), "ledger.sqlite");
  const db = createDatabaseConnection(path, key);
  db.pragma("foreign_keys=ON");
  db.exec(`CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY); INSERT INTO external_counterparty VALUES ('${partyId}')`);
  for (const sql of exactDebtSchemaStatements) db.exec(sql);
  return { db, path };
}
describe.each(["", "524-concurrency-public-key"])("exact native transaction boundaries key=%s", key => {
  it("holds an immediate reservation before command/ledger reads and revalidates a competing payment after release", () => {
    const { db, path } = fixture(key);
    const second = createDatabaseConnection(path, key);
    second.pragma("busy_timeout=1");
    try {
      const repo = new SqliteExactFinanceRepository(db, createFifoLock());
      const service = new ExactFinanceService(repo, dependencies);
      const other = new ExactFinanceService(new SqliteExactFinanceRepository(second, createFifoLock()), dependencies);
      const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "0.30" });
      const opening = service.listEntries(account.id)[0]!;
      const read = repo.getCommand.bind(repo);
      let attempted = false;
      repo.getCommand = id => {
        if (id === "winner") {
          attempted = true;
          expect(() => other.recordPayment({ requestId: "contender", debtEntryId: opening.id, amountDzd: "0.20" })).toThrow(/locked|busy/i);
        }
        return read(id);
      };
      service.recordPayment({ requestId: "winner", debtEntryId: opening.id, amountDzd: "0.20" });
      expect(attempted).toBe(true);
      expect(() => other.recordPayment({ requestId: "contender", debtEntryId: opening.id, amountDzd: "0.20" })).toThrow(/remaining/);
      other.recordPayment({ requestId: "contender", debtEntryId: opening.id, amountDzd: "0.10" });
      expect(service.getAccount(account.id).currentBalance).toBe("0.00");
      expect(service.listEntries(account.id)).toHaveLength(3);
    } finally { second.close(); db.close(); }
  });
  it("rejects unrelated shared-connection operations while another flow owns its transaction", async () => {
    const { db } = fixture(key);
    const lock = createFifoLock();
    const repo = new SqliteExactFinanceRepository(db, lock);
    const service = new ExactFinanceService(repo, dependencies);
    const account = service.createAccount({ ...party, requestId: "account", openingBalanceDzd: "1.00" });
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const holder = lock.run(async () => {
      db.exec("BEGIN IMMEDIATE");
      entered();
      try { await gate; } finally { db.exec("ROLLBACK"); }
    });
    try {
      await started;
      expect(() => service.createAccount({ ...party, requestId: "foreign" })).toThrow(FifoLockBusyError);
      expect(() => service.detail(account.id)).toThrow(FifoLockBusyError);
    } finally { release(); await holder; db.close(); }
  });
  it("blocks numeric startup before any legacy initializer mutation on the converted fixture", async () => {
    const { db } = fixture(key);
    try {
      const before = db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all();
      await expect(ensureDatabaseSchema(new BetterSqlite3Executor(db))).rejects.toThrow(/coordinated.*activation/i);
      expect(db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all()).toEqual(before);
    } finally { db.close(); }
  });
});
