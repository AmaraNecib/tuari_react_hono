import { randomUUID } from "node:crypto";
import { createRouterClient } from "@orpc/server";
import type { AppClient } from "@tuari/contracts";
import { expect, it } from "vitest";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createFifoLock } from "../infrastructure/database/fifo-lock";
import { SqliteExactFinanceRepository } from "../modules/company/adapters/sqlite-exact-finance.repository";
import { ExactFinanceService } from "../modules/company/exact-finance.service";
import { payrollOffsetSchemaStatements } from "../modules/workforce/adapters/payroll-offset-schema";
import { payrollFixture, now } from "../modules/workforce/__test-utils__/payroll-native";
import type { RpcContext } from "./context";
import { createExactPayrollComposition } from "./exact-payroll-composition";
import { createPayrollRouter } from "./payroll-router";
import { createRpcMiddleware } from "./rpc-middleware";

const owner = { id: "payroll-owner", name: "Owner", phone: "0612345678", version: "0.0.0", permissions: [] };
const rollbackTables = ["employee_earning", "employee_earning_segment", "employee_salary_cash", "employee_salary_payment_allocation", "employee_salary_advance", "employee_salary_settlement", "employee_salary_advance_offset", "debt_account", "debt_entry", "debt_command", "exact_finance_command"] as const;
function snapshot(db: ReturnType<typeof payrollFixture>["db"]) {
  return Object.fromEntries(rollbackTables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}
it.each(["", "558-payroll-keyed"]) ("serves authenticated exact payroll over prepared schema (%s)", async key => {
  const f = payrollFixture(key);
  try {
    for (const statement of payrollOffsetSchemaStatements) f.db.exec(statement);
    const middleware = createRpcMiddleware({ authBootstrapService: { isBootstrapOwner: async id => id === owner.id } });
    const composition = createExactPayrollComposition(f.db, f.lock, f.finance, f.financeRepository, middleware, { id: randomUUID, now: () => now });
    const context: RpcContext = { headers: new Headers(), resolveCurrentUser: async () => owner };
    const client = createRouterClient(composition.router, { context }) as AppClient;
    const anonymous = createRouterClient(composition.router, { context: { ...context, resolveCurrentUser: async () => null } }) as AppClient;
    const nonOwner = createRouterClient(composition.router, { context: { ...context, resolveCurrentUser: async () => ({ ...owner, id: "other-user" }) } }) as AppClient;
    const earning = f.earning("35000.00");
    const before = await client.employeePayrollGet({ employeeId: f.employeeId });
    expect(before.summary).toMatchObject({ approvedEarnings: "35000.00", wageCashPaid: "0.00", wagesOwed: "35000.00" });
    const costBefore = f.cost();
    const cashInput = { requestId: "payroll-cash-25", employeeId: f.employeeId, amount: "25000.00", paymentDate: "2026-11-18T09:00:00.000Z", wages: [{ earningId: earning.id, amount: "25000.00" }] };
    const payment = await client.employeePayrollCashRecord(cashInput);
    expect(payment).toMatchObject({ actorUserId: owner.id, actorLabel: owner.name, currency: "DZD", amount: "25000.00" });
    expect(await client.employeePayrollCashRecord(cashInput)).toEqual(payment);
    await expect(client.employeePayrollCashRecord({ ...cashInput, amount: "24000.00", wages: [{ earningId: earning.id, amount: "24000.00" }] })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await client.employeePayrollGet({ employeeId: f.employeeId })).toMatchObject({ summary: { approvedEarnings: "35000.00", wageCashPaid: "25000.00", wagesOwed: "10000.00" } });
    expect(f.cost()).toEqual(costBefore);
    expect((await client.employeePayrollGet({ employeeId: f.employeeId })).opening).toEqual({ review: "UNREVIEWED", reminder: true, wages: null, advances: null });
    const advanceEarning = f.earning("35000.00");
    const offsetEarning = f.earning("10000.00");
    const advanceCash = await client.employeePayrollCashRecord({ requestId: "payroll-advance", employeeId: f.employeeId, amount: "40000.00", paymentDate: "2026-11-18T09:00:00.000Z", wages: [{ earningId: advanceEarning.id, amount: "35000.00" }], advanceAmount: "5000.00" });
    expect(advanceCash).toMatchObject({ amount: "40000.00", wageAllocations: [{ amount: "35000.00", source: { kind: "EARNING", id: advanceEarning.id } }], advance: { amount: "5000.00" } });
    const advanceId = advanceCash.advance!.id;
    const repaymentInput = { requestId: "payroll-repay", employeeId: f.employeeId, advanceId, amount: "2000.00", paymentDate: "2026-11-19T09:00:00.000Z" };
    const repayment = await client.employeePayrollAdvanceRepay(repaymentInput);
    expect(repayment).toMatchObject({ amount: "2000.00", source: { kind: "ADVANCE", id: advanceId }, actorUserId: owner.id });
    expect(await client.employeePayrollAdvanceRepay(repaymentInput)).toEqual(repayment);
    const offsetInput = { requestId: "payroll-offset", employeeId: f.employeeId, wageSource: { kind: "EARNING" as const, id: offsetEarning.id }, advanceSource: { kind: "ADVANCE" as const, id: advanceId }, amount: "1000.00", settlementDate: "2026-11-19T09:00:00.000Z" };
    const offset = await client.employeePayrollAdvanceOffset(offsetInput);
    expect(offset).toMatchObject({ amount: "1000.00", wageSource: offsetInput.wageSource, advanceSource: offsetInput.advanceSource, actorUserId: owner.id });
    expect(await client.employeePayrollAdvanceOffset(offsetInput)).toEqual(offset);
    await expect(client.employeePayrollAdvanceOffset({ ...offsetInput, requestId: "offset-too-much", amount: "10000.00" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await client.employeePayrollGet({ employeeId: f.employeeId })).toMatchObject({
      summary: { approvedEarnings: "80000.00", wageCashPaid: "60000.00", wagesOffset: "1000.00", wagesOwed: "19000.00", advancesGiven: "5000.00", advancesCashRecovered: "2000.00", advancesOffset: "1000.00", advancesOwed: "2000.00" },
      opening: { review: "UNREVIEWED", reminder: true, wages: null, advances: null },
    });
    await expect(anonymous.employeePayrollGet({ employeeId: f.employeeId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(nonOwner.employeePayrollCashRecord({ ...cashInput, requestId: "other-owner" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(client.employeePayrollCashRecord({ ...cashInput, requestId: "forged-audit", actorUserId: "attacker" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(client.employeePayrollCashRecord({ ...cashInput, requestId: "invalid-money", amount: "0.001", wages: [{ earningId: earning.id, amount: "0.001" }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(client.employeePayrollCashRecord({ ...cashInput, requestId: "wrong-worker", employeeId: f.employee(), amount: "1.00", wages: [{ earningId: earning.id, amount: "1.00" }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const allocationFailureEarning = f.earning("35000.00");
    const allocationFailureInput = { requestId: "allocation-source-failure", employeeId: f.employeeId, amount: "25000.00", paymentDate: "2026-11-19T09:00:00.000Z", wages: [{ earningId: allocationFailureEarning.id, amount: "25000.00" }] };
    const allocationBefore = snapshot(f.db);
    f.db.exec("CREATE TRIGGER payroll_api_fail_allocation BEFORE INSERT ON employee_salary_payment_allocation BEGIN SELECT RAISE(ABORT,'forced allocation source failure'); END");
    await expect(client.employeePayrollCashRecord(allocationFailureInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Payroll operation failed." });
    expect(snapshot(f.db)).toEqual(allocationBefore);
    f.db.exec("DROP TRIGGER payroll_api_fail_allocation");
    const allocationRetry = await client.employeePayrollCashRecord(allocationFailureInput);
    expect(allocationRetry.wageAllocations).toHaveLength(1);
    expect(await client.employeePayrollCashRecord(allocationFailureInput)).toEqual(allocationRetry);
    expect((await client.employeePayrollGet({ employeeId: f.employeeId })).earnings.find(row => row.earning.id === allocationFailureEarning.id)?.remaining).toBe("10000.00");

    const receiptFailureEarning = f.earning("35000.00");
    const receiptFailureInput = { requestId: "aggregate-receipt-failure", employeeId: f.employeeId, amount: "25000.00", paymentDate: "2026-11-19T09:00:00.000Z", wages: [{ earningId: receiptFailureEarning.id, amount: "25000.00" }] };
    const receiptBefore = snapshot(f.db);
    f.db.exec("CREATE TRIGGER payroll_api_fail_aggregate_receipt BEFORE INSERT ON exact_finance_command WHEN json_type(NEW.result_json,'$.wageAllocations')='array' BEGIN SELECT RAISE(ABORT,'forced aggregate receipt failure'); END");
    await expect(client.employeePayrollCashRecord(receiptFailureInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Payroll operation failed." });
    expect(snapshot(f.db)).toEqual(receiptBefore);
    f.db.exec("DROP TRIGGER payroll_api_fail_aggregate_receipt");
    const receiptRetry = await client.employeePayrollCashRecord(receiptFailureInput);
    expect(receiptRetry.wageAllocations).toHaveLength(1);
    expect(await client.employeePayrollCashRecord(receiptFailureInput)).toEqual(receiptRetry);
    const afterRollback = await client.employeePayrollGet({ employeeId: f.employeeId });
    expect(afterRollback.cash.filter(row => row.id === allocationRetry.id || row.id === receiptRetry.id)).toHaveLength(2);
    expect(afterRollback.earnings.find(row => row.earning.id === receiptFailureEarning.id)?.remaining).toBe("10000.00");
    f.db.close();
    const reopenedDb = createDatabaseConnection(f.path, key);
    try {
      const reopenedLock = createFifoLock();
      const reopenedRepository = new SqliteExactFinanceRepository(reopenedDb, reopenedLock);
      const reopenedFinance = new ExactFinanceService(reopenedRepository, { id: randomUUID, now: () => now });
      const reopenedComposition = createExactPayrollComposition(reopenedDb, reopenedLock, reopenedFinance, reopenedRepository, middleware, { id: randomUUID, now: () => now });
      const reopenedClient = createRouterClient(reopenedComposition.router, { context }) as AppClient;
      expect(await reopenedClient.employeePayrollGet({ employeeId: f.employeeId })).toMatchObject({
        summary: { approvedEarnings: "150000.00", wageCashPaid: "110000.00", wagesOffset: "1000.00", wagesOwed: "39000.00", advancesGiven: "5000.00", advancesCashRecovered: "2000.00", advancesOffset: "1000.00", advancesOwed: "2000.00" },
        opening: { review: "UNREVIEWED", reminder: true, wages: null, advances: null },
      });
      expect(await reopenedClient.employeePayrollCashRecord(allocationFailureInput)).toEqual(allocationRetry);
      expect(await reopenedClient.employeePayrollCashRecord(receiptFailureInput)).toEqual(receiptRetry);
      const replayed = await reopenedClient.employeePayrollGet({ employeeId: f.employeeId });
      expect(replayed.cash.filter(row => row.id === allocationRetry.id || row.id === receiptRetry.id)).toHaveLength(2);
      expect(replayed.earnings.find(row => row.earning.id === allocationFailureEarning.id)?.remaining).toBe("10000.00");
      expect(replayed.earnings.find(row => row.earning.id === receiptFailureEarning.id)?.remaining).toBe("10000.00");
      const allocation = reopenedDb.prepare("SELECT id FROM employee_salary_payment_allocation LIMIT 1").get() as { id: string };
      const unrelatedEntry = reopenedDb.prepare("SELECT id FROM debt_entry WHERE id <> (SELECT debt_entry_id FROM employee_salary_payment_allocation WHERE id=?) LIMIT 1").get(allocation.id) as { id: string };
      reopenedDb.exec("DROP TRIGGER employee_salary_payment_allocation_immutable_update");
      reopenedDb.prepare("UPDATE employee_salary_payment_allocation SET debt_entry_id=? WHERE id=?").run(unrelatedEntry.id, allocation.id);
      await expect(reopenedClient.employeePayrollGet({ employeeId: f.employeeId })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Payroll operation failed." });
      const invalidOutputRouter = createPayrollRouter(reopenedComposition.services.payroll, () => ({ employeeId: f.employeeId } as never), middleware);
      const invalidOutputClient = createRouterClient(invalidOutputRouter, { context }) as AppClient;
      await expect(invalidOutputClient.employeePayrollGet({ employeeId: f.employeeId })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Payroll operation failed." });
    } finally { reopenedDb.close(); }
  } finally { f.db.close(); }
});
