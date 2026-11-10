import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRouterClient } from "@orpc/server";
import type { ExactDebtsClient } from "@tuari/contracts";
import { describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createFifoLock } from "../infrastructure/database/fifo-lock";
import { exactDebtSchemaStatements } from "../modules/company/adapters/exact-finance-schema";
import { SqliteExactFinanceRepository } from "../modules/company/adapters/sqlite-exact-finance.repository";
import { ExactFinanceService } from "../modules/company/exact-finance.service";
import { createExactDebtsRouter } from "./debts-exact-router";
import { createRpcMiddleware } from "./rpc-middleware";
import type { RpcContext } from "./context";

const partyId = "00000000-0000-4000-8000-000000000999";
const user = { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0", permissions: [] };
describe.each(["", "524-rpc-public-key"])("opt-in exact debt RPC key=%s", key => {
  it("serves attributed create/read/payment/correction/void/settlement with exact JSON and authenticated audit", async () => {
    const db = createDatabaseConnection(join(mkdtempSync(join(tmpdir(), "tuari-524-rpc-")), "ledger.sqlite"), key);
    try {
      db.pragma("foreign_keys=ON");
      db.exec(`CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY); INSERT INTO external_counterparty VALUES ('${partyId}')`);
      for (const sql of exactDebtSchemaStatements) db.exec(sql);
      const service = new ExactFinanceService(new SqliteExactFinanceRepository(db, createFifoLock()), { id: randomUUID, now: () => "2026-11-10T10:00:00.000Z" });
      const middleware = createRpcMiddleware({ authBootstrapService: { isBootstrapOwner: async id => id === user.id } });
      const router = createExactDebtsRouter(service, middleware);
      const context: RpcContext = { headers: new Headers(), resolveCurrentUser: async () => user };
      const client = createRouterClient(router, { context }) as ExactDebtsClient;
      const account = await client.create({ requestId: "account", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: partyId, direction: "PAYABLE", openingBalanceDzd: "90071992547409.93" });
      expect(JSON.parse(JSON.stringify(account))).toMatchObject({ currentBalance: "90071992547409.93", currency: "DZD", actorUserId: user.id, actorLabel: "Operator" });
      const original = (await client.detail({ id: account.id })).entries[0]!;
      const payment = await client.pay({ requestId: "payment", debtEntryId: original.id, amountDzd: "0.10" });
      expect(payment).toMatchObject({ signedAmountDzd: "-0.10", targetEntryId: original.id, actorUserId: user.id });
      expect(payment.transactionId).toEqual(expect.any(String));
      await expect(client.pay({ requestId: "payment", debtEntryId: original.id, amountDzd: "0.20" })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(client.pay({ requestId: "bad", debtEntryId: original.id, amountDzd: "0.001" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await client.correct({ requestId: "correct", entryId: original.id, amountDzd: "90071992547409.92", reason: "One cent corrected" });
      expect((await client.detail({ id: account.id })).account.currentBalance).toBe("90071992547409.82");
      await client.void({ requestId: "reverse-payment", entryId: payment.id, voidReason: "Payment reversed" });
      const result = await client.settle({ requestId: "settle", debtAccountId: account.id });
      expect(result[0]).toMatchObject({ targetEntryId: original.id, signedAmountDzd: "-90071992547409.92" });
      expect(await client.summary()).toMatchObject({ grossPayableDzd: "0.00", grossReceivableDzd: "0.00" });
      await expect(client.detail({ id: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
      const anonymous = createRouterClient(router, { context: { ...context, resolveCurrentUser: async () => null } }) as ExactDebtsClient;
      await expect(anonymous.summary()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      const nonAdmin = createRouterClient(router, { context: { ...context, resolveCurrentUser: async () => ({ ...user, id: "not-owner" }) } }) as ExactDebtsClient;
      await expect(nonAdmin.pay({ requestId: "forbidden", debtEntryId: original.id, amountDzd: "0.01" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    } finally { db.close(); }
  });
});
