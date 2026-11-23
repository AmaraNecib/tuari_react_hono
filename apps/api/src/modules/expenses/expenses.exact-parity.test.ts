import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { createInMemoryExpenseRepository } from "./adapters/in-memory-expenses.repository";
import { SqliteExactExpenseRepository } from "./adapters/sqlite-exact-expenses.repository";
import { createExactExpensesModule } from "./expenses.exact";
import { exactExpenseSchemaStatements } from "./expenses.exact-schema";

function fixture(driver: string) {
  if (driver === "memory") return { repo: createInMemoryExpenseRepository<string>(), close() {} };
  const path = join(mkdtempSync(join(tmpdir(), "tuari-528-parity-")), "expense.sqlite");
  const db = createDatabaseConnection(path, driver === "keyed" ? "528-parity-fixture-key" : "");
  for (const sql of exactExpenseSchemaStatements) db.exec(sql);
  return { repo: new SqliteExactExpenseRepository(db, createFifoLock()), close: () => db.close() };
}

describe.each(["memory", "plain", "keyed"])("exact observable parity: %s", driver => {
  it("preserves fractional totals, filter boundaries, ordering and visible voided rows", async () => {
    const { repo, close } = fixture(driver);
    try {
      const service = createExactExpensesModule(repo);
      await service.create({ id: "a", amount: "0.10", projectId: "p", responsibleWorkerId: "w", expenseDate: "2026-09-30T23:00:00.000Z" });
      await service.create({ id: "b", amount: "0.20", expenseDate: "2026-10-03T22:59:59.999Z" });
      await service.create({ id: "c", amount: "92233720368547758.07", projectId: "p", responsibleWorkerId: "w", expenseDate: "2026-10-04T10:00:00.000Z" });
      await service.create({ id: "d", amount: "2.50", projectId: "q", responsibleWorkerId: "x", expenseDate: "2026-09-29T23:00:00.000Z" });
      await service.void({ id: "c", reason: "duplicate" }, { actorUserId: "u", actorLabel: "Operator", transactionId: "txn" });
      expect(await service.list()).toMatchObject({ items: [{ id: "c", status: "VOIDED", voidReason: "duplicate", actorLabel: "Operator", transactionId: "txn" }, { id: "b" }, { id: "a" }, { id: "d" }], totals: { total: "2.80", taggedToProject: "2.60", notTaggedToProject: "0.20", heldByWorkers: "2.60", workerCount: 2, count: 3 } });
      const range = await service.list({ fromDate: "2026-09-30T23:00:00.000Z", toDate: "2026-10-03T22:59:59.999Z" });
      expect(range.items.map(item => item.id)).toEqual(["b", "a"]);
      expect(range.totals).toMatchObject({ total: "0.30", taggedToProject: "0.10", notTaggedToProject: "0.20" });
      expect((await service.list({ projectId: "p", responsibleWorkerId: "w" })).totals.total).toBe("0.10");
    } finally { close(); }
  });
  it("serializes concurrent corrections into a complete old/new audit chain", async () => {
    const { repo, close } = fixture(driver);
    try {
      const service = createExactExpensesModule(repo);
      await service.create({ id: "one", amount: "0.10", expenseDate: "2026-10-01T10:00:00.000Z" });
      await Promise.all([service.update({ id: "one", amount: "0.11" }), service.update({ id: "one", amount: "0.12" })]);
      expect(await service.get("one")).toMatchObject({ amount: "0.12", revisions: [{ previousAmount: "0.10", newAmount: "0.11" }, { previousAmount: "0.11", newAmount: "0.12" }] });
      await Promise.all([service.update({ id: "one", amount: "0.13" }), service.void({ id: "one" })]);
      expect(await service.get("one")).toMatchObject({ status: "VOIDED", amount: "0.13" });
      await expect(service.update({ id: "one", amount: "0.14" })).rejects.toThrow(/voided/i);
    } finally { close(); }
  });
});
