import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vitest";

import { createAppConfig } from "../../config";
import { createAppDependencies } from "../../app/dependencies";
import { createRpcContext } from "../../rpc/context";
import { createRouter } from "../../rpc/router";

const AUTH_SECRET = "expense-precision-auth-secret-543";
const directories: string[] = [];
const openRoots: Array<{ close: () => void }> = [];

afterEach(() => {
  for (const root of openRoots.splice(0)) root.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("normal expense amounts consumed by project cost", { timeout: 60_000 }, () => {
  it("rejects excess precision through authenticated RPC without persisting an expense", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tuari-expense-precision-"));
    directories.push(directory);
    const config = createAppConfig({ BETTER_AUTH_SECRET: AUTH_SECRET, DB_ADAPTER: "sqlite" });
    const root = await createAppDependencies({ databasePath: join(directory, "expense.sqlite") }, config);
    openRoots.push(root);

    const bootstrap = await root.authBootstrapService.bootstrapFirstUser({
      name: "Expense owner",
      phone: "0612345789",
      password: "password123",
    });
    if (!bootstrap.success) throw new Error("Could not create the test owner");

    const authContext = await root.auth.$context;
    const internalAdapter = authContext.internalAdapter as unknown as {
      createSession: (userId: string) => Promise<{ token: string }>;
    };
    const session = await internalAdapter.createSession(bootstrap.item.id);
    const headers = new Headers({ authorization: `Bearer ${session.token}` });
    const router = createRouter(root as never);
    const client = createRouterClient(router, {
      context: createRpcContext(headers, root.sessionService) as never,
    }) as unknown as {
      expensesCreate(input: { amount: number; expenseDate: string; whatFor?: string; projectId?: string }): Promise<{ id: string }>;
      expensesUpdate(input: { id: string; amount?: number }): Promise<unknown>;
      expensesList(input: Record<string, never>): Promise<unknown>;
      projectsCreate(input: { name: string; status: "ACTIVE" }): Promise<{ success: boolean; item: { id: string } }>;
      projectCostGet(input: { projectId: string }): Promise<unknown>;
    };

    for (const amount of [0.375, 0.001]) {
      await expect(client.expensesCreate({
        amount,
        expenseDate: "2026-10-03T10:00:00.000Z",
        whatFor: "Precision regression",
      })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        data: { issues: expect.arrayContaining([expect.objectContaining({ path: ["amount"] })]) },
      });
    }

    await expect(client.expensesList({})).resolves.toMatchObject({
      items: [],
      totals: { total: 0, count: 0 },
    });

    const project = await client.projectsCreate({ name: "Expense project", status: "ACTIVE" });
    expect(project.success).toBe(true);
    const projectId = project.item.id;
    const created = await client.expensesCreate({
      amount: 12.34,
      expenseDate: "2026-10-03T10:00:00.000Z",
      whatFor: "Valid final amount",
      projectId,
    });
    await expect(client.expensesUpdate({ id: created.id, amount: 0.375 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(client.projectCostGet({ projectId })).resolves.toMatchObject({
      success: true,
      item: {
        expenses: [{ amount: "12.34" }],
        parts: { expensesAmount: "12.34" },
      },
    });
  });
});
