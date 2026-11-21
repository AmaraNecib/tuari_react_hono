import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRouterClient, ORPCError } from "@orpc/server";
import type { FinancialClient } from "@tuari/contracts";
import { expect, it } from "vitest";
import { createAppConfig } from "../config";
import { createAuth } from "../infrastructure/auth/auth";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createDrizzleFromSqlite } from "../infrastructure/database/drizzle";
import { ensureFreshExactApplicationSchema } from "../infrastructure/database/fresh-exact-schema";
import { createFifoLock } from "../infrastructure/database/fifo-lock";
import { createFinancialDependencies } from "../app/financial-dependencies";
import { AuthBootstrapService } from "../modules/auth/bootstrap.service";
import { SqliteBootstrapPort } from "../modules/auth/adapters/sqlite-bootstrap.port";
import { SessionService } from "../modules/session/session.service";
import { SqlitePermissionResolver } from "../modules/rbac/adapters/sqlite-permission-resolver";
import { ExactDebtReportReader } from "../modules/reports/exact-debt-report";
import { SqliteExactDebtReportSnapshot } from "../modules/reports/exact-debt-report-snapshot";
import { ExactInventoryReports } from "../modules/reports/exact-inventory-reports";
import { ExactInventoryReportSource } from "../modules/reports/exact-inventory-report-source";
import { createRpcContext } from "./context";
import { createRpcMiddleware } from "./rpc-middleware";
import { createFinancialRouter } from "./financial-router";
import { createExactReportCapability, type ExactReportCapability } from "./exact-reports-router";

