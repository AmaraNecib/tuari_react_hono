import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createAppConfig } from "../../config";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { ensureDatabaseSchema } from "../../infrastructure/database/schema";
import { schemaStatements } from "../../infrastructure/database/schema-definitions";
import { BetterSqlite3Executor } from "../../infrastructure/database/sqlite-executor";
import type { BetterAuthInstance } from "../../infrastructure/auth/auth";

const TEST_AUTH_SECRET = "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM";
const fakeAuth = {
  handler: () => new Response(null, { status: 200 }),
  $context: Promise.resolve({ password: { hash: async (password: string) => `hashed:${password}` } }),
} as unknown as BetterAuthInstance;
const roots: string[] = [];
const openRoots: Array<{ close: () => void }> = [];

afterEach(() => {
  for (const root of openRoots.splice(0)) root.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("approved employee earnings through the normal composition root", { timeout: 60_000 }, () => {
  it("rejects an unmarked malformed earning table before root composition or marker write", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tuari-543-malformed-root-"));
    roots.push(directory);
    const databasePath = join(directory, "workforce.sqlite");
    const raw = createDatabaseConnection(databasePath, "");
    await ensureDatabaseSchema(new BetterSqlite3Executor(raw));
    const earningDdl = schemaStatements.find(statement => statement.includes('CREATE TABLE IF NOT EXISTS "employee_earning" ('));
    if (!earningDdl) throw new Error("Current employee_earning DDL is missing");
    const malformedDdl = earningDdl.replace('"total_minor" INTEGER', '"total_minor" TEXT');
    if (malformedDdl === earningDdl) throw new Error("Could not alter the current earning money-column declaration");
    raw.pragma("foreign_keys = OFF");
    raw.exec("DROP TABLE exact_money_schema; DROP TABLE employee_earning");
    raw.exec(malformedDdl);
    raw.pragma("foreign_keys = ON");
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'exact_money_schema'").get()).toBeUndefined();
    expect((raw.pragma("table_info(employee_earning)") as { name: string; type: string }[]).find(column => column.name === "total_minor")?.type).toBe("TEXT");
    raw.close();

    const config = createAppConfig({ BETTER_AUTH_SECRET: TEST_AUTH_SECRET, DB_ADAPTER: "sqlite" });
    const { createAppDependencies } = await import("../../app/dependencies");
    let startupError: unknown;
    try {
      const unexpectedlyOpenedRoot = await createAppDependencies({ databasePath, authInstance: fakeAuth }, config);
      unexpectedlyOpenedRoot.close();
    } catch (error) {
      startupError = error;
    }
    expect(startupError).toBeInstanceOf(Error);
    expect((startupError as Error | undefined)?.message).toMatch(/coordinated.*activation/i);

    const after = createDatabaseConnection(databasePath, "");
    try {
      expect(after.prepare("SELECT name FROM sqlite_master WHERE name = 'exact_money_schema'").get()).toBeUndefined();
      const columns = after.pragma("table_info(employee_earning)") as { name: string; type: string }[];
      expect(columns.find(column => column.name === "total_minor")?.type).toBe("TEXT");
    } finally { after.close(); }
  });

  it("persists ordered A/B/A amounts and returns one approval after close and reopen", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tuari-543-earnings-"));
    roots.push(directory);
    const databasePath = join(directory, "workforce.sqlite");
    const config = createAppConfig({ BETTER_AUTH_SECRET: TEST_AUTH_SECRET, DB_ADAPTER: "sqlite" });
    const { createAppDependencies } = await import("../../app/dependencies");

    const first = await createAppDependencies({ databasePath, authInstance: fakeAuth }, config);
    openRoots.push(first);
    const owner = await first.authBootstrapService.bootstrapFirstUser({
      name: "First owner",
      phone: "0612345678",
      password: "password123",
    });
    if (!owner.success) throw new Error("Could not establish the test workspace owner");
    const audit = { actorUserId: owner.item.id, actorLabel: "First owner", transactionId: "6f7ab38e-5a1f-4a1b-a036-a8d3a376c7ad" };
    const roleId = first.workforceService.listRoles().items.find((role) => role.key === "worker")!.id;
    const employee = first.workforceService.createEmployee({
      firstName: "Amina",
      lastName: "Test",
      phone: "0555123987",
      roleId,
      status: "ACTIVE",
      salaryReference: null,
    }, audit).item.id;
    const projectA = first.companyService.createProject({ name: "Project A", status: "ACTIVE" }, audit).item.id;
    const projectB = first.companyService.createProject({ name: "Project B", status: "ACTIVE" }, audit).item.id;
    const approval = {
      employeeId: employee,
      requestId: "d0f2fd98-5ca5-49ae-9074-b139df26614d",
      periodStart: "2026-04-01T00:00:00.000Z",
      periodEnd: "2026-04-26T00:00:00.000Z",
      currencyCode: "DZD" as const,
      totalAmount: "62500.00",
      unallocatedAmount: "0.00",
      referenceSalary: { period: "DAILY" as const, amount: "1250.1250" },
      segments: [
        { id: "segment-a1", projectId: projectA, days: 5, amount: "10000.00" },
        { id: "segment-b", projectId: projectB, days: 15, amount: "37500.00" },
        { id: "segment-a2", projectId: projectA, days: 5, amount: "15000.00" },
      ],
    };

    const saved = first.workforceService.approveEmployeeEarning(approval, audit);
    expect(saved.success).toBe(true);
    expect(saved.item.segments.map((segment) => [segment.id, segment.days, segment.amount])).toEqual([
      ["segment-a1", 5, "10000.00"],
      ["segment-b", 15, "37500.00"],
      ["segment-a2", 5, "15000.00"],
    ]);
    const savedId = saved.item.id;
    expect(saved.item.referenceSalary).toEqual({ period: "DAILY", amount: "1250.1250" });
    const costA = first.projectCostService.getProjectCost({ projectId: projectA }).item;
    const costB = first.projectCostService.getProjectCost({ projectId: projectB }).item;
    expect(costA.parts.salariesAmount).toBe("25000.00");
    expect(costA.salaries.map(segment => [segment.segmentId, segment.days, segment.amount])).toEqual([
      ["segment-a1", 5, "10000.00"], ["segment-a2", 5, "15000.00"],
    ]);
    expect(costB.parts.salariesAmount).toBe("37500.00");
    expect(costB.salaries.map(segment => [segment.segmentId, segment.days, segment.amount])).toEqual([["segment-b", 15, "37500.00"]]);
    first.close();
    openRoots.splice(openRoots.indexOf(first), 1);

    const reopened = await createAppDependencies({ databasePath, authInstance: fakeAuth }, config);
    openRoots.push(reopened);
    const repeated = reopened.workforceService.approveEmployeeEarning(approval, audit);
    expect(repeated.success).toBe(true);
    expect(repeated.item.id).toBe(savedId);
    expect(repeated.item.referenceSalary).toEqual({ period: "DAILY", amount: "1250.1250" });
    expect(reopened.workforceService.listEmployeeEarnings(employee).items).toHaveLength(1);

    const daysOnlyConflict = {
      ...approval,
      segments: approval.segments.map((segment, index) => ({
        ...segment,
        days: index === 0 ? 6 : segment.days,
      })),
    };
    expect(() => reopened.workforceService.approveEmployeeEarning(daysOnlyConflict, audit)).toThrow();
    const afterDaysConflict = reopened.workforceService.listEmployeeEarnings(employee).items;
    expect(afterDaysConflict).toHaveLength(1);
    expect(afterDaysConflict[0]!.segments.map(segment => segment.days)).toEqual([5, 15, 5]);

    const conflict = {
      ...approval,
      totalAmount: "63000.00",
      segments: [
        { id: "segment-a1", projectId: projectA, days: 5, amount: "10000.00" },
        { id: "segment-b", projectId: projectB, days: 15, amount: "37500.00" },
        { id: "segment-a2", projectId: projectA, days: 5, amount: "15500.00" },
      ],
    };
    expect(() => reopened.workforceService.approveEmployeeEarning(conflict, audit)).toThrow();
    expect(reopened.workforceService.listEmployeeEarnings(employee).items).toHaveLength(1);

    const beyondSafeInteger = {
      ...approval,
      requestId: "62eea23e-41f4-4c9f-97ee-876f696a1168",
      totalAmount: "90071992547409.93",
      unallocatedAmount: "90071992547409.93",
      segments: [],
    };
    const exactLargeAmount = reopened.workforceService.approveEmployeeEarning(beyondSafeInteger, audit);
    expect(exactLargeAmount.item.totalAmount).toBe("90071992547409.93");

    const invalidReference = {
      ...approval,
      requestId: "c250c8a7-6289-46c0-a878-fb52f70ec74a",
      segments: [{ id: "new-segment", projectId: "missing-project", days: 25, amount: "62500.00" }],
    };
    expect(() => reopened.workforceService.approveEmployeeEarning(invalidReference, audit)).toThrow();
    expect(reopened.workforceService.listEmployeeEarnings(employee).items).toHaveLength(2);

    const failedWrite = {
      ...approval,
      requestId: "a9e96750-dcc4-4d6d-9c99-26529aa6a95d",
    };
    expect(() => reopened.workforceService.approveEmployeeEarning(failedWrite, audit)).toThrow();
    expect(reopened.workforceService.listEmployeeEarnings(employee).items).toHaveLength(2);
  });
});
