/**
 * ExpensesModule against the REAL sqlite adapter.
 *
 * The regular module suite swaps in the in-memory repository; this one wires
 * the production adapter (better-sqlite3 + the full app schema) so the
 * persistence, revision history, void guard and transaction rollback are
 * pinned against real SQL.
 */
import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements } from "../../infrastructure/database/schema-definitions";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import { SqliteExpenseRepository } from "./adapters/sqlite-expenses.repository";
import { createExpensesModule } from "./expenses.module";
import type { ExpenseRepository } from "./expenses.repository";
import type { ExpensesModule } from "./expenses-module.interface";
import { ExpenseAlreadyVoidedError } from "./expenses.types";

const AUDIT = {
  actorUserId: "user-1",
  actorLabel: "أمين",
  transactionId: "11111111-1111-4111-8111-111111111111",
};

function createTestEnv() {
  const rawDb = new Database(":memory:") as unknown as BetterSqliteDatabase;
  rawDb.pragma("foreign_keys = ON");
  for (const statement of schemaStatements) {
    rawDb.exec(statement);
  }
  const lock = createFifoLock();
  const repo = new SqliteExpenseRepository(rawDb, lock);
  const expensesModule = createExpensesModule(repo);
  return { rawDb, repo, expensesModule };
}

describe("ExpensesModule (sqlite adapter)", () => {
  let env: ReturnType<typeof createTestEnv>;
  let expensesModule: ExpensesModule;

  beforeEach(() => {
    env = createTestEnv();
    expensesModule = env.expensesModule;
  });

  it("persists and reads back every optional field", async () => {
    await expensesModule.create(
      {
        id: "e-1",
        amount: 12500,
        expenseDate: "2026-10-03T10:00:00.000Z",
        whatFor: "هاتف للورشة",
        responsibleWorkerId: "worker-1",
        sellerId: "seller-1",
        projectId: "project-1",
        stockItemId: "item-1",
        note: "ملاحظة",
      },
      AUDIT,
    );

    await expect(expensesModule.get("e-1")).resolves.toMatchObject({
      id: "e-1",
      amount: 12500,
      responsibleWorkerId: "worker-1",
      sellerId: "seller-1",
      projectId: "project-1",
      stockItemId: "item-1",
      status: "LIVE",
      actorUserId: "user-1",
      actorLabel: "أمين",
    });
  });

  it("persists the revision history across edits", async () => {
    await expensesModule.create(
      { id: "e-1", amount: 50000, expenseDate: "2026-10-03T10:00:00.000Z" },
      AUDIT,
    );

    await expensesModule.update(
      { id: "e-1", amount: 45000, reason: "تصحيح الفاتورة" },
      { ...AUDIT, actorUserId: "user-2", actorLabel: "سمير" },
    );
    await expensesModule.update(
      { id: "e-1", amount: 46000, reason: "تصحيح آخر" },
      AUDIT,
    );

    const fetched = await expensesModule.get("e-1");
    expect(fetched?.amount).toBe(46000);
    expect(fetched?.revisions).toHaveLength(2);
    expect(fetched?.revisions.map((revision) => revision.newAmount)).toEqual([
      45000, 46000,
    ]);
    expect(fetched?.revisions[0]).toMatchObject({
      previousAmount: 50000,
      reason: "تصحيح الفاتورة",
      actorLabel: "سمير",
    });
  });

  it("voids without deleting and excludes the row from totals", async () => {
    await expensesModule.create(
      { id: "e-1", amount: 12500, expenseDate: "2026-10-03T10:00:00.000Z", projectId: "project-1" },
      AUDIT,
    );
    await expensesModule.create(
      { id: "e-2", amount: 8000, expenseDate: "2026-10-04T10:00:00.000Z" },
      AUDIT,
    );

    const voided = await expensesModule.void({ id: "e-2", reason: "دفع مرتين" }, AUDIT);
    expect(voided).toMatchObject({
      status: "VOIDED",
      voidReason: "دفع مرتين",
      voidedBy: "أمين",
    });
    expect(voided.voidedAt).not.toBeNull();

    const live = await expensesModule.list();
    expect(live.items.map((item) => item.id)).toEqual(["e-1"]);
    expect(live.totals.total).toBe(12500);

    const withVoided = await expensesModule.list({ includeVoided: true });
    expect(withVoided.items).toHaveLength(2);
    expect(withVoided.totals.total).toBe(12500);

    // The row is still physically present.
    const row = env.rawDb.prepare(`SELECT status FROM "expense" WHERE id = ?`).get("e-2");
    expect(row).toMatchObject({ status: "VOIDED" });

    await expect(
      expensesModule.void({ id: "e-2" }, AUDIT),
    ).rejects.toBeInstanceOf(ExpenseAlreadyVoidedError);
  });

  it("rolls the update back when recording the revision fails", async () => {
    const repo = env.repo;
    const failingRepo: ExpenseRepository = {
      create: repo.create.bind(repo),
      findById: repo.findById.bind(repo),
      list: repo.list.bind(repo),
      update: repo.update.bind(repo),
      voidExpense: repo.voidExpense.bind(repo),
      createRevision: async () => {
        throw new Error("revision write failed");
      },
      listRevisionsByExpenseId: repo.listRevisionsByExpenseId.bind(repo),
      runInTransaction: repo.runInTransaction.bind(repo),
    };
    const failingModule = createExpensesModule(failingRepo);

    await failingModule.create(
      { id: "e-1", amount: 50000, expenseDate: "2026-10-03T10:00:00.000Z" },
      AUDIT,
    );

    await expect(
      failingModule.update({ id: "e-1", amount: 45000 }, AUDIT),
    ).rejects.toThrow("revision write failed");

    // The amount write rolled back with the revision write.
    await expect(expensesModule.get("e-1")).resolves.toMatchObject({ amount: 50000 });
  });

  it("computes the same totals and groups as the in-memory adapter", async () => {
    await expensesModule.create(
      { id: "e-1", amount: 12500, expenseDate: "2026-10-03T10:00:00.000Z", projectId: "project-1", responsibleWorkerId: "worker-1" },
      AUDIT,
    );
    await expensesModule.create(
      { id: "e-2", amount: 8000, expenseDate: "2026-10-04T10:00:00.000Z", projectId: "project-1", responsibleWorkerId: "worker-2" },
      AUDIT,
    );
    await expensesModule.create(
      { id: "e-3", amount: 3200, expenseDate: "2026-10-05T10:00:00.000Z", projectId: "project-2" },
      AUDIT,
    );
    await expensesModule.create(
      { id: "e-4", amount: 9500, expenseDate: "2026-10-08T10:00:00.000Z" },
      AUDIT,
    );

    const result = await expensesModule.list();
    expect(result.totals).toEqual({
      total: 33200,
      count: 4,
      taggedToProject: 23700,
      notTaggedToProject: 9500,
      heldByWorkers: 20500,
      workerCount: 2,
    });
    expect(result.groupsByProject).toEqual([
      { projectId: "project-1", total: 20500, count: 2 },
      { projectId: "project-2", total: 3200, count: 1 },
      { projectId: null, total: 9500, count: 1 },
    ]);
  });

  it("never creates or changes stock when it references a stock item", async () => {
    const now = "2026-10-03T10:00:00.000Z";
    env.rawDb
      .prepare(
        `INSERT INTO "inventory_item_definition" (id, name, item_type, unit, description, created_at, updated_at) VALUES (?, ?, 'ASSET', NULL, NULL, ?, ?)`,
      )
      .run("item-1", "خلاطة إسمنت", now, now);
    const before = env.rawDb
      .prepare(`SELECT * FROM "inventory_item_definition" WHERE id = ?`)
      .get("item-1");

    await expensesModule.create(
      { id: "e-1", amount: 15000, expenseDate: now, stockItemId: "item-1" },
      AUDIT,
    );

    const after = env.rawDb
      .prepare(`SELECT * FROM "inventory_item_definition" WHERE id = ?`)
      .get("item-1");
    expect(after).toEqual(before);
    expect(
      env.rawDb.prepare(`SELECT COUNT(*) AS c FROM "inventory_movement"`).get(),
    ).toEqual({ c: 0 });
  });
});