it.each(["", "558-report-key"])("assembled financial reports use real sessions and shared native graph (%s)", async key => {
  const path = join(mkdtempSync(join(tmpdir(), "558-reports-rpc-")), "app.sqlite");
  const db = createDatabaseConnection(path, key);
  try {
    await ensureFreshExactApplicationSchema(db);
    const lock = createFifoLock();
    const drizzle = createDrizzleFromSqlite(db);
    const config = createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite" });
    const auth = createAuth(drizzle, config);
    const bootstrap = new AuthBootstrapService(new SqliteBootstrapPort(drizzle, db, lock), auth, config.bootstrapSetupKey);
    const owner = await bootstrap.bootstrapFirstUser({ name: "Report owner", phone: "0612345678", password: "password123" });
    if (!owner.success) throw new Error("Real bootstrap failed");
    const session = await (await auth.$context).internalAdapter.createSession(owner.item.id);
    const sessions = new SessionService(auth, new SqlitePermissionResolver(drizzle, bootstrap));
    const context = createRpcContext(new Headers({ authorization: `Bearer ${session.token}` }), sessions);
    expect(await context.resolveCurrentUser()).toMatchObject({ id: owner.item.id });
    const middleware = createRpcMiddleware({ authBootstrapService: bootstrap });
    let now = "2026-01-01T00:00:00.000Z";
    const graph = createFinancialDependencies(db, lock, { id: randomUUID, now: () => now });
    db.exec("INSERT INTO external_counterparty(id,full_name,phone_number,created_at,updated_at) VALUES ('party','Supplier','0555123987','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'); INSERT INTO warehouse(id,name,status,created_at,updated_at) VALUES ('warehouse','Original','ACTIVE','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'); INSERT INTO project(id,name,status,created_at,updated_at) VALUES ('project','Destination','ACTIVE','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'); INSERT INTO inventory_item_definition(id,name,item_type,unit,is_active,created_at,updated_at) VALUES ('material','Material','CONSUMABLE','m',1,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')");
    const debt = new ExactDebtReportReader(new SqliteExactDebtReportSnapshot(db, lock, graph.financeRepository), () => "2026-03-02T00:00:00.000Z");
    const inventory = new ExactInventoryReports(new ExactInventoryReportSource(db, lock), () => "2026-03-02T00:00:00.000Z");
    const capability = createExactReportCapability(debt, inventory);
    const clientFor = (reports?: ExactReportCapability, headersContext = context) => createRouterClient(createFinancialRouter(graph, async () => { throw new Error("Metadata not requested"); }, middleware, reports), { context: headersContext }) as FinancialClient;
    const client = clientFor(capability);
    for (const direction of ["PAYABLE", "RECEIVABLE"] as const) graph.finance.createAccount({ requestId: direction, partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: "party", direction, openingBalanceDzd: "92233720368547758.07" });
    const account = graph.financeRepository.listAccounts()[0]!;
    now = "2026-02-01T00:00:00.000Z";
    graph.finance.postEntry({ requestId: "later", debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: "-0.01" });
    const purchases = [0, 1].map(i => graph.inventory.createInvoiceGroup({ requestId: `wide-${i}`, warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 4, priceSource: { mode: "agreed-total", total: "92233720368547758.07", quantity: "4" } }] }));
    const entry = purchases[0]!.entries[0]!;
    graph.inventory.transferConsumable({ requestId: "partial", inventoryEntryId: entry.id, fromWarehouseId: "warehouse", toProjectId: "project", quantity: 1 });
    for (const transferType of ["SALE", "RETURN", "GIFT"] as const) graph.inventory.createOutboundTransfer({ requestId: transferType, fromType: "WAREHOUSE", fromId: "warehouse", counterpartyId: "party", transferType, items: [{ itemId: "material", quantity: 1 }] });
    const before = db.serialize();
    const changes = db.prepare("SELECT total_changes() AS count").get();
    const debtResult = await client.reports.generate({ type: "DEBT", endDate: "2026-03-02T00:00:00.000Z" });
    expect(debtResult).toMatchObject({ type: "DEBT", summary: { totalOutstandingDzd: "184467440737095516.13", overdueDzd: "184467440737095516.13" }, agingBreakdown: [{}, {}, { countOpen: 2, amountDzd: "184467440737095516.13" }] });
    expect(await client.reports.generate({ type: "DEBT", startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-01-02T00:00:00.000Z" })).toMatchObject({ summary: { totalOutstandingDzd: "184467440737095516.13" } });
    const stock = await client.reports.generate({ type: "INVENTORY" });
    expect(stock).toMatchObject({ type: "INVENTORY", summary: { totalValueDzd: "184467440737095516.14" }, byLocation: [{ locationId: "warehouse", consumableCount: 8 }], byItemType: [{ quantity: 8 }] });
    const movement = await client.reports.generate({ type: "MOVEMENT" });
    expect(movement).toMatchObject({ type: "MOVEMENT", summary: { outboundSales: 3 }, outboundDocuments: [{ transferType: "SALE", count: 1 }, { transferType: "RETURN", count: 1 }, { transferType: "GIFT", count: 1 }], byType: [{ movementType: "PURCHASE", valueDzd: "184467440737095516.14" }, {}, { movementType: "OUTBOUND_SALE", count: 3 }] });
    expect(await client.reports.generate({ type: "INVENTORY", startDate: "2026-03-01T00:00:00.000Z" })).toMatchObject({ summary: { totalValueDzd: "0.00" } });
    const anonymous = createRpcContext(new Headers(), sessions);
    await expect(clientFor(capability, anonymous).reports.generate({ type: "DEBT" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(clientFor(undefined, anonymous).reports.generate({ type: "DEBT" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(clientFor().reports.generate({ type: "DEBT" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    for (const amount of [12, "01.00", "1e3", "-0.00"]) {
      const corrupted = { ...debtResult, summary: { ...(debtResult.type === "DEBT" ? debtResult.summary : {}), totalOutstandingDzd: amount } };
      await expect(clientFor({ generate: () => corrupted as never }).reports.generate({ type: "DEBT" })).rejects.toThrow();
    }
    for (const failure of [new ORPCError("NOT_FOUND", { message: "Source not found" }), Object.assign(new Error("Limit reached"), { appError: { code: "RESOURCE_LIMIT", message: "Limit reached" } })]) {
      await expect(clientFor({ generate: () => { throw failure; } }).reports.generate({ type: "DEBT" })).rejects.toMatchObject({ code: failure instanceof ORPCError ? "NOT_FOUND" : "RESOURCE_LIMIT" });
    }
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const held = lock.run(() => new Promise<void>(resolve => { release = resolve; started(); }));
    await ready;
    try { await expect(client.reports.generate({ type: "MOVEMENT" })).rejects.toThrow(/busy|lock/i); } finally { release(); await held; }
    expect(db.prepare("SELECT total_changes() AS count").get()).toEqual(changes);
    expect(db.serialize()).toEqual(before);
  } finally { db.close(); }
}, 60_000);
