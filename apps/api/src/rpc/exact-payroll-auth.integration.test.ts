import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRouterClient } from "@orpc/server";
import type { AppClient } from "@tuari/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { createAppConfig } from "../config";
import { createAppDependencies } from "../app/dependencies";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createFifoLock } from "../infrastructure/database/fifo-lock";
import { SqliteExactFinanceRepository } from "../modules/company/adapters/sqlite-exact-finance.repository";
import { ExactFinanceService } from "../modules/company/exact-finance.service";
import type { PayrollOpeningReviewProvider, PayrollOpeningSource } from "../modules/workforce/payroll-lifecycle";
import { payrollOffsetSchemaStatements } from "../modules/workforce/adapters/payroll-offset-schema";
import { payrollFixture, now } from "../modules/workforce/__test-utils__/payroll-native";
import { createRpcContext } from "./context";
import { createExactPayrollComposition } from "./exact-payroll-composition";
import { createRpcMiddleware } from "./rpc-middleware";

const AUTH_SECRET = "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM";
const DATABASE_KEY = "558-exact-payroll-auth-reopen-key";
const directories: string[] = [];
const roots: Array<{ close: () => void }> = [];

afterEach(() => {
  for (const root of roots.splice(0)) root.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("prepared exact payroll with real BetterAuth sessions", { timeout: 60_000 }, () => {
  it.each(["", "558-payroll-keyed"]) ("uses real owner sessions with prepared payroll storage (%s)", async key => {
    const authDirectory = mkdtempSync(join(tmpdir(), "tuari-558-payroll-auth-"));
    directories.push(authDirectory);
    const authConfig = createAppConfig({ BETTER_AUTH_SECRET: AUTH_SECRET, DB_ADAPTER: "sqlite" });
    const authRoot = await createAppDependencies({ databasePath: join(authDirectory, "auth.sqlite"), databaseKey: key ? DATABASE_KEY : undefined }, authConfig);
    roots.push(authRoot);

    const bootstrap = await authRoot.authBootstrapService.bootstrapFirstUser({ name: "Payroll owner", phone: "0612345678", password: "password123" });
    if (!bootstrap.success) throw new Error("Could not create the real bootstrap owner");
    const authContext = await authRoot.auth.$context;
    const adapter = authContext.internalAdapter as unknown as {
      createSession(userId: string): Promise<{ token: string }>;
      createUser(user: { name: string; phoneNumber: string; phoneNumberVerified: boolean }, source: { method: "test" }): Promise<{ id: string }>;
    };
    const ownerSession = await adapter.createSession(bootstrap.item.id);
    const nonowner = await adapter.createUser({ name: "Payroll nonowner", phoneNumber: "0622222222", phoneNumberVerified: true }, { method: "test" });
    const nonownerSession = await adapter.createSession(nonowner.id);
    const ownerHeaders = new Headers({ authorization: `Bearer ${ownerSession.token}` });
    const nonownerHeaders = new Headers({ authorization: `Bearer ${nonownerSession.token}` });
    expect(await authRoot.sessionService.getCurrentUser(ownerHeaders)).toMatchObject({ id: bootstrap.item.id });

    const f = payrollFixture(key);
    try {
      for (const statement of payrollOffsetSchemaStatements) f.db.exec(statement);
      const openingEmployeeId = f.employee();
      const payrollEmployeeId = f.employee();
      const openingSources: PayrollOpeningSource[] = [];
      const max = "92233720368547758.07";
      const report = "184467440737095516.14";
      const audit = { actorUserId: bootstrap.item.id, actorLabel: "Payroll owner", transactionId: randomUUID() };
      for (const kind of ["WAGE", "ADVANCE"] as const) {
        const direction = kind === "WAGE" ? "PAYABLE" : "RECEIVABLE";
        const account = f.finance.createAccount({ requestId: `opening-account-${kind}`, partyType: "INTERNAL_WORKER", workerId: openingEmployeeId, direction, currency: "DZD", ...audit });
        for (const suffix of ["one", "two"] as const) {
          const sourceId = `opening-${kind.toLowerCase()}-${suffix}`;
          const producer = f.finance.forProducer({ type: "PAYROLL_OPENING", id: sourceId });
          const original = producer.postEntry({ requestId: `${sourceId}-original`, debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: max, currency: "DZD", ...audit });
          openingSources.push({ kind, sourceId, employeeId: openingEmployeeId, currency: "DZD", amount: max, debtAccountId: account.id, debtEntryId: original.id });
          f.finance.postEntry({ requestId: `${sourceId}-unrelated-credit`, debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: `-${max}`, currency: "DZD", ...audit });
        }
      }
      const openingProviderFor = (finance: ExactFinanceService): PayrollOpeningReviewProvider => ({
        transactionIdentity: finance.transactionIdentity,
        countRows: employeeId => employeeId === openingEmployeeId ? 1 + openingSources.length : 0,
        getReview: employeeId => employeeId === openingEmployeeId ? { employeeId, state: "REVIEWED", sources: openingSources } : null,
      });
      const openingProvider = openingProviderFor(f.finance);
      const middleware = createRpcMiddleware({ authBootstrapService: authRoot.authBootstrapService });
      const composition = createExactPayrollComposition(f.db, f.lock, f.finance, f.financeRepository, middleware, { id: randomUUID, now: () => now }, openingProvider);
      const ownerContext = createRpcContext(ownerHeaders, authRoot.sessionService);
      const ownerClient = createRouterClient(composition.router, { context: ownerContext }) as AppClient;
      const anonymousClient = createRouterClient(composition.router, { context: createRpcContext(new Headers(), authRoot.sessionService) }) as AppClient;
      const nonownerClient = createRouterClient(composition.router, { context: createRpcContext(nonownerHeaders, authRoot.sessionService) }) as AppClient;

      const openingResult = await ownerClient.employeePayrollGet({ employeeId: openingEmployeeId });
      expect(openingResult.opening).toEqual({ review: "REVIEWED", reminder: false, wages: report, advances: report });
      expect(openingResult.summary).toMatchObject({ wagesOwed: report, advancesOwed: report });

      const earning = f.earning("35000.00", payrollEmployeeId);
      const paymentInput = { requestId: "real-session-payroll-25k", employeeId: payrollEmployeeId, amount: "25000.00", paymentDate: "2026-11-18T09:00:00.000Z", wages: [{ earningId: earning.id, amount: "25000.00" }] };
      const payment = await ownerClient.employeePayrollCashRecord(paymentInput);
      expect(payment).toMatchObject({ actorUserId: bootstrap.item.id, actorLabel: "Payroll owner", amount: "25000.00" });
      expect(payment.transactionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(await ownerClient.employeePayrollCashRecord(paymentInput)).toEqual(payment);
      expect((await ownerClient.employeePayrollGet({ employeeId: payrollEmployeeId })).summary).toMatchObject({ wagesOwed: "10000.00", wageCashPaid: "25000.00" });
      await expect(anonymousClient.employeePayrollGet({ employeeId: payrollEmployeeId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(nonownerClient.employeePayrollCashRecord({ ...paymentInput, requestId: "nonowner-payroll-write" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(ownerClient.employeePayrollCashRecord({ ...paymentInput, requestId: "forged-audit", actorUserId: "attacker" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });

      f.db.close();
      const reopenedDb = createDatabaseConnection(f.path, key || null);
      try {
        const reopenedLock = createFifoLock();
        const reopenedRepository = new SqliteExactFinanceRepository(reopenedDb, reopenedLock);
        const reopenedFinance = new ExactFinanceService(reopenedRepository, { id: randomUUID, now: () => now });
        const reopened = createExactPayrollComposition(reopenedDb, reopenedLock, reopenedFinance, reopenedRepository, middleware, { id: randomUUID, now: () => now }, openingProviderFor(reopenedFinance));
        const reopenedClient = createRouterClient(reopened.router, { context: createRpcContext(ownerHeaders, authRoot.sessionService) }) as AppClient;
        expect(await reopenedClient.employeePayrollCashRecord(paymentInput)).toEqual(payment);
        expect((await reopenedClient.employeePayrollGet({ employeeId: payrollEmployeeId })).summary).toMatchObject({ wagesOwed: "10000.00", wageCashPaid: "25000.00" });
        expect((await reopenedClient.employeePayrollGet({ employeeId: openingEmployeeId })).opening).toEqual({ review: "REVIEWED", reminder: false, wages: report, advances: report });
      } finally { reopenedDb.close(); }
    } finally { if (f.db.open) f.db.close(); }
  });
});
