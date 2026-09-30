/**
 * Project cost over the REAL expenses module (issue #414).
 *
 * The acceptance calls out "a project whose only cost is an unassigned-then-
 * assigned expense": an expense recorded without a project, later edited onto
 * one, must appear in that project's cost in full — the read model must follow
 * the current `project_id`, not a creation-time snapshot.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { schemaStatements } from "../../infrastructure/database/schema-definitions";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import { createExpensesModule } from "../expenses/expenses.module";
import { SqliteExpenseRepository } from "../expenses/adapters/sqlite-expenses.repository";
import { createProjectCostRepository } from "./adapters/sqlite-project-cost.repository";
import { ProjectCostService } from "./project-cost.service";

const NOW = "2026-06-01T00:00:00.000Z";

function createTestEnv() {
  const rawDb = new Database(":memory:") as unknown as BetterSqliteDatabase;
  rawDb.pragma("foreign_keys = ON");
  for (const statement of schemaStatements) {
    rawDb.exec(statement);
  }
  rawDb
    .prepare(`INSERT INTO "project" ("id","name","status","created_at","updated_at") VALUES ('p-1','فيلا حيدرة','ACTIVE',?,?)`)
    .run(NOW, NOW);

  const expensesModule = createExpensesModule(new SqliteExpenseRepository(rawDb, createFifoLock()));
  const projectCostService = new ProjectCostService(createProjectCostRepository(rawDb));
  return { rawDb, expensesModule, projectCostService };
}

describe("project cost with a reassigned expense (#414)", () => {
  let env: ReturnType<typeof createTestEnv>;
  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(() => {
    env.rawDb.close();
  });

  it("counts a project's only cost when the expense is assigned after creation", async () => {
    const expense = await env.expensesModule.create({
      id: "e-1",
      amount: 42_500,
      expenseDate: "2026-06-02T00:00:00.000Z",
      whatFor: "هاتف للورشة",
    });

    expect(expense.projectId).toBeNull();
    expect(env.projectCostService.getProjectCost({ projectId: "p-1" }).item.totalDzd).toBe(0);

    const updated = await env.expensesModule.update({
      id: "e-1",
      projectId: "p-1",
      reason: "إسناد لاحق",
    });

    expect(updated.projectId).toBe("p-1");
    const result = env.projectCostService.getProjectCost({ projectId: "p-1" });
    expect(result.item.parts.expensesDzd).toBe(42_500);
    expect(result.item.totalDzd).toBe(42_500);
    expect(result.item.expenses).toHaveLength(1);
  });

  it("drops the cost again when the expense is moved off the project", async () => {
    await env.expensesModule.create({
      id: "e-1",
      amount: 42_500,
      expenseDate: "2026-06-02T00:00:00.000Z",
      projectId: "p-1",
    });

    const movedOff = await env.expensesModule.update({ id: "e-1", projectId: null, reason: "إسناد خاطئ" });

    expect(movedOff.projectId).toBeNull();
    expect(env.projectCostService.getProjectCost({ projectId: "p-1" }).item.totalDzd).toBe(0);
  });

  it("drops a voided expense from the project's cost", async () => {
    await env.expensesModule.create({
      id: "e-1",
      amount: 42_500,
      expenseDate: "2026-06-02T00:00:00.000Z",
      projectId: "p-1",
    });

    expect(env.projectCostService.getProjectCost({ projectId: "p-1" }).item.totalDzd).toBe(42_500);

    await env.expensesModule.void({ id: "e-1", reason: "خطأ" });

    expect(env.projectCostService.getProjectCost({ projectId: "p-1" }).item.totalDzd).toBe(0);
  });
});
