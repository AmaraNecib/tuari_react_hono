import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRouterClient } from "@orpc/server";
import type { AppClient } from "@tuari/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFreshExactAppDependencies } from "../app/fresh-exact-dependencies";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createFinancialDependencies } from "../app/financial-dependencies";
import { createCompanyRepository } from "../config/database";
import { createExactProjectCostRepository } from "../modules/project-cost/adapters/sqlite-exact-project-cost.repository";
import { createAppConfig } from "../config";
import { createRpcContext } from "./context";
import { createRouter } from "./router";

vi.mock("../modules/company/finance.service", () => ({ FinanceService: class { constructor() { throw new Error("Legacy finance constructed"); } } }));
vi.mock("../modules/company/company.service", () => ({ CompanyService: class { constructor() { throw new Error("Legacy company constructed"); } } }));
vi.mock("../modules/invoice/invoice.module", () => ({ InvoiceModule: class { constructor() { throw new Error("Legacy invoice constructed"); } } }));
vi.mock("../modules/payment/payment.module", () => ({ createPaymentModule: () => { throw new Error("Legacy payment constructed"); } }));
vi.mock("../modules/expenses/expenses.module", async importOriginal => ({ ...await importOriginal<typeof import("../modules/expenses/expenses.module")>(), createExpensesModule: () => { throw new Error("Legacy expenses constructed"); } }));

vi.mock("../infrastructure/database/factory", async importOriginal => {
  const actual = await importOriginal<typeof import("../infrastructure/database/factory")>();
  return { ...actual, createDatabaseConnection: vi.fn(actual.createDatabaseConnection) };
});
vi.mock("../app/financial-dependencies", async importOriginal => {
  const actual = await importOriginal<typeof import("../app/financial-dependencies")>();
  return { ...actual, createFinancialDependencies: vi.fn(actual.createFinancialDependencies) };
});
vi.mock("../config/database", async importOriginal => {
  const actual = await importOriginal<typeof import("../config/database")>();
  return { ...actual, createCompanyRepository: vi.fn(actual.createCompanyRepository) };
});
vi.mock("../modules/project-cost/adapters/sqlite-exact-project-cost.repository", async importOriginal => {
  const actual = await importOriginal<typeof import("../modules/project-cost/adapters/sqlite-exact-project-cost.repository")>();
  return { ...actual, createExactProjectCostRepository: vi.fn(actual.createExactProjectCostRepository) };
});

const roots: Array<{ close(): void }> = [];
afterEach(() => { for (const root of roots.splice(0)) root.close(); });

