import { describe, expect, it } from "vitest";

import { createInMemoryExpenseRepository } from "./adapters/in-memory-expenses.repository";
import { createExactExpensesModule } from "./expenses.exact";
import { ExpenseInvalidAmountError } from "./expenses.types";

const date = "2026-10-03T10:00:00.000Z";

describe("opt-in exact expenses", () => {
  it.each(["0", "-1", "0.001", "1.000", "1e3", "0x10", "NaN", "Infinity", "", " 1", "01", "92233720368547758.08", 1, null])("rejects malformed or illegal input %s without creating or changing a row", async (amount) => {
    const service = createExactExpensesModule(createInMemoryExpenseRepository<string>());
    await service.create({ id: "existing", amount: "0.10", expenseDate: date });
    await expect(service.create({ id: "bad", amount: amount as string, expenseDate: date })).rejects.toBeInstanceOf(ExpenseInvalidAmountError);
    await expect(service.update({ id: "existing", amount: amount as string })).rejects.toBeInstanceOf(ExpenseInvalidAmountError);
    expect(await service.get("bad")).toBeNull();
    expect(await service.get("existing")).toMatchObject({ amount: "0.10", revisions: [] });
  });

  it("keeps wide aggregates and deterministic numeric group order without narrowing persisted values", async () => {
    const service = createExactExpensesModule(createInMemoryExpenseRepository<string>());
    for (const id of ["a", "b"]) await service.create({ id, amount: "92233720368547758.07", expenseDate: date, projectId: "large" });
    await service.create({ id: "c", amount: "9.99", expenseDate: date, projectId: "small" });
    await service.create({ id: "d", amount: "10", expenseDate: date, projectId: "medium" });
    const result = await service.list();
    expect(result.totals.total).toBe("184467440737095536.13");
    expect(result.groupsByProject.map((group) => [group.projectId, group.total])).toEqual([
      ["large", "184467440737095516.14"], ["medium", "10.00"], ["small", "9.99"],
    ]);
    expect(result.items.every((item) => item.currency === "DZD")).toBe(true);
  });

  it("normalizes equivalent inputs, preserves omitted/NULL fields and rolls back correction failure", async () => {
    const repo = createInMemoryExpenseRepository<string>();
    const service = createExactExpensesModule(repo);
    await service.create({ id: "one", amount: "1", expenseDate: date, whatFor: "fuel", sellerId: "missing-soft-reference" });
    await service.update({ id: "one", amount: "1.00" });
    expect((await service.get("one"))?.revisions).toEqual([]);
    await service.update({ id: "one", whatFor: null });
    expect(await service.get("one")).toMatchObject({ whatFor: null, sellerId: "missing-soft-reference", revisions: [{ previousAmount: "1.00", newAmount: "1.00", changedFields: ["whatFor"] }] });
    repo.createRevision = async () => { throw new Error("audit write failed"); };
    await expect(service.update({ id: "one", amount: "1.01" })).rejects.toThrow("audit write failed");
    expect(await service.get("one")).toMatchObject({ amount: "1.00", revisions: [{ newAmount: "1.00" }] });
  });
  it("preserves fractional and neighboring large amounts through corrections, totals and void", async () => {
    const service = createExactExpensesModule(createInMemoryExpenseRepository<string>());
    await service.create({ id: "one", amount: "0.10", expenseDate: date, projectId: "soft-project" });
    await service.create({ id: "two", amount: "0.20", expenseDate: date });
    expect((await service.list()).totals.total).toBe("0.30");
    await service.update({ id: "one", amount: "90071992547409.93", reason: "correction" }, { actorLabel: "A" });
    await service.update({ id: "one", amount: "90071992547409.92" }, { actorLabel: "B" });
    expect((await service.get("one"))?.revisions).toMatchObject([
      { previousAmount: "0.10", newAmount: "90071992547409.93", actorLabel: "A" },
      { previousAmount: "90071992547409.93", newAmount: "90071992547409.92", actorLabel: "B" },
    ]);
    await service.void({ id: "one" });
    const result = await service.list();
    expect(result.items).toHaveLength(2);
    expect(result.totals.total).toBe("0.20");
    expect(result.groupsByProject).toEqual([{ projectId: null, total: "0.20", count: 1 }]);
  });
});
