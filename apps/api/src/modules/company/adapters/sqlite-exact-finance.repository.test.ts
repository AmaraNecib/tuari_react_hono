import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../../infrastructure/database/factory";
import { createFifoLock } from "../../../infrastructure/database/fifo-lock";
import { exactDebtSchemaStatements } from "./exact-finance-schema";
import { SqliteExactFinanceRepository } from "./sqlite-exact-finance.repository";
import type { ExactDebtAccount } from "../exact-finance.repository";

function fixture(key: string) {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-524-ledger-")), "fixture.sqlite");
  const db = createDatabaseConnection(path, key);
  db.exec("CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY); INSERT INTO external_counterparty VALUES ('party')");
  for (const sql of exactDebtSchemaStatements) db.exec(sql);
  return { db, path };
}
const account = (balance = "90071992547409.93"): ExactDebtAccount => ({
  id: "account", partyType: "EXTERNAL_COUNTERPARTY", workerId: null, externalCounterpartyId: "party", direction: "PAYABLE", currency: "DZD", currentBalance: balance,
  status: "OPEN", note: null, settledAt: null, actorUserId: null, actorLabel: null, transactionId: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});

describe.each([["plain", ""], ["keyed", "524-public-native-key"]])("exact ledger persistence %s", (_driver, key) => {
  it("round-trips exact existing-ledger amounts and reopens without globally changing integer reads", () => {
    const { db, path } = fixture(key);
    try {
      const repo = new SqliteExactFinanceRepository(db, createFifoLock());
      repo.saveAccount(account());
      expect(repo.getAccount("account")).toEqual(account());
      expect(db.prepare("SELECT count(*) AS count FROM debt_account").get()).toEqual({ count: 1 });
    } finally { db.close(); }
    const reopened = createDatabaseConnection(path, key);
    try { expect(new SqliteExactFinanceRepository(reopened, createFifoLock()).getAccount("account")?.currentBalance).toBe("90071992547409.93"); }
    finally { reopened.close(); }
  });
});