// No injected payroll graph or payroll fixtures: the selected exact root must supply
// auth, earning storage and the single finance ledger on its own connection.
describe("selected exact application startup (not default activation)", { timeout: 60_000 }, () => {
  it("shares salary settlement with debt reads without duplicate expense or attribution netting (#560)", async () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), "tuari-560-")), "application.sqlite");
    const config = createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite" });
    const root = await createFreshExactAppDependencies({ databasePath }, config);
    roots.push(root);
    const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Debt owner", phone: "0612345678", password: "password123" });
    if (!owner.success) throw new Error("Bootstrap failed");
    const session = await (await root.auth.$context).internalAdapter.createSession(owner.item.id);
    const headers = new Headers({ authorization: `Bearer ${session.token}` });
    const connect = (app: typeof root) => createRouterClient(createRouter(app), { context: createRpcContext(headers, app.sessionService) }) as AppClient;
    const client = connect(root);
    const role = root.workforceService.listRoles().items.find(item => item.key === "worker")!;
    const employee = await client.employeesCreate({ firstName: "Debt", lastName: "Worker", phone: "0555123987", roleId: role.id });
    const project = await client.projectsCreate({ name: "Salary cost", status: "ACTIVE" });
    if (!employee.success || !project.success) throw new Error("Fixture failed");
    const employeeId = employee.item.id;
    const earning = await client.employeeEarningsApprove({
      requestId: crypto.randomUUID(), employeeId, currencyCode: "DZD",
      periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z",
      totalAmount: "60000.00", unallocatedAmount: "0.00",
      segments: [{ id: "labor", projectId: project.item.id, days: 30, amount: "60000.00" }],
    });
    // A separate period has unallocated attribution, not an unpaid balance.
    const unrelated = await client.employeeEarningsApprove({
      requestId: crypto.randomUUID(), employeeId, currencyCode: "DZD",
      periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-11-01T00:00:00.000Z",
      totalAmount: "15000.00", unallocatedAmount: "15000.00", segments: [],
    });
    if (!earning.success || !unrelated.success) throw new Error("Approval failed");
    expect((await client.financial.debts.summary()).grossPayableDzd).toBe("0.00");
    const paymentDate = "2026-11-18T09:00:00.000Z";
    const input = { requestId: "debt-salary-560", employeeId, amount: "60000.00", paymentDate,
      wages: [{ earningId: earning.item.id, amount: "40000.00" }, { earningId: unrelated.item.id, amount: "15000.00" }], advanceAmount: "5000.00" };
    const paid = await client.employeePayrollCashRecord(input);
    expect(await client.employeePayrollCashRecord(input)).toEqual(paid);
    const assertRead = async (api: AppClient, wagesOwed: string) => {
      const salary = await api.employeePayrollGet({ employeeId });
      expect(salary.summary).toMatchObject({ wagesOwed, advancesOwed: "5000.00", unallocatedEarnings: "15000.00" });
      expect(salary.earnings.find(row => row.earning.id === earning.item.id)?.remaining).toBe(wagesOwed);
      const debts = await api.financial.debts.summary();
      expect(debts).toMatchObject({ grossPayableDzd: wagesOwed, grossReceivableDzd: "5000.00" });
      const cost = await api.projectCostGet({ projectId: project.item.id });
      expect(cost).toMatchObject({ success: true, item: { parts: { salariesAmount: "60000.00" } } });
      return debts;
    };
    const before = await assertRead(client, "20000.00");
    const connectionIndex = vi.mocked(createDatabaseConnection).mock.calls.map(args => args[0]).lastIndexOf(databasePath);
    const db = vi.mocked(createDatabaseConnection).mock.results[connectionIndex]!.value;
    const changes = () => db.prepare("SELECT total_changes() AS n").get();
    const readChanges = changes();
    expect(await assertRead(client, "20000.00")).toEqual(before);
    expect(changes()).toEqual(readChanges);
    root.close();
    const reopened = await createFreshExactAppDependencies({ databasePath }, config);
    roots.push(reopened);
    const reload = connect(reopened);
    await assertRead(reload, "20000.00");
    const finalInput = { requestId: "debt-final-560", employeeId, amount: "20000.00", paymentDate, wages: [{ earningId: earning.item.id, amount: "20000.00" }] };
    const final = await reload.employeePayrollCashRecord(finalInput);
    expect(await reload.employeePayrollCashRecord(finalInput)).toEqual(final);
    const settled = await assertRead(reload, "0.00");
    expect(settled.accounts).toHaveLength(before.accounts.length);
    reopened.close();
    const last = await createFreshExactAppDependencies({ databasePath }, config);
    roots.push(last);
    await assertRead(connect(last), "0.00");
  });
  it.each(["", "selected-exact-test-key"])("persists selected-root payments and metadata (key=%s)", async databaseKey => {
    const directory = mkdtempSync(join(tmpdir(), "tuari-558-selected-root-"));
    const databasePath = join(directory, "application.sqlite");
    const config = createAppConfig({
      BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM",
      DB_ADAPTER: "sqlite",
    });
    const root = await createFreshExactAppDependencies({ databasePath, databaseKey }, config);
    roots.push(root);
    const connectionIndex = vi.mocked(createDatabaseConnection).mock.calls.map(args => args[0]).lastIndexOf(databasePath);
    const db = vi.mocked(createDatabaseConnection).mock.results[connectionIndex]!.value;
    const financialArgs = vi.mocked(createFinancialDependencies).mock.calls.at(-1)!;
    expect(financialArgs[0]).toBe(db);
    expect(vi.mocked(createCompanyRepository).mock.calls.at(-1)![0]).toBe(db);
    expect(vi.mocked(createCompanyRepository).mock.calls.at(-1)![2]).toBe(financialArgs[1]);
    expect(vi.mocked(createExactProjectCostRepository).mock.calls.at(-1)).toEqual([db, financialArgs[1]]);
    const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Payroll owner", phone: "0612345678", password: "password123" });
    if (!owner.success) throw new Error("Owner bootstrap failed");
    const adapter = (await root.auth.$context).internalAdapter as unknown as { createSession(id: string): Promise<{ token: string }> };
    const session = await adapter.createSession(owner.item.id);
    const headers = new Headers({ authorization: `Bearer ${session.token}` });
    const client = createRouterClient(createRouter(root), { context: createRpcContext(headers, root.sessionService) }) as AppClient;
    const counterparty = await client.externalCounterpartiesCreate({ fullName: "Selected supplier", phoneNumber: "0612345675" });
    if (!counterparty.success) throw new Error("Counterparty create failed");
    expect((await client.externalCounterpartiesList()).items).toMatchObject([{ id: counterparty.item.id }]);
    expect(await client.externalCounterpartiesGet({ id: counterparty.item.id })).toMatchObject({ success: true, item: { fullName: "Selected supplier" } });
    const catalog = await client.inventoryItemDefinitionsCreate({ name: "Selected sand", itemType: "CONSUMABLE", unit: "kg" });
    if (!catalog.success) throw new Error("Catalog create failed");
    const updated = await client.inventoryItemDefinitionsUpdate({ id: catalog.item.id, name: "Updated sand", itemType: "CONSUMABLE", unit: "kg", isActive: true });
    expect(updated).toMatchObject({ success: true, item: { name: "Updated sand" } });
    expect(await client.inventoryItemDefinitionsGet({ id: catalog.item.id })).toMatchObject({ success: true, item: { name: "Updated sand" } });
    expect((await client.inventoryItemDefinitionsList()).items).toMatchObject([{ id: catalog.item.id }]);
    await expect(client.reportsGenerate({ type: "DEBT" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(await client.systemLogList()).toHaveProperty("items");
    for (const type of ["DEBT", "INVENTORY", "MOVEMENT"] as const) {
      expect(await client.financial.reports.generate({ type })).toMatchObject({ type });
    }
    await expect(client.workspaceSnapshot()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    const changes = () => db.prepare("SELECT total_changes() AS n").get();
    const beforeStale = changes();
    await expect(client.debtAccountsCreate({ partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: counterparty.item.id, direction: "PAYABLE", openingBalanceDzd: 123 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(client.paymentsCreate({ counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: counterparty.item.id, totalAmount: 100, paymentMethod: "CASH", allocations: [{ invoiceId: "8ac75d9d-25a5-4a66-8190-36bf09c71c1e", amount: 100 }], paymentDate: "2026-11-18T09:00:00.000Z" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("retired") });
    expect(changes()).toEqual(beforeStale);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const holder = financialArgs[1].run(async () => { entered(); await gate; });
    await started;
    try {
      await expect(client.financial.debts.create({ requestId: "foreign-lock", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: counterparty.item.id, direction: "PAYABLE", openingBalanceDzd: "1.00" })).rejects.toBeDefined();
      expect(changes()).toEqual(beforeStale);
    } finally { release(); await holder; }
    const externalDebt = await client.financial.debts.create({ requestId: "external-history", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: counterparty.item.id, direction: "PAYABLE", openingBalanceDzd: "4.20" });
    // There is no counterparty-delete RPC. Persistence must still restrict
    // deletion of a party referenced by actual producer-owned finance history.
    expect(() => db.prepare("DELETE FROM external_counterparty WHERE id=?").run(counterparty.item.id)).toThrow(/FOREIGN KEY/);
    expect((await client.financial.debts.detail({ id: externalDebt.id })).account.currentBalance).toBe("4.20");
    const role = root.workforceService.listRoles().items.find(item => item.key === "worker")!;
    const employee = await client.employeesCreate({ firstName: "Exact", lastName: "Payroll", phone: "0555123987", roleId: role.id, salaryReference: { period: "MONTHLY", amount: "30000.00" } });
    if (!employee.success) throw new Error("Employee creation failed");
    const employeeId = employee.item.id;
    expect((await client.financial.metadata()).employees).toMatchObject([{ id: employeeId }]);
    const debt = await client.financial.debts.create({ requestId: "selected-root-manual-debt", partyType: "INTERNAL_WORKER", workerId: employeeId, direction: "RECEIVABLE", openingBalanceDzd: "1.25" });
    expect(debt.currentBalance).toBe("1.25");
    // Debt-only history must also refuse deletion, before any earning exists.
    expect(await client.employeesDelete({ id: employeeId })).toMatchObject({ success: false, error: { code: "BUSINESS_RULE" } });
    expect((await client.financial.debts.detail({ id: debt.id })).account.currentBalance).toBe("1.25");
    await expect(client.debtAccountsList()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(client.salaryPaymentsList()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const regularUser = await (await root.auth.$context).internalAdapter.createUser({ name: "Not owner", phoneNumber: "0612345679", email: "nonowner@example.test", emailVerified: false }, { method: "email" });
    const regularSession = await adapter.createSession(regularUser.id);
    const regular = createRouterClient(createRouter(root), { context: createRpcContext(new Headers({ authorization: `Bearer ${regularSession.token}` }), root.sessionService) }) as AppClient;
    await expect(regular.employeePayrollCashRecord({ requestId: "nonowner", employeeId, amount: "1.00", paymentDate: "2026-11-18T09:00:00.000Z", wages: [], advanceAmount: "1.00" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(regular.externalCounterpartiesCreate({ fullName: "Forbidden", phoneNumber: "0611111111" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(regular.inventoryItemDefinitionsCreate({ name: "Forbidden", itemType: "CONSUMABLE", unit: "kg" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const disposable = await client.employeesCreate({ firstName: "No", lastName: "History", phone: "0555123988", roleId: role.id });
    if (!disposable.success) throw new Error("Disposable employee create failed");
    expect(await client.employeesDelete({ id: disposable.item.id })).toMatchObject({ success: true });
    const project = await client.projectsCreate({ name: "Payroll project", status: "ACTIVE" });
    if (!project.success) throw new Error("Project creation failed");
    const earning = await client.employeeEarningsApprove({
      requestId: "c14fdd02-3b27-4b05-a858-4bba1069ba4b", employeeId, currencyCode: "DZD",
      periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z",
      totalAmount: "35000.00", unallocatedAmount: "0.00",
      segments: [{ id: "selected-root-segment", projectId: project.item.id, days: 30, amount: "35000.00" }],
    });
    if (!earning.success) throw new Error("Earning approval failed");
    const paymentDate = "2026-11-18T09:00:00.000Z";
    const wageInput = { requestId: "selected-root-wage", employeeId, amount: "25000.00", paymentDate, wages: [{ earningId: earning.item.id, amount: "25000.00" }] };
    const paid = await client.employeePayrollCashRecord(wageInput);
    expect(paid.actorUserId).toBe(owner.item.id);
    expect(await client.employeePayrollCashRecord(wageInput)).toEqual(paid);
    const advance = await client.employeePayrollCashRecord({ requestId: "selected-root-advance", employeeId, amount: "5000.00", paymentDate, wages: [], advanceAmount: "5000.00" });
    const offsetInput = { requestId: "selected-root-offset", employeeId, amount: "2000.00", settlementDate: paymentDate, wageSource: { kind: "EARNING" as const, id: earning.item.id }, advanceSource: { kind: "ADVANCE" as const, id: advance.advance!.id } };
    const offset = await client.employeePayrollAdvanceOffset(offsetInput);
    const repaymentInput = { requestId: "selected-root-repayment", employeeId, advanceId: advance.advance!.id, amount: "1000.00", paymentDate };
    const repayment = await client.employeePayrollAdvanceRepay(repaymentInput);
    expect((await client.employeePayrollGet({ employeeId })).summary).toMatchObject({ approvedEarnings: "35000.00", wageCashPaid: "25000.00", wagesOffset: "2000.00", wagesOwed: "8000.00", advancesGiven: "5000.00", advancesCashRecovered: "1000.00", advancesOffset: "2000.00", advancesOwed: "2000.00" });
    const payrollBeforeDelete = await client.employeePayrollGet({ employeeId });
    expect(await client.employeesDelete({ id: employeeId })).toMatchObject({ success: false, error: { code: "BUSINESS_RULE" } });
    expect(await client.employeePayrollGet({ employeeId })).toEqual(payrollBeforeDelete);
    expect((await client.employeeEarningsList({ employeeId })).items).toMatchObject([{ id: earning.item.id }]);
    expect(await client.employeesGet({ id: employeeId })).toMatchObject({ success: true, item: { id: employeeId } });
    expect((await client.financial.invoices.listInvoices({})).items).toEqual([]);
    expect(await client.financial.inventory.definitions()).toMatchObject([{ id: catalog.item.id }]);
    const expense = await client.financial.expenses.expensesCreate({ id: crypto.randomUUID(), amount: "0.25", projectId: project.item.id, expenseDate: paymentDate });
    expect(expense).toMatchObject({ amount: "0.25", currency: "DZD", actorUserId: owner.item.id });
    await client.financial.expenses.expensesVoid({ id: expense.id });
    root.close();
    const reopened = await createFreshExactAppDependencies({ databasePath, databaseKey }, config);
    roots.push(reopened);
    const reload = createRouterClient(createRouter(reopened), { context: createRpcContext(headers, reopened.sessionService) }) as AppClient;
    expect(await reload.employeePayrollCashRecord(wageInput)).toEqual(paid);
    expect(await reload.employeePayrollAdvanceOffset(offsetInput)).toEqual(offset);
    expect(await reload.employeePayrollAdvanceRepay(repaymentInput)).toEqual(repayment);
    expect((await reload.employeePayrollGet({ employeeId })).summary).toMatchObject({ wagesOwed: "8000.00", advancesOwed: "2000.00" });
    expect((await reload.financial.debts.detail({ id: debt.id })).account.currentBalance).toBe("2001.25");
    const projectCost = await reload.projectCostGet({ projectId: project.item.id });
    if (!projectCost.success) throw new Error("Project cost read failed");
    expect(projectCost.item.parts.salariesAmount).toBe("35000.00");
    const anonymous = createRouterClient(createRouter(reopened), { context: createRpcContext(new Headers(), reopened.sessionService) }) as AppClient;
    await expect(anonymous.financial.metadata()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anonymous.externalCounterpartiesCreate({ fullName: "Forbidden", phoneNumber: "0611111111" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anonymous.inventoryItemDefinitionsCreate({ name: "Forbidden", itemType: "CONSUMABLE", unit: "kg" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anonymous.employeePayrollCashRecord(wageInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
