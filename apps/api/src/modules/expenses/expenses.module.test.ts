import { beforeEach, describe, expect, it } from "vitest";

import { createInMemoryExpenseRepository } from "./adapters/in-memory-expenses.repository";
import { createExpensesModule } from "./expenses.module";
import type { ExpensesModule } from "./expenses-module.interface";
import {
  ExpenseAlreadyVoidedError,
  ExpenseInvalidAmountError,
  ExpenseNotFoundError,
} from "./expenses.types";
import type { CreateExpenseInput } from "./expenses.types";

const AUDIT = {
  actorUserId: "user-1",
  actorLabel: "أمين",
  transactionId: "11111111-1111-4111-8111-111111111111",
};

function makeExpense(overrides: Partial<CreateExpenseInput> = {}): CreateExpenseInput {
  return {
    id: "expense-1",
    amount: 12500,
    expenseDate: "2026-10-03T10:00:00.000Z",
    whatFor: "هاتف للورشة",
    ...overrides,
  };
}

describe("ExpensesModule", () => {
  let expensesModule: ExpensesModule;

  beforeEach(() => {
    expensesModule = createExpensesModule(createInMemoryExpenseRepository());
  });

  describe("create", () => {
    it("creates an expense with every optional field", async () => {
      const created = await expensesModule.create(
        makeExpense({
          responsibleWorkerId: "worker-1",
          sellerId: "seller-1",
          projectId: "project-1",
          stockItemId: "item-1",
          note: "ملاحظة",
        }),
        AUDIT,
      );

      expect(created).toMatchObject({
        id: "expense-1",
        amount: 12500,
        expenseDate: "2026-10-03T10:00:00.000Z",
        whatFor: "هاتف للورشة",
        responsibleWorkerId: "worker-1",
        sellerId: "seller-1",
        projectId: "project-1",
        stockItemId: "item-1",
        note: "ملاحظة",
        status: "LIVE",
        voidedAt: null,
        actorUserId: "user-1",
        actorLabel: "أمين",
        transactionId: AUDIT.transactionId,
      });
    });

    it("creates an expense with no optional fields at all", async () => {
      const created = await expensesModule.create(makeExpense(), AUDIT);

      expect(created.responsibleWorkerId).toBeNull();
      expect(created.sellerId).toBeNull();
      expect(created.projectId).toBeNull();
      expect(created.stockItemId).toBeNull();
      expect(created.whatFor).toBe("هاتف للورشة");
    });

    it("accepts an expense with only the amount and date", async () => {
      const created = await expensesModule.create(
        { id: "e-bare", amount: 100, expenseDate: "2026-10-03T10:00:00.000Z" },
        AUDIT,
      );

      expect(created.whatFor).toBeNull();
      expect(created.note).toBeNull();
      expect(created.projectId).toBeNull();
    });

    it("rejects a non-positive or unbounded amount at the service boundary", async () => {
      await expect(
        expensesModule.create(makeExpense({ amount: 0 }), AUDIT),
      ).rejects.toBeInstanceOf(ExpenseInvalidAmountError);
      await expect(
        expensesModule.create(makeExpense({ amount: -5 }), AUDIT),
      ).rejects.toBeInstanceOf(ExpenseInvalidAmountError);
      await expect(
        expensesModule.create(
          makeExpense({ amount: Number.MAX_SAFE_INTEGER + 1 }),
          AUDIT,
        ),
      ).rejects.toBeInstanceOf(ExpenseInvalidAmountError);
    });
  });

  describe("list totals", () => {
    beforeEach(async () => {
      await expensesModule.create(
        makeExpense({ id: "e-1", amount: 12500, projectId: "project-1", responsibleWorkerId: "worker-1" }),
        AUDIT,
      );
      await expensesModule.create(
        makeExpense({ id: "e-2", amount: 8000, expenseDate: "2026-10-04T10:00:00.000Z", projectId: "project-1", responsibleWorkerId: "worker-2" }),
        AUDIT,
      );
      await expensesModule.create(
        makeExpense({ id: "e-3", amount: 3200, expenseDate: "2026-10-05T10:00:00.000Z", projectId: "project-2" }),
        AUDIT,
      );
      // Untagged and not held by any worker.
      await expensesModule.create(
        makeExpense({ id: "e-4", amount: 9500, expenseDate: "2026-10-08T10:00:00.000Z" }),
        AUDIT,
      );
    });

    it("splits the filtered total into tagged / untagged and held by workers", async () => {
      const result = await expensesModule.list();

      expect(result.totals).toEqual({
        total: 33200,
        count: 4,
        taggedToProject: 23700,
        notTaggedToProject: 9500,
        heldByWorkers: 20500,
        workerCount: 2,
      });
    });

    it("charges the whole amount to the project it is tagged with", async () => {
      const result = await expensesModule.list();

      const projectOne = result.groupsByProject.find(
        (group) => group.projectId === "project-1",
      );
      expect(projectOne).toEqual({ projectId: "project-1", total: 20500, count: 2 });
      expect(result.totals.taggedToProject).toBe(
        result.items
          .filter((item) => item.projectId !== null)
          .reduce((sum, item) => sum + item.amount, 0),
      );
    });

    it("groups by project with the untagged group last", async () => {
      const result = await expensesModule.list();

      expect(result.groupsByProject).toEqual([
        { projectId: "project-1", total: 20500, count: 2 },
        { projectId: "project-2", total: 3200, count: 1 },
        { projectId: null, total: 9500, count: 1 },
      ]);
    });

    it("breaks equal project totals deterministically by project id", async () => {
      const module = createExpensesModule(createInMemoryExpenseRepository());
      await module.create(makeExpense({ id: "eq-1", amount: 5000, projectId: "project-b" }), AUDIT);
      await module.create(makeExpense({ id: "eq-2", amount: 5000, projectId: "project-a" }), AUDIT);

      const result = await module.list();

      expect(result.groupsByProject).toEqual([
        { projectId: "project-a", total: 5000, count: 1 },
        { projectId: "project-b", total: 5000, count: 1 },
      ]);
    });

    it("orders the untagged group last even when it is the oldest row", async () => {
      const module = createExpensesModule(createInMemoryExpenseRepository());
      await module.create(
        makeExpense({ id: "untagged", amount: 100, expenseDate: "2026-09-01T10:00:00.000Z" }),
        AUDIT,
      );
      await module.create(
        makeExpense({
          id: "tagged",
          amount: 200,
          expenseDate: "2026-09-02T10:00:00.000Z",
          projectId: "project-1",
        }),
        AUDIT,
      );

      const result = await module.list();

      expect(result.groupsByProject.map((group) => group.projectId)).toEqual([
        "project-1",
        null,
      ]);
    });

    it("filters by project, worker and date range", async () => {
      const byProject = await expensesModule.list({ projectId: "project-1" });
      expect(byProject.items.map((item) => item.id)).toEqual(["e-2", "e-1"]);
      expect(byProject.totals.total).toBe(20500);

      const byWorker = await expensesModule.list({ responsibleWorkerId: "worker-1" });
      expect(byWorker.items.map((item) => item.id)).toEqual(["e-1"]);

      const byDate = await expensesModule.list({
        fromDate: "2026-10-04T00:00:00.000Z",
        toDate: "2026-10-05T23:59:59.000Z",
      });
      expect(byDate.items.map((item) => item.id)).toEqual(["e-3", "e-2"]);
    });
  });

  describe("get", () => {
    it("returns the expense with its revision history", async () => {
      await expensesModule.create(makeExpense(), AUDIT);
      await expensesModule.update(
        { id: "expense-1", amount: 10000, reason: "تصحيح الفاتورة" },
        AUDIT,
      );

      const fetched = await expensesModule.get("expense-1");
      expect(fetched?.amount).toBe(10000);
      expect(fetched?.revisions).toHaveLength(1);
      expect(fetched?.revisions[0]).toMatchObject({
        previousAmount: 12500,
        newAmount: 10000,
        reason: "تصحيح الفاتورة",
        actorUserId: "user-1",
        actorLabel: "أمين",
        transactionId: AUDIT.transactionId,
      });
    });

    it("returns null for an unknown expense", async () => {
      await expect(expensesModule.get("missing")).resolves.toBeNull();
    });
  });

  describe("update", () => {
    it("records who, when and the optional reason on every value change", async () => {
      await expensesModule.create(makeExpense(), AUDIT);

      const updated = await expensesModule.update(
        { id: "expense-1", amount: 45000, whatFor: "هاتف — فاتورة" },
        { ...AUDIT, actorUserId: "user-2", actorLabel: "سمير" },
      );

      expect(updated.amount).toBe(45000);
      expect(updated.whatFor).toBe("هاتف — فاتورة");
      expect(updated.actorUserId).toBe("user-2");

      const fetched = await expensesModule.get("expense-1");
      expect(fetched?.revisions).toHaveLength(1);
      expect(fetched?.revisions[0]).toMatchObject({
        previousAmount: 12500,
        newAmount: 45000,
        reason: null,
        actorUserId: "user-2",
        actorLabel: "سمير",
      });
    });

    it("records which money-moving fields changed, not only the amount", async () => {
      await expensesModule.create(
        makeExpense({ projectId: "project-1", responsibleWorkerId: "worker-1" }),
        AUDIT,
      );

      await expensesModule.update(
        { id: "expense-1", projectId: "project-2" },
        AUDIT,
      );

      const fetched = await expensesModule.get("expense-1");
      expect(fetched?.revisions).toHaveLength(1);
      const revision = fetched?.revisions[0];
      expect(revision?.changedFields).toEqual(["projectId"]);
      expect(revision?.previousAmount).toBe(12500);
      expect(revision?.newAmount).toBe(12500);
    });

    it("clears an optional field with an explicit null", async () => {
      await expensesModule.create(
        makeExpense({ responsibleWorkerId: "worker-1", projectId: "project-1" }),
        AUDIT,
      );

      const updated = await expensesModule.update(
        { id: "expense-1", responsibleWorkerId: null, projectId: null },
        AUDIT,
      );

      expect(updated.responsibleWorkerId).toBeNull();
      expect(updated.projectId).toBeNull();
    });

    it("leaves omitted fields untouched", async () => {
      await expensesModule.create(
        makeExpense({ projectId: "project-1", note: "قديم" }),
        AUDIT,
      );

      const updated = await expensesModule.update(
        { id: "expense-1", amount: 13000 },
        AUDIT,
      );

      expect(updated.projectId).toBe("project-1");
      expect(updated.note).toBe("قديم");
      expect(updated.whatFor).toBe("هاتف للورشة");
    });

    it("updates every optional field in one edit", async () => {
      await expensesModule.create(makeExpense(), AUDIT);

      const updated = await expensesModule.update(
        {
          id: "expense-1",
          amount: 100,
          expenseDate: "2026-11-01T10:00:00.000Z",
          whatFor: "بيان جديد",
          responsibleWorkerId: "worker-2",
          sellerId: "seller-2",
          projectId: "project-2",
          stockItemId: "item-2",
          note: "ملاحظة جديدة",
        },
        AUDIT,
      );

      expect(updated).toMatchObject({
        amount: 100,
        expenseDate: "2026-11-01T10:00:00.000Z",
        whatFor: "بيان جديد",
        responsibleWorkerId: "worker-2",
        sellerId: "seller-2",
        projectId: "project-2",
        stockItemId: "item-2",
        note: "ملاحظة جديدة",
      });
    });

    it("returns the existing row and records no revision when nothing changes", async () => {
      const created = await expensesModule.create(makeExpense(), AUDIT);

      const updated = await expensesModule.update(
        { id: "expense-1", amount: created.amount },
        AUDIT,
      );

      expect(updated).toEqual(created);
      expect((await expensesModule.get("expense-1"))?.revisions).toHaveLength(0);
    });

    it("rejects an invalid amount and an unknown expense", async () => {
      await expensesModule.create(makeExpense(), AUDIT);

      await expect(
        expensesModule.update({ id: "expense-1", amount: -1 }, AUDIT),
      ).rejects.toBeInstanceOf(ExpenseInvalidAmountError);
      await expect(
        expensesModule.update({ id: "missing", amount: 10 }, AUDIT),
      ).rejects.toBeInstanceOf(ExpenseNotFoundError);
    });

    it("refuses to edit a voided expense", async () => {
      await expensesModule.create(makeExpense(), AUDIT);
      await expensesModule.void({ id: "expense-1" }, AUDIT);

      await expect(
        expensesModule.update({ id: "expense-1", amount: 10 }, AUDIT),
      ).rejects.toBeInstanceOf(ExpenseAlreadyVoidedError);
    });

    it("throws NOT_FOUND when the row disappears before the write", async () => {
      const repo = createInMemoryExpenseRepository();
      const module = createExpensesModule({ ...repo, update: async () => null });
      await module.create(makeExpense(), AUDIT);

      await expect(
        module.update({ id: "expense-1", amount: 10 }, AUDIT),
      ).rejects.toBeInstanceOf(ExpenseNotFoundError);
    });
  });

  describe("void", () => {
    it("keeps the row visible but excludes it from totals", async () => {
      await expensesModule.create(
        makeExpense({ id: "e-1", amount: 12500, projectId: "project-1" }),
        AUDIT,
      );
      await expensesModule.create(makeExpense({ id: "e-2", amount: 8000 }), AUDIT);

      const voided = await expensesModule.void(
        { id: "e-2", reason: "دفع مرتين" },
        AUDIT,
      );

      expect(voided.status).toBe("VOIDED");
      expect(voided.voidReason).toBe("دفع مرتين");
      expect(voided.voidedAt).not.toBeNull();
      expect(voided.voidedBy).toBe("أمين");

      const listed = await expensesModule.list();
      // The voided row stays visible (struck-through) but leaves the totals.
      expect(listed.items.map((item) => item.id)).toEqual(["e-2", "e-1"]);
      expect(listed.items.find((item) => item.id === "e-2")?.status).toBe("VOIDED");
      expect(listed.totals.total).toBe(12500);
      expect(listed.totals.count).toBe(1);
      expect(listed.groupsByProject).toEqual([
        { projectId: "project-1", total: 12500, count: 1 },
      ]);
    });

    it("refuses to void twice and rejects an unknown expense", async () => {
      await expensesModule.create(makeExpense(), AUDIT);
      await expensesModule.void({ id: "expense-1" }, AUDIT);

      await expect(
        expensesModule.void({ id: "expense-1" }, AUDIT),
      ).rejects.toBeInstanceOf(ExpenseAlreadyVoidedError);
      await expect(
        expensesModule.void({ id: "missing" }, AUDIT),
      ).rejects.toBeInstanceOf(ExpenseNotFoundError);
    });

    it("throws NOT_FOUND when the row disappears before the void write", async () => {
      const repo = createInMemoryExpenseRepository();
      const module = createExpensesModule({ ...repo, voidExpense: async () => null });
      await module.create(makeExpense(), AUDIT);

      await expect(
        module.void({ id: "expense-1" }, AUDIT),
      ).rejects.toBeInstanceOf(ExpenseNotFoundError);
    });
  });
});
