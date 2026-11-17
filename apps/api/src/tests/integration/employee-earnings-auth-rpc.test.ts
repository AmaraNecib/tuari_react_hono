import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vitest";

import { createAppConfig } from "../../config";
import { createAppDependencies } from "../../app/dependencies";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createRpcContext } from "../../rpc/context";
import { createRouter } from "../../rpc/router";

const AUTH_SECRET = "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM";
const DATABASE_KEY = "543-exact-earnings-encrypted-reopen-key";
const directories: string[] = [];
const openRoots: Array<{ close: () => void }> = [];

afterEach(() => {
  for (const root of openRoots.splice(0)) root.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("approved earning RPC with real auth and encrypted persistence", { timeout: 60_000 }, () => {
  it("authenticates, validates, rolls back, and reads exact values after encrypted reopen", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tuari-543-auth-rpc-"));
    directories.push(directory);
    const databasePath = join(directory, "workforce.sqlite");
    const config = createAppConfig({ BETTER_AUTH_SECRET: AUTH_SECRET, DB_ADAPTER: "sqlite" });
    const first = await createAppDependencies({ databasePath, databaseKey: DATABASE_KEY }, config);
    openRoots.push(first);

    const bootstrap = await first.authBootstrapService.bootstrapFirstUser({
      name: "RPC owner",
      phone: "0612345678",
      password: "password123",
    });
    if (!bootstrap.success) throw new Error("Could not create the test owner");

    const authContext = await first.auth.$context;
    const internalAdapter = authContext.internalAdapter as unknown as {
      createSession: (userId: string) => Promise<{ token: string }>;
    };
    const createdSession = await internalAdapter.createSession(bootstrap.item.id);
    const headers = new Headers({ authorization: `Bearer ${createdSession.token}` });
    expect(await first.sessionService.getCurrentUser(headers)).toMatchObject({ id: bootstrap.item.id });

    const router = createRouter(first as never);
    const client = createRouterClient(router, {
      context: createRpcContext(headers, first.sessionService) as never,
    }) as any;
    const anonymousClient = createRouterClient(router, {
      context: createRpcContext(new Headers(), first.sessionService) as never,
    }) as any;
    await expect(anonymousClient.employeeEarningsList()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const workerRoleId = first.workforceService.listRoles().items.find((role) => role.key === "worker")!.id;
    await expect(client.employeesCreate({
      firstName: "Legacy",
      lastName: "Numeric",
      phone: "0555123986",
      roleId: workerRoleId,
      salaryAmountDzd: 1500,
      salaryPeriod: "DAILY",
    })).rejects.toThrow();
    const employee = await client.employeesCreate({
      firstName: "Amina",
      lastName: "Exact",
      phone: "0555123987",
      roleId: workerRoleId,
      salaryReference: { period: "DAILY", amount: "1500.1250" },
    });
    expect(employee.success).toBe(true);
    const employeeId = employee.item.id;
    const updated = await client.employeesUpdate({
      id: employeeId,
      salaryReference: { period: "MONTHLY", amount: "90071992547409.93" },
    });
    expect(updated.success).toBe(true);

    const projectAResult = await client.projectsCreate({ name: "A", status: "ACTIVE" });
    const projectBResult = await client.projectsCreate({ name: "B", status: "ACTIVE" });
    expect(projectAResult.success).toBe(true);
    expect(projectBResult.success).toBe(true);
    const projectA = projectAResult.item.id;
    const projectB = projectBResult.item.id;
    const approval = {
      employeeId,
      requestId: "d0f2fd98-5ca5-49ae-9074-b139df26614d",
      periodStart: "2026-04-01T00:00:00.000Z",
      periodEnd: "2026-04-26T00:00:00.000Z",
      currencyCode: "DZD" as const,
      totalAmount: "62500.00",
      unallocatedAmount: "0.00",
      segments: [
        { id: "segment-a1", projectId: projectA, days: 5, amount: "10000.00" },
        { id: "segment-b", projectId: projectB, days: 15, amount: "37500.00" },
        { id: "segment-a2", projectId: projectA, days: 5, amount: "15000.00" },
      ],
    };
    const approved = await client.employeeEarningsApprove(approval);
    expect(approved.success).toBe(true);
    expect(approved.item.segments.map((segment: { id: string; days: number; amount: string }) => [segment.id, segment.days, segment.amount])).toEqual([
      ["segment-a1", 5, "10000.00"],
      ["segment-b", 15, "37500.00"],
      ["segment-a2", 5, "15000.00"],
    ]);

    const rejected = await client.employeeEarningsApprove({
      ...approval,
      requestId: "a9e96750-dcc4-4d6d-9c99-26529aa6a95d",
      segments: [{ id: "bad-segment", projectId: "missing-project", days: 25, amount: "62500.00" }],
    });
    expect(rejected.success).toBe(false);
    const triggerDb = createDatabaseConnection(databasePath, DATABASE_KEY);
    try {
      triggerDb.exec(`CREATE TRIGGER fail_earning_segment BEFORE INSERT ON employee_earning_segment
        WHEN NEW.id = 'rollback-segment' BEGIN SELECT RAISE(ABORT, 'forced rollback'); END`);
    } finally {
      triggerDb.close();
    }
    await expect(client.employeeEarningsApprove({
      ...approval,
      requestId: "f2932878-525c-49ac-97ad-1197fd6eccf8",
      segments: [{ id: "rollback-segment", projectId: projectA, days: 25, amount: "62500.00" }],
    })).rejects.toThrow();
    expect((await client.employeeEarningsList({ employeeId })).items).toHaveLength(1);
    await expect(client.salaryPaymentsCreate({ employeeId, days: 1, actualAmountDzd: 1 })).resolves.toMatchObject({
      success: false,
      error: { code: "BUSINESS_RULE" },
    });

    first.close();
    openRoots.splice(openRoots.indexOf(first), 1);

    const physical = createDatabaseConnection(databasePath, DATABASE_KEY);
    try {
      physical.exec("DROP TRIGGER fail_earning_segment");
      const persistedEmployee = physical.prepare(`SELECT salary_reference_period, salary_reference_amount FROM employee WHERE id = ?`).get(employeeId) as {
        salary_reference_period: string;
        salary_reference_amount: string;
      };
      expect(persistedEmployee).toEqual({
        salary_reference_period: "MONTHLY",
        salary_reference_amount: "90071992547409.93",
      });
      const persistedDays = physical.prepare(`SELECT days FROM employee_earning_segment ORDER BY ordinal`).all() as Array<{ days: number }>;
      expect(persistedDays.map((row) => row.days)).toEqual([5, 15, 5]);
    } finally {
      physical.close();
    }

    const reopened = await createAppDependencies({ databasePath, databaseKey: DATABASE_KEY }, config);
    openRoots.push(reopened);
    const reopenedRouter = createRouter(reopened as never);
    const reopenedClient = createRouterClient(reopenedRouter, {
      context: createRpcContext(headers, reopened.sessionService) as never,
    }) as any;
    expect((await reopenedClient.employeesGet({ id: employeeId })).item.salaryReference).toEqual({
      period: "MONTHLY",
      amount: "90071992547409.93",
    });
    expect((await reopenedClient.employeeStateHistoryList({ employeeId })).items.map((row: { salaryReference: unknown }) => row.salaryReference)).toEqual(expect.arrayContaining([
      { period: "DAILY", amount: "1500.1250" },
      { period: "MONTHLY", amount: "90071992547409.93" },
    ]));
    expect((await reopenedClient.employeeEarningsList({ employeeId })).items[0].segments.map((segment: { days: number }) => segment.days)).toEqual([5, 15, 5]);
  });
});
