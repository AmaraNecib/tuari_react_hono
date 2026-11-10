import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { SqliteExactFinanceRepository } from "./adapters/sqlite-exact-finance.repository";
import { schemaStatements } from "../../infrastructure/database/schema-definitions";

describe("exact debt isolation prerequisites", () => {
  it("rejects a marker over REAL legacy columns rather than treat metadata as conversion", () => {
    const db = createDatabaseConnection(":memory:", "");
    try {
      db.exec("CREATE TABLE exact_money_schema(slice TEXT PRIMARY KEY,version INTEGER NOT NULL); INSERT INTO exact_money_schema VALUES ('debt',1)");
      for (const name of ["debt_account", "debt_entry"]) db.exec(schemaStatements.find(sql => sql.startsWith(`CREATE TABLE IF NOT EXISTS "${name}"`))!);
      expect(() => new SqliteExactFinanceRepository(db, createFifoLock())).toThrow(/Invalid exact ledger column/);
      expect(db.prepare("SELECT count(*) AS count FROM debt_account").get()).toEqual({ count: 0 });
    } finally { db.close(); }
  });
  it("keeps opt-in exact composition out of all active production entry points", () => {
    for (const relative of ["../../app/dependencies.ts", "../../rpc/router.ts", "../../modules/company/company.service.ts"]) {
      const path = fileURLToPath(new URL(relative, import.meta.url));
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/exact-finance|debts-exact|ExactFinanceService/);
    }
    const appContract = readFileSync(fileURLToPath(new URL("../../../../../packages/contracts/src/app-contract.ts", import.meta.url)), "utf8");
    expect(appContract).not.toMatch(/exactDebtsContract|debts-exact/);
  });
});
