import { randomUUID } from "node:crypto";
import { createRouterClient } from "@orpc/server";
import type { FinancialClient } from "@tuari/contracts";
import { expect, it } from "vitest";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { ensureFreshExactApplicationSchema } from "../infrastructure/database/fresh-exact-schema";
import { createFifoLock } from "../infrastructure/database/fifo-lock";
import { createFinancialDependencies } from "../app/financial-dependencies";
import { SqliteCompanyRepository } from "../modules/company/adapters/sqlite-company.repository";
import { AuditService } from "../modules/company/audit.service";
import { createDrizzleFromSqlite } from "../infrastructure/database/drizzle";
import { SqliteRoleRepository } from "../modules/rbac/adapters/sqlite-role.repository";
import { RoleModule } from "../modules/rbac/role.module";
import { createFinancialRouter, createUnavailableFinancialRouter } from "./financial-router";
import { createRpcMiddleware } from "./rpc-middleware";
import type { RpcContext } from "./context";

it("binds metadata and exact financial branches to the supplied graph and auth", async () => {
  const db = createDatabaseConnection(":memory:", "");
  try {
    await ensureFreshExactApplicationSchema(db);
    const lock = createFifoLock();
    const now = "2026-11-19T10:00:00.000Z";
    db.prepare("INSERT INTO external_counterparty(id,full_name,phone_number,created_at,updated_at) VALUES ('party','Supplier','0555123987',?,?)").run(now, now);
    const graph = createFinancialDependencies(db, lock, { id: randomUUID, now: () => now });
    const audit = new AuditService(new SqliteCompanyRepository(db, lock));
    const roles = new RoleModule({ repository: new SqliteRoleRepository(createDrizzleFromSqlite(db)) });
    const middleware = createRpcMiddleware({ authBootstrapService: { isBootstrapOwner: async id => id === "owner" } });
    const router = createFinancialRouter(graph, async () => ({ ...audit.getWorkspaceMetadata(), roles: await roles.list() }), middleware);
    const context: RpcContext = { headers: new Headers(), resolveCurrentUser: async () => ({ id: "owner", name: "Owner", phone: "0612345678", version: "0.0.0", permissions: [] }) };
    const client = createRouterClient(router, { context }) as FinancialClient;
    const metadata = await client.metadata();
    expect(metadata.externalCounterparties).toMatchObject([{ id: "party", fullName: "Supplier" }]);
    expect(metadata).not.toHaveProperty("debtAccounts");
    expect(metadata).not.toHaveProperty("salaryPayments");
    const account = await client.debts.create({ requestId: "composed-debt", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: "party", direction: "PAYABLE", openingBalanceDzd: "90071992547409.93" });
    expect(account).toMatchObject({ currentBalance: "90071992547409.93", actorUserId: "owner" });
    expect((await client.debts.summary()).grossPayableDzd).toBe("90071992547409.93");
    expect((await client.invoices.listInvoices({})).items).toEqual([]);
    expect(await client.inventory.definitions()).toEqual([]);
    await expect(client.manualSettlement.history({ externalCounterpartyId: "party" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(client.manualSettlement.preview({ externalCounterpartyId: "party", payableOriginalEntryId: "p", receivableOriginalEntryId: "r", currency: "DZD", amountDzd: "1.00" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    const anonymous = createRouterClient(router, { context: { ...context, resolveCurrentUser: async () => null } }) as FinancialClient;
    await expect(anonymous.metadata()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anonymous.debts.create({ requestId: "forbidden", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: "party", direction: "PAYABLE" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  } finally { db.close(); }
});

it("legacy composition advertises authenticated unavailable financial leaves, not fake data", async () => {
  const middleware = createRpcMiddleware({ authBootstrapService: { isBootstrapOwner: async () => true } });
  const context: RpcContext = { headers: new Headers(), resolveCurrentUser: async () => ({ id: "owner", name: "Owner", phone: "0612345678", version: "0.0.0", permissions: [] }) };
  const router = createUnavailableFinancialRouter(middleware);
  const client = createRouterClient(router, { context }) as FinancialClient;
  await expect(client.metadata()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  await expect(client.debts.create({ requestId: "not-configured", partyType: "INTERNAL_WORKER", workerId: "worker", direction: "PAYABLE" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  await expect(client.reports.generate({ type: "DEBT" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  const anonymous = createRouterClient(router, { context: { ...context, resolveCurrentUser: async () => null } }) as FinancialClient;
  await expect(anonymous.metadata()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(anonymous.reports.generate({ type: "DEBT" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});
