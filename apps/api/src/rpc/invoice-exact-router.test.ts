import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRouterClient } from "@orpc/server";
import type { ExactInvoicesClient } from "@tuari/contracts";
import { expect, it } from "vitest";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createFifoLock } from "../infrastructure/database/fifo-lock";
import { exactDebtSchemaStatements } from "../modules/company/adapters/exact-finance-schema";
import { SqliteExactFinanceRepository } from "../modules/company/adapters/sqlite-exact-finance.repository";
import { ExactFinanceService } from "../modules/company/exact-finance.service";
import { exactInvoiceSchemaStatements } from "../modules/invoice/adapters/exact-invoice-schema";
import { SqliteExactInvoiceRepository } from "../modules/invoice/adapters/sqlite-exact-invoice.repository";
import { ExactInvoiceService } from "../modules/invoice/invoice-exact.service";
import { createExactInvoicesRouter } from "./invoice-exact-router";
import { createRpcMiddleware } from "./rpc-middleware";
import type { RpcContext } from "./context";

const partyId = "00000000-0000-4000-8000-000000000999";
const user = { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0", permissions: [] };
it.each(["", "525-rpc-public-key"])("exact input-to-native invoice/cash RPC key=%s", async key => {
  const db = createDatabaseConnection(join(mkdtempSync(join(tmpdir(), "tuari-525-rpc-")), "invoice.sqlite"), key);
  try {
    db.pragma("foreign_keys=ON");
    db.exec(`CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); INSERT INTO external_counterparty VALUES ('${partyId}')`);
    for (const sql of exactInvoiceSchemaStatements) db.exec(sql);
    for (const sql of exactDebtSchemaStatements) db.exec(sql);
    const lock = createFifoLock();
    const dependencies = { id: randomUUID, now: () => "2026-11-10T10:00:00.000Z" };
    const finance = new ExactFinanceService(new SqliteExactFinanceRepository(db, lock), dependencies);
    const service = new ExactInvoiceService(new SqliteExactInvoiceRepository(db, lock), finance, dependencies);
    const middleware = createRpcMiddleware({ authBootstrapService: { isBootstrapOwner: async id => id === user.id } });
    const router = createExactInvoicesRouter(service, middleware);
    const context: RpcContext = { headers: new Headers(), resolveCurrentUser: async () => user };
    const client = createRouterClient(router, { context }) as ExactInvoicesClient;
    const draft = await client.createInvoice({ requestId: "draft", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: partyId, direction: "SALE", supplierName: "Synthetic buyer", lineItems: [
      { description: "First", source: { mode: "unit-price", price: "1.5000", quantity: "0.25" } },
      { description: "Second", source: { mode: "unit-price", price: "1.5000", quantity: "0.25" } },
    ] });
    expect(draft.totalAmount).toBe("0.75");
    const invoice = await client.receiveInvoice({ requestId: "receive", id: draft.id });
    expect(finance.getAccount(invoice.debtAccountId!).direction).toBe("RECEIVABLE");
    const cashInput = { requestId: "cash", counterpartyType: "EXTERNAL_COUNTERPARTY" as const, counterpartyId: partyId, direction: "SALE" as const, paymentDate: dependencies.now(), paymentMethod: "BANK_TRANSFER" as const, totalAmount: "0.75", allocations: [{ invoiceId: invoice.id, amount: "0.10" }, { invoiceId: invoice.id, amount: "0.20" }] };
    const cash = await client.createPayment(cashInput);
    expect(cash).toMatchObject({ totalAmount: "0.75", unallocatedAmount: "0.45", actorUserId: user.id, actorLabel: user.name });
    expect(await client.createPayment(cashInput)).toEqual(cash);
    await client.allocatePayment({ requestId: "remaining", id: cash.id, allocations: [{ invoiceId: invoice.id, amount: "0.45" }] });
    expect(await client.getInvoice({ id: invoice.id })).toMatchObject({ status: "PAID", paidAmount: "0.75", remainingAmount: "0.00" });
    expect(finance.remaining(invoice.debtEntryId!)).toBe("0.00");
    expect(() => JSON.stringify(service.getPayment(cash.id))).not.toThrow();
    await expect(client.createPayment({ ...cashInput, requestId: "duplicate", id: cash.id })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(client.createPayment({ ...cashInput, requestId: "precision", totalAmount: "0.001" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(client.createPayment({ ...cashInput, requestId: "changed-intent", direction: "PURCHASE" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await client.voidPayment({ requestId: "reverse", id: cash.id, reason: "Bank transfer reversed" });
    expect(await client.getInvoice({ id: invoice.id })).toMatchObject({ paidAmount: "0.00", remainingAmount: "0.75", status: "RECEIVED" });
    const anonymous = createRouterClient(router, { context: { ...context, resolveCurrentUser: async () => null } }) as ExactInvoicesClient;
    await expect(anonymous.listInvoices({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const nonAdmin = createRouterClient(router, { context: { ...context, resolveCurrentUser: async () => ({ ...user, id: "not-owner" }) } }) as ExactInvoicesClient;
    await expect(nonAdmin.receiveInvoice({ requestId: "forbidden", id: draft.id })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  } finally { db.close(); }
});
