import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { SqliteExactExpenseRepository } from "./adapters/sqlite-exact-expenses.repository";
import { createExactExpensesModule } from "./expenses.exact";
import { exactExpenseSchemaStatements } from "./expenses.exact-schema";

const date = "2026-10-03T10:00:00.000Z";

describe.each([["plain", ""], ["keyed", "528-isolated-fixture-key"]])("exact expense persistence: %s", (_driver, key) => {
  it("preserves exact values, links and nullable history through reopen; failed audit is atomic", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "tuari-528-")), "expense.sqlite");
    let db = createDatabaseConnection(path, key);
    try {
      db.pragma("foreign_keys = ON");
      for (const sql of exactExpenseSchemaStatements) db.exec(sql);
      let repo = new SqliteExactExpenseRepository(db, createFifoLock());
      let service = createExactExpensesModule(repo);
      await service.create({ id: "one", amount: "90071992547409.93", expenseDate: date, projectId: "soft-project", sellerId: "soft-seller", responsibleWorkerId: "soft-worker", stockItemId: "soft-item" });
      await service.update({ id: "one", amount: "92233720368547758.07" }, { actorLabel: "corrector", transactionId: "audit-transaction" });
      await repo.createRevision({ id: "nullable", expenseId: "one", previousAmount: null, newAmount: "92233720368547758.07", changedFields: [], reason: null, createdAt: "2027-01-01T00:00:00.000Z" });
      db.exec(`CREATE TRIGGER fail_revision BEFORE INSERT ON expense_revision BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END`);
      await expect(service.update({ id: "one", amount: "0.10" })).rejects.toThrow("audit unavailable");
      expect((await service.get("one"))?.amount).toBe("92233720368547758.07");
      expect((await service.get("one"))?.revisions).toHaveLength(2);
      db.close();
      db = createDatabaseConnection(path, key);
      repo = new SqliteExactExpenseRepository(db, createFifoLock());
      service = createExactExpensesModule(repo);
      expect(await service.get("one")).toMatchObject({ amount: "92233720368547758.07", currency: "DZD", sellerId: "soft-seller", projectId: "soft-project", stockItemId: "soft-item", responsibleWorkerId: "soft-worker", revisions: [
        { previousAmount: "90071992547409.93", newAmount: "92233720368547758.07", actorLabel: "corrector", transactionId: "audit-transaction" },
        { previousAmount: null, newAmount: "92233720368547758.07" },
      ] });
      await service.void({ id: "one", reason: "cancel" });
      expect(await service.list()).toMatchObject({ items: [{ status: "VOIDED", amount: "92233720368547758.07" }], totals: { total: "0.00", count: 0 } });
    } finally { db.close(); }
  });
});
