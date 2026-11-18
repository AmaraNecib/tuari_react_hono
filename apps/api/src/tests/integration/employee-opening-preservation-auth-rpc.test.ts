import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRouterClient } from "@orpc/server";
import type { AppClient } from "@tuari/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { createAppDependencies } from "../../app/dependencies";
import { createAppConfig } from "../../config";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createRpcContext } from "../../rpc/context";
import { createRouter } from "../../rpc/router";

const directories: string[] = [];
const roots: Array<{ close: () => void }> = [];
const timestamp = "2026-01-10T12:00:00.000Z";

afterEach(() => {
  for (const root of roots.splice(0)) root.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("opening-balance preservation prerequisites through authenticated application RPC", { timeout: 60_000 }, () => {
  it("keeps historical cash unchanged without deriving earnings, debt or labor cost from salary differences", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tuari-545-preservation-"));
    directories.push(directory);
    const databasePath = join(directory, "workforce.sqlite");
    const config = createAppConfig({
      BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM",
      DB_ADAPTER: "sqlite",
    });
    const open = async () => {
      const root = await createAppDependencies({ databasePath, databaseKey: "" }, config);
      roots.push(root);
      return root;
    };
    const close = (root: Awaited<ReturnType<typeof open>>) => {
      root.close();
      roots.splice(roots.indexOf(root), 1);
    };
    const authenticatedClient = (root: Awaited<ReturnType<typeof open>>, headers: Headers) =>
      createRouterClient(createRouter(root as never), {
        context: createRpcContext(headers, root.sessionService) as never,
      }) as unknown as AppClient;

    const first = await open();
    const owner = await first.authBootstrapService.bootstrapFirstUser({
      name: "Preservation owner", phone: "0612345678", password: "password123",
    });
    if (!owner.success) throw new Error("Could not create fixture owner");
    const auth = await first.auth.$context;
    const adapter = auth.internalAdapter as unknown as {
      createSession: (userId: string) => Promise<{ token: string }>;
    };
    const session = await adapter.createSession(owner.item.id);
    const headers = new Headers({ authorization: `Bearer ${session.token}` });
    expect(await first.sessionService.getCurrentUser(headers)).toMatchObject({ id: owner.item.id });
    const firstClient = authenticatedClient(first, headers);
    const employee = await firstClient.employeesCreate({
      firstName: "Legacy", lastName: "Worker", phone: "0555123987",
      roleId: first.workforceService.listRoles().items.find(role => role.key === "worker")!.id,
      salaryReference: { period: "MONTHLY", amount: "30000.00" },
    });
    const project = await firstClient.projectsCreate({ name: "Explicit labor only", status: "ACTIVE" });
    if (!employee.success || !project.success) throw new Error("Could not create fixture references");
    const employeeId = employee.item.id;
    const projectId = project.item.id;
    close(first);

    // Import a pre-existing fixture, not a new salary payment through the retired writer.
    const legacyIds = [randomUUID(), randomUUID()];
    const transactionId = randomUUID();
    const splitId = randomUUID();
    const raw = createDatabaseConnection(databasePath, "");
    try {
      const insert = raw.prepare(`INSERT INTO employee_salary_payment
        (id, employee_id, period_type, days, expected_amount_dzd, actual_amount_dzd,
         payment_date, note, actor_user_id, actor_label, transaction_id, created_at, updated_at)
        VALUES (?, ?, 'MONTHLY', 30, 30000, ?, ?, 'Imported history', ?, 'Historical owner', ?, ?, ?)`);
      raw.transaction(() => {
        insert.run(legacyIds[0], employeeId, 25000, timestamp, owner.item.id, transactionId, timestamp, timestamp);
        insert.run(legacyIds[1], employeeId, 40000, timestamp, owner.item.id, transactionId, timestamp, timestamp);
        raw.prepare(`INSERT INTO employee_salary_payment_split
          (id, payment_id, project_id, days, created_at) VALUES (?, ?, ?, 30, ?)`)
          .run(splitId, legacyIds[0], projectId, timestamp);
      })();
    } finally { raw.close(); }

    const imported = await open();
    const client = authenticatedClient(imported, headers);
    const anonymous = authenticatedClient(imported, new Headers());
    await expect(anonymous.employeeEarningsList({ employeeId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const assertNoReconstruction = async (current: AppClient) => {
      expect((await current.employeeEarningsList({ employeeId })).items).toEqual([]);
      expect((await current.debtAccountsList({ workerId: employeeId })).items).toEqual([]);
      const cost = await current.projectCostGet({ projectId });
      if (!cost.success) throw new Error("Project cost read failed");
      expect(cost.item.parts.salariesAmount).toBe("0.00");
      expect(cost.item.salaries).toEqual([]);
    };
    await assertNoReconstruction(client);
    const historical = (await client.salaryPaymentsList({ employeeId })).items;
    expect(historical).toHaveLength(2);
    for (const [index, amount] of [25000, 40000].entries()) {
      expect(historical.find(row => row.id === legacyIds[index])).toMatchObject({
        employeeId, periodType: "MONTHLY", days: 30,
        expectedAmountDzd: 30000, actualAmountDzd: amount,
        paymentDate: timestamp, note: "Imported history",
        actorUserId: owner.item.id, transactionId, createdAt: timestamp, updatedAt: timestamp,
      });
    }
    expect(historical.find(row => row.id === legacyIds[0])?.projectSplits).toEqual([
      { projectId, days: 30 },
    ]);
    await expect(client.employeesUpdate({
      id: employeeId, salaryReference: { period: "MONTHLY", amount: "45000.00" },
    })).resolves.toMatchObject({ success: true });
    await assertNoReconstruction(client);
    expect((await client.salaryPaymentsList({ employeeId })).items).toEqual(historical);
    await expect(client.salaryPaymentsCreate({ employeeId, days: 30, actualAmountDzd: 30000 }))
      .resolves.toMatchObject({ success: false, error: { code: "BUSINESS_RULE" } });
    await assertNoReconstruction(client);

    const approval = await client.employeeEarningsApprove({
      employeeId, requestId: randomUUID(),
      periodStart: "2026-02-01T00:00:00.000Z", periodEnd: "2026-03-01T00:00:00.000Z",
      currencyCode: "DZD", totalAmount: "35000.00", unallocatedAmount: "0.00",
      segments: [{ id: randomUUID(), projectId, days: 28, amount: "35000.00" }],
    });
    if (!approval.success) throw new Error("Explicit approval failed");
    expect(approval.item.totalAmount).toBe("35000.00");
    close(imported);

    const reopened = await open();
    const reopenedClient = authenticatedClient(reopened, headers);
    expect(await reopened.sessionService.getCurrentUser(headers)).toMatchObject({ id: owner.item.id });
    expect((await reopenedClient.salaryPaymentsList({ employeeId })).items).toEqual(historical);
    expect((await reopenedClient.employeeEarningsList({ employeeId })).items).toEqual([approval.item]);
    const cost = await reopenedClient.projectCostGet({ projectId });
    if (!cost.success) throw new Error("Project cost read after reopen failed");
    expect(cost.item.parts.salariesAmount).toBe("35000.00");
    expect(cost.item.salaries).toHaveLength(1);
    expect(cost.item.salaries[0]).toMatchObject({ earningId: approval.item.id, amount: "35000.00" });
    const updatedEmployee = await reopenedClient.employeesGet({ id: employeeId });
    if (!updatedEmployee.success) throw new Error("Employee read after reopen failed");
    expect(updatedEmployee.item.salaryReference).toEqual({ period: "MONTHLY", amount: "45000.00" });
  });
});
