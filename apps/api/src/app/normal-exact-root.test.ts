import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAppConfig } from "../config";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createWorkerSnapshotter } from "../modules/backup/backup.snapshot";
import { createApp } from "./create-app";
import { createAppDependencies } from "./dependencies";

const approval = {
  requestId: "normal-root-543-approval",
  employeeId: "employee-will-be-replaced",
  currency: "DZD" as const,
  months: [{ id: "october", month: "2026-10", amount: "62500", unallocatedAmount: "0", segments: [
    { id: "a-first", projectId: "project-a-will-be-replaced", amount: "10000", days: 5 },
    { id: "b-middle", projectId: "project-b-will-be-replaced", amount: "37500", days: 15 },
    { id: "a-last", projectId: "project-a-will-be-replaced", amount: "15000", days: 5 },
  ] }],
};

async function rpcCall<T>(app: ReturnType<typeof createApp>, path: string, input?: unknown, token?: string): Promise<T> {
  const headers = new Headers({ "content-type": "application/json", Origin: "http://localhost" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await app.fetch(new Request(`http://localhost/rpc/${path}`, {
    method: "POST", headers, body: JSON.stringify(input === undefined ? {} : { json: input }),
  }));
  const body = await response.json() as { json?: T; message?: string; code?: string };
  if (!response.ok) throw Object.assign(new Error(body.message ?? `RPC ${path} failed: ${response.status}`), { status: response.status, code: body.code });
  return body.json as T;
}

const config = createAppConfig({
  BETTER_AUTH_SECRET: "normal-root-secret-0123456789-abcdef-0123456789",
  BETTER_AUTH_URL: "http://localhost:4318",
  DB_ADAPTER: "sqlite",
  ALLOWED_ORIGINS: "http://localhost",
});

describe.each([["plain", ""], ["keyed", "543-normal-root-fixture-key"]])("normal exact app root (%s database)", (_kind, key) => {
  it("starts the authenticated root, preserves exact identities and earnings through reopen", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tuari-543-normal-root-"));
    const databasePath = join(directory, "workspace.sqlite");
    let deps = await createAppDependencies({ databasePath, databaseKey: key }, config);
    try {
      expect(deps.mode).toBe("slice543");
      if (deps.mode !== "slice543") throw new Error("Normal startup did not select slice 543");
      expect(deps.exactWorkforceService.financeService).toBe(deps.exactFinanceService);
      const owner = await deps.authBootstrapService.bootstrapFirstUser({
        name: "Payroll operator", phone: "0612345001", password: "normal-root-password",
      });
      expect(owner.success).toBe(true);
      if (!owner.success) throw new Error("Unable to create the test workspace owner");
      const signIn = await deps.auth.api.signInPhoneNumber({
        body: { phoneNumber: "0612345001", password: "normal-root-password" },
        headers: new Headers(),
      });
      const app = createApp(deps, { allowedOrigins: ["http://localhost"] });

      await expect(rpcCall(app, "slice543Capabilities")).rejects.toMatchObject({ status: 401 });
      const caps = await rpcCall<Record<string, string>>(app, "slice543Capabilities", undefined, signIn.token);
      expect(caps).toMatchObject({ employees: "exact", approvedEarnings: "available", cashPayments: "unavailable", fullProjectCost: "unavailable" });
      expect(caps.workspaceId).toMatch(/^[0-9a-f-]{36}$/i);
      await expect(rpcCall(app, "getRecoveryKeyPool")).rejects.toMatchObject({ status: 401 });
      expect(await rpcCall(app, "getRecoveryKeyPool", undefined, signIn.token)).toMatchObject({ availableCount: 0, totalCount: 0, maxPoolSize: expect.any(Number), maskedKeys: [] });
      const generatedKeys = await rpcCall<{ keys: { key: string; prefix: string }[] }>(app, "generateRecoveryKeys", undefined, signIn.token);
      expect(generatedKeys.keys).toHaveLength(3);
      expect(generatedKeys.keys.every(row => row.key.startsWith(row.prefix))).toBe(true);
      expect(await rpcCall(app, "getRecoveryKeyPool", undefined, signIn.token)).toMatchObject({ availableCount: 3, totalCount: 3 });
      const inventoryPath = "http://localhost/api/inventory/attachments/unavailable-in-exact-mode";
      expect((await app.fetch(new Request(inventoryPath, { headers: { Origin: "http://localhost" } }))).status).toBe(401);
      expect((await app.fetch(new Request(inventoryPath, { headers: { Origin: "http://localhost", Authorization: `Bearer ${signIn.token}` } }))).status).toBe(503);
      const projectsA = await rpcCall<{ success: boolean; item?: { id: string } }>(app, "projectsCreate", { name: "Project A" }, signIn.token);
      const projectsB = await rpcCall<{ success: boolean; item?: { id: string } }>(app, "projectsCreate", { name: "Project B" }, signIn.token);
      expect(projectsA.success).toBe(true);
      expect(projectsB.success).toBe(true);
      if (!projectsA.success || !projectsA.item || !projectsB.success || !projectsB.item) throw new Error("Nonfinancial project creation failed");
      const roles = await rpcCall<{ items: { id: string; key: string }[] }>(app, "rolesList", undefined, signIn.token);
      const manager = await rpcCall<{ success: boolean; item?: { id: string; roleId: string } }>(app, "employeesCreate", {
        firstName: "Project", lastName: "Manager", phone: "0555000002", roleId: roles.items.find(role => role.key === "project_manager")!.id,
      }, signIn.token);
      expect(manager.success).toBe(true);
      if (!manager.success || !manager.item) throw new Error("Exact project manager creation failed");
      const managedProject = await rpcCall<{ success: boolean }>(app, "projectsUpdate", { id: projectsA.item.id, managerId: manager.item.id }, signIn.token);
      expect(managedProject.success).toBe(true);
      const employee = await rpcCall<{ success: boolean; item?: { id: string; roleId: string } }>(app, "employeesCreate", {
        firstName: "Test", lastName: "Employee", phone: "0555000001", roleId: roles.items.find(role => role.key === "worker")!.id,
        salaryReference: { period: "MONTHLY", amount: "9007199254740993.21" },
      }, signIn.token);
      expect(employee.success).toBe(true);
      if (!employee.success || !employee.item) throw new Error("Exact employee creation failed");
      const employeeId = employee.item.id;
      const placement = await rpcCall<{ success: boolean }>(app, "employeesAssignWorkplace", {
        employeeId: employee.item.id, nextType: "PROJECT", managerId: manager.item.id, projectId: projectsA.item.id,
      }, signIn.token);
      expect(placement.success).toBe(true);
      const assignments = await rpcCall<{ items: { employeeId: string; projectId: string }[] }>(app, "projectAssignmentsList", { employeeId: employee.item.id }, signIn.token);
      expect(assignments.items).toHaveLength(1);
      expect(assignments.items[0]).toMatchObject({ employeeId: employee.item.id, projectId: projectsA.item.id });
      const managerAssignments = await rpcCall<{ items: { workerId: string; managerId: string; status: string }[] }>(app, "managerAssignmentsList", { workerId: employee.item.id, status: "ACTIVE" }, signIn.token);
      expect(managerAssignments.items).toEqual([expect.objectContaining({ workerId: employee.item.id, managerId: manager.item.id, status: "ACTIVE" })]);

      const approvalInput = {
        ...approval,
        employeeId: employee.item.id,
        months: [{ ...approval.months[0]!, segments: [
          { ...approval.months[0]!.segments[0]!, projectId: projectsA.item.id },
          { ...approval.months[0]!.segments[1]!, projectId: projectsB.item.id },
          { ...approval.months[0]!.segments[2]!, projectId: projectsA.item.id },
        ] }],
      };
      const result = await rpcCall<{ totalAmount: string; months: { earning: { unallocatedAmount: string; segments: { id: string; projectId: string; amount: string; days?: number }[] } }[] }>(app, "workforceExact/approveMonthlyEarnings", approvalInput, signIn.token);
      expect(result.totalAmount).toBe("62500.00");
      expect(result.months[0]!.earning.segments).toEqual([
        { id: "a-first", projectId: projectsA.item.id, amount: "10000.00", days: 5 },
        { id: "b-middle", projectId: projectsB.item.id, amount: "37500.00", days: 15 },
        { id: "a-last", projectId: projectsA.item.id, amount: "15000.00", days: 5 },
      ]);
      const costA = await rpcCall<{ totalAmount: string }>(app, "workforceExact/getProjectSalaryCost", { projectId: projectsA.item.id }, signIn.token);
      const costB = await rpcCall<{ totalAmount: string }>(app, "workforceExact/getProjectSalaryCost", { projectId: projectsB.item.id }, signIn.token);
      expect(costA.totalAmount).toBe("25000.00");
      expect(costB.totalAmount).toBe("37500.00");
      expect(await rpcCall(app, "workforceExact/approveMonthlyEarnings", approvalInput, signIn.token)).toEqual(result);
      const partialPeriod = await rpcCall<{ months: { earning: { unallocatedAmount: string } }[] }>(app, "workforceExact/approveMonthlyEarnings", {
        requestId: "normal-root-543-partial-approval", employeeId: employee.item.id, currency: "DZD",
        months: [{ id: "november-partial", month: "2026-11", amount: "10000", unallocatedAmount: "2500", segments: [
          { id: "november-a", projectId: projectsA.item.id, amount: "7500", days: 3 },
        ] }],
      }, signIn.token);
      expect(partialPeriod.months[0]!.earning.unallocatedAmount).toBe("2500.00");
      expect((await rpcCall<{ totalAmount: string }>(app, "workforceExact/getProjectSalaryCost", { projectId: projectsA.item.id }, signIn.token)).totalAmount).toBe("32500.00");
      const earningsBeforeInvalid = await rpcCall<unknown[]>(app, "workforceExact/listEmployeeEarnings", { employeeId: employee.item.id }, signIn.token);
      await expect(rpcCall(app, "workforceExact/approveMonthlyEarnings", {
        requestId: "normal-root-543-invalid-project", employeeId: employee.item.id, currency: "DZD",
        months: [{ id: "invalid-project-month", month: "2026-12", amount: "100", unallocatedAmount: "0", segments: [
          { id: "invalid-project-segment", projectId: "missing-project", amount: "100" },
        ] }],
      }, signIn.token)).rejects.toMatchObject({ status: 404 });
      await expect(rpcCall(app, "workforceExact/approveMonthlyEarnings", {
        requestId: "normal-root-543-invalid-days", employeeId: employee.item.id, currency: "DZD",
        months: [{ id: "invalid-days-month", month: "2026-12", amount: "100", unallocatedAmount: "0", segments: [
          { id: "invalid-days-segment", projectId: projectsA.item.id, amount: "100", days: 0 },
        ] }],
      }, signIn.token)).rejects.toMatchObject({ status: 400 });
      expect(await rpcCall(app, "workforceExact/listEmployeeEarnings", { employeeId: employee.item.id }, signIn.token)).toEqual(earningsBeforeInvalid);

      await expect(rpcCall(app, "employeesCreate", {
        firstName: "Bad", lastName: "Reference", phone: "0555000002", roleId: employee.item.roleId,
        salaryReference: { period: "DAILY", amount: "not-money" },
      }, signIn.token)).rejects.toMatchObject({ status: 400 });
      const updatedEmployee = await rpcCall<{ success: boolean }>(app, "employeesUpdate", {
        id: employee.item.id, salaryReference: { period: "DAILY", amount: "0.0001" },
      }, signIn.token);
      expect(updatedEmployee.success).toBe(true);
      const history = await rpcCall<{ items: { salaryReference: { amount: string } | null }[] }>(app, "employeeStateHistoryList", { employeeId: employee.item.id }, signIn.token);
      expect(history.items.some(row => row.salaryReference?.amount === "9007199254740993.21")).toBe(true);
      expect(history.items.some(row => row.salaryReference?.amount === "0.0001")).toBe(true);
      await expect(rpcCall(app, "salaryPaymentsCreate", { employeeId: employee.item.id, periodType: "MONTHLY", days: 30, expectedAmountDzd: 62500, actualAmountDzd: 0 })).rejects.toMatchObject({ status: 401 });
      await expect(rpcCall(app, "salaryPaymentsCreate", { employeeId: employee.item.id, periodType: "MONTHLY", days: 30, expectedAmountDzd: 62500, actualAmountDzd: 0 }, signIn.token)).rejects.toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
      await expect(rpcCall(app, "workforceExact/recordPayrollCash", {}, signIn.token)).rejects.toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
      expect(await rpcCall(app, "workforceExact/listEmployeeEarnings", { employeeId: employee.item.id }, signIn.token)).toEqual(earningsBeforeInvalid);
      await expect(rpcCall(app, "workforceExact/getProjectSalaryCost", { projectId: "missing-project" }, signIn.token)).rejects.toMatchObject({ status: 404 });
      const employeeRecords = await rpcCall<{ items: { id: string; salaryReference: { amount: string } | null }[] }>(app, "employeesList", {}, signIn.token);
      expect(employeeRecords.items).toHaveLength(2);
      expect(employeeRecords.items.find(item => item.id === employeeId)?.salaryReference).toEqual({ period: "DAILY", amount: "0.0001" });

      const snapshotPath = join(directory, "workspace-backup.sqlite");
      const snapshot = await createWorkerSnapshotter({ databasePath, databaseKey: key })(snapshotPath);
      expect(snapshot).toEqual({ schemaVersion: 0, encrypted: Boolean(key) });
      const backupDeps = await createAppDependencies({ databasePath: snapshotPath, databaseKey: key }, config);
      try {
        if (backupDeps.mode !== "slice543") throw new Error("Snapshot reopened outside slice 543");
        const backupApp = createApp(backupDeps, { allowedOrigins: ["http://localhost"] });
        expect(await rpcCall<{ workspaceId: string }>(backupApp, "slice543Capabilities", undefined, signIn.token)).toEqual({ ...caps, workspaceId: caps.workspaceId });
        expect(await rpcCall(backupApp, "getRecoveryKeyPool", undefined, signIn.token)).toMatchObject({ availableCount: 3, totalCount: 3 });
        expect(await rpcCall(backupApp, "workforceExact/listEmployeeEarnings", { employeeId: employee.item.id }, signIn.token)).toEqual([
          { earning: result.months[0]!.earning, remainingAmount: "62500.00" },
          { earning: partialPeriod.months[0]!.earning, remainingAmount: "10000.00" },
        ]);
      } finally { backupDeps.close(); }

      deps.close();
      deps = await createAppDependencies({ databasePath, databaseKey: key }, config);
      if (deps.mode !== "slice543") throw new Error("Reopened root changed runtime mode");
      const reopenedApp = createApp(deps, { allowedOrigins: ["http://localhost"] });
      expect(await rpcCall<{ workspaceId: string }>(reopenedApp, "slice543Capabilities", undefined, signIn.token)).toEqual({ ...caps, workspaceId: caps.workspaceId });
      expect(await rpcCall(reopenedApp, "getRecoveryKeyPool", undefined, signIn.token)).toMatchObject({ availableCount: 3, totalCount: 3 });
      const reopenedEarnings = await rpcCall<unknown[]>(reopenedApp, "workforceExact/listEmployeeEarnings", { employeeId: employee.item.id }, signIn.token);
      expect(reopenedEarnings).toEqual([
        { earning: result.months[0]!.earning, remainingAmount: "62500.00" },
        { earning: partialPeriod.months[0]!.earning, remainingAmount: "10000.00" },
      ]);
      expect((await rpcCall<{ totalAmount: string }>(reopenedApp, "workforceExact/getProjectSalaryCost", { projectId: projectsA.item.id }, signIn.token)).totalAmount).toBe("32500.00");
    } finally {
      deps.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("normal exact workspace refusal", () => {
  it("leaves an existing legacy database unchanged instead of running legacy DDL", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tuari-543-legacy-refusal-"));
    const databasePath = join(directory, "legacy.sqlite");
    const db = createDatabaseConnection(databasePath, "");
    db.exec("CREATE TABLE employee(id TEXT PRIMARY KEY,salary_amount_dzd REAL); INSERT INTO employee VALUES ('old-employee',1250.5)");
    db.close();
    try {
      await expect(createAppDependencies({ databasePath, databaseKey: "" }, config)).rejects.toThrow(/fresh exact workspace/i);
      const reopened = createDatabaseConnection(databasePath, "");
      try {
        expect(reopened.prepare("SELECT id,salary_amount_dzd FROM employee").all()).toEqual([{ id: "old-employee", salary_amount_dzd: 1250.5 }]);
        expect(reopened.prepare("SELECT name FROM sqlite_master WHERE name='exact_money_schema'").get()).toBeUndefined();
      } finally { reopened.close(); }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
