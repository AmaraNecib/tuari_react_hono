import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { createRouterClient } from "@orpc/server";
import { createFreshExactAppDependencies } from "../../../api/src/app/fresh-exact-dependencies";
import { createAppConfig } from "../../../api/src/config";
import { createRpcContext } from "../../../api/src/rpc/context";
import { createRouter } from "../../../api/src/rpc/router";
import { createDatabaseConnection } from "../../../api/src/infrastructure/database/factory";

it("commits and replays an authenticated opening under the native cleared environment", async () => {
  expect(process.env.TUARI_TEST_SECRET).toBeUndefined();
  expect(process.env.TEMP).toBe(process.env.SQLITE_TMPDIR);
  expect(process.env.TMP).toBe(process.env.SQLITE_TMPDIR);
  const databasePath = join(mkdtempSync(join(tmpdir(), "tuari-native-opening-")), "app.sqlite");
  const config = createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite" });
  const root = await createFreshExactAppDependencies({ databasePath }, config);
  try {
    const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Native probe", phone: "0612345678", password: "password123" });
    if (!owner.success) throw new Error("Bootstrap failed");
    const adapter = (await root.auth.$context).internalAdapter as unknown as { createSession(id: string): Promise<{ token: string }> };
    const session = await adapter.createSession(owner.item.id);
    const client = createRouterClient(createRouter(root), { context: createRpcContext(new Headers({ authorization: `Bearer ${session.token}` }), root.sessionService) });
    const role = root.workforceService.listRoles().items.find(row => row.key === "worker")!;
    const employee = await client.employeesCreate({ firstName: "Native", lastName: "Probe", phone: "0555123987", roleId: role.id });
    if (!employee.success) throw new Error("Employee creation failed");
    const input = { requestId: "native-temp-opening", employeeId: employee.item.id, wages: "2000.00", advances: "300.00" };
    const saved = await client.employeePayrollOpeningReview(input);
    expect(await client.employeePayrollOpeningReview(input)).toEqual(saved);
    expect(saved).toMatchObject({ wages: "2000.00", advances: "300.00" });
  } finally { root.close(); }
  const connection = createDatabaseConnection(databasePath, "");
  try {
    expect(connection.prepare("SELECT wages_minor, advances_minor FROM employee_opening_review").all()).toEqual([{ wages_minor: 200000, advances_minor: 30000 }]);
    expect(connection.prepare("SELECT count(*) AS n FROM employee_opening_source").get()).toEqual({ n: 2 });
    expect(connection.prepare("SELECT count(*) AS n FROM debt_command").get()).toEqual({ n: 4 });
  } finally { connection.close(); }
}, 30000);
