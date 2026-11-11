import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";
import type { ExactWorkforceClient } from "@tuari/contracts";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createFifoLock } from "../infrastructure/database/fifo-lock";
import { exactWorkforceSchemaStatements } from "../modules/company/adapters/exact-workforce-schema";
import { exactWorkforceEarningSchemaStatements } from "../modules/company/adapters/exact-workforce-earning-schema";
import { exactDebtSchemaStatements } from "../modules/company/adapters/exact-finance-schema";
import { createExactWorkforceComposition } from "./exact-workforce-composition";
import { createRpcMiddleware } from "./rpc-middleware";
import type { RpcContext } from "./context";

const user = { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0", permissions: [] };
const time = "2026-11-11T00:00:00.000Z";
const plan = {
  requestId: "approve-months", employeeId: "worker", currency: "DZD" as const,
  months: [{ id: "oct", month: "2026-10", amount: "35000", unallocatedAmount: "0", segments: [
    { id: "first", projectId: "A", amount: "10000", days: 5 },
    { id: "second", projectId: "B", amount: "10000" },
    { id: "third", projectId: "A", amount: "15000", days: 7 },
  ] }],
};

describe.each([["plain", ""], ["keyed", "527-rpc-public-synthetic-key"]])("exact workforce RPC %s", (_kind, key) => {
  it("connects audited native approval, target-backed reads and project labor cost without cash double counting", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "tuari-527-rpc-")), "fixture.sqlite");
    let db = createDatabaseConnection(path, key);
    const middleware = createRpcMiddleware({ authBootstrapService: { isBootstrapOwner: async id => id === user.id } });
    const context: RpcContext = { headers: new Headers(), resolveCurrentUser: async () => user };
    const lock = createFifoLock();
    const compose = () => createExactWorkforceComposition(db, lock, middleware, { id: randomUUID, now: () => time });
    try {
      db.pragma("foreign_keys=ON");
      db.exec("CREATE TABLE role(id TEXT PRIMARY KEY); CREATE TABLE user(id TEXT PRIMARY KEY); CREATE TABLE project(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY); INSERT INTO user VALUES ('operator'); INSERT INTO role VALUES ('worker'); INSERT INTO project VALUES ('A'),('B'),('empty')");
      for (const sql of [...exactWorkforceSchemaStatements, ...exactDebtSchemaStatements, ...exactWorkforceEarningSchemaStatements]) db.exec(sql);
      db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES ('worker','Test','Worker','0550000000','worker','ACTIVE',?,?)").run(time, time);
      db.prepare("UPDATE employee SET salary_reference_units=3000000,salary_period='MONTHLY' WHERE id='worker'").run();
      db.prepare("INSERT INTO employee_salary_payment(id,employee_id,period_type,days,expected_amount_minor,actual_amount_minor,payment_date,created_at,updated_at) VALUES ('historical-cash','worker','MONTHLY',30,3000000,2500000,?,?,?)").run(time, time, time);
      db.prepare("INSERT INTO employee_salary_payment_split(id,payment_id,project_id,days,created_at) VALUES ('historical-split','historical-cash','A',30,?)").run(time);
      const composition = compose();
      const client = createRouterClient(composition.router, { context }) as ExactWorkforceClient;
      const approved = await client.approveMonthlyEarnings(plan);
      const earning = approved.months[0]!.earning;
      expect(earning).toMatchObject({ approvedAmount: "35000.00", actorUserId: user.id, actorLabel: user.name });
      expect(await client.listEmployeeEarnings({ employeeId: "worker" })).toEqual([{ earning, remainingAmount: "35000.00" }]);
      const cost = await client.getProjectSalaryCost({ projectId: "A" });
      expect(cost).toMatchObject({ projectId: "A", currency: "DZD", totalAmount: "25000.00", segments: [
        { earningId: earning.id, segment: { id: "first", amount: "10000.00", days: 5 } },
        { earningId: earning.id, segment: { id: "third", amount: "15000.00", days: 7 } },
      ] });
      expect(await client.getProjectSalaryCost({ projectId: "B" })).toMatchObject({ totalAmount: "10000.00" });
      expect(await client.getProjectSalaryCost({ projectId: "empty" })).toEqual({ projectId: "empty", currency: "DZD", totalAmount: "0.00", segments: [] });
      // Trusted fixture ledger settlement only, not proof of an implemented payroll cash command.
      composition.services.finance.forProducer({ type: "PAYROLL_EARNINGS", id: earning.id }).recordPayment({ requestId: "fixture-targeted-payment", debtEntryId: earning.debtEntryId!, amountDzd: "25000" });
      expect(await client.listEmployeeEarnings({ employeeId: "worker" })).toEqual([{ earning, remainingAmount: "10000.00" }]);
      expect(await client.getProjectSalaryCost({ projectId: "A" })).toEqual(cost);
      await expect(client.approveMonthlyEarnings({ ...plan, months: [{ ...plan.months[0]!, amount: "35001", unallocatedAmount: "1" }] })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(client.listEmployeeEarnings({ employeeId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(client.getProjectSalaryCost({ projectId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(client.approveMonthlyEarnings({ ...plan, actorUserId: "forged" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(client.approveMonthlyEarnings({ ...plan, totalAmount: "1" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(client.approveMonthlyEarnings({ ...plan, months: [{ ...plan.months[0]!, unallocatedAmount: "1" }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(client.approveMonthlyEarnings({ ...plan, months: [{ ...plan.months[0]!, segments: Array(10000).fill(null) }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const anonymous = createRouterClient(composition.router, { context: { ...context, resolveCurrentUser: async () => null } }) as ExactWorkforceClient;
      await expect(anonymous.listEmployeeEarnings({ employeeId: "worker" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(anonymous.approveMonthlyEarnings(plan)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      const nonAdmin = createRouterClient(composition.router, { context: { ...context, resolveCurrentUser: async () => ({ ...user, id: "not-owner" }) } }) as ExactWorkforceClient;
      await expect(nonAdmin.approveMonthlyEarnings({ ...plan, requestId: "forbidden" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(nonAdmin.getProjectSalaryCost({ projectId: "A" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      db.close();
      db = createDatabaseConnection(path, key);
      db.pragma("foreign_keys=ON");
      const reopened = createRouterClient(compose().router, { context }) as ExactWorkforceClient;
      expect(await reopened.approveMonthlyEarnings(plan)).toEqual(approved);
      expect(await reopened.getProjectSalaryCost({ projectId: "A" })).toEqual(cost);
      expect(await reopened.listEmployeeEarnings({ employeeId: "worker" })).toHaveLength(1);
      expect(() => JSON.stringify(cost)).not.toThrow();
    } finally { db.close(); }
  });
});
