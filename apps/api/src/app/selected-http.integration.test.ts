import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppClient } from "@tuari/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppConfig } from "../config";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createApp } from "./create-app";
import { createFreshExactAppDependencies } from "./fresh-exact-dependencies";

vi.mock("../infrastructure/database/factory", async importOriginal => {
  const actual = await importOriginal<typeof import("../infrastructure/database/factory")>();
  return { ...actual, createDatabaseConnection: vi.fn(actual.createDatabaseConnection) };
});
const origin = "http://localhost:3000";
const base = "http://127.0.0.1:4318";
const roots: Array<{ close(): void }> = [];
afterEach(() => { for (const root of roots.splice(0)) root.close(); vi.unstubAllEnvs(); });

// Use ORPC's JSON wire envelope through the production Hono app, not a direct
// router client. These procedures exchange JSON-safe strings (no serializer meta).
function httpClient(app: ReturnType<typeof createApp>, token = "") {
  const headers = { origin, authorization: token ? `Bearer ${token}` : "", "content-type": "application/json" };
  async function request(path: string, input?: unknown) {
    const response = await app.request(`${base}/rpc/${path}`, { method: "POST", headers, body: JSON.stringify({ json: input ?? null }) });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    const body = await response.json() as { json: unknown };
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), body.json, { status: response.status });
    return body.json;
  }
  function procedure<T extends (...args: never[]) => unknown>(path: string) {
    return (...args: Parameters<T>) => request(path, args[0]) as Promise<Awaited<ReturnType<T>>>;
  }
  return {
    request,
    employeesCreate: procedure<AppClient["employeesCreate"]>("employeesCreate"),
    projectsCreate: procedure<AppClient["projectsCreate"]>("projectsCreate"),
    employeeEarningsApprove: procedure<AppClient["employeeEarningsApprove"]>("employeeEarningsApprove"),
    employeePayrollCashRecord: procedure<AppClient["employeePayrollCashRecord"]>("employeePayrollCashRecord"),
    employeePayrollAdvanceOffset: procedure<AppClient["employeePayrollAdvanceOffset"]>("employeePayrollAdvanceOffset"),
    employeePayrollAdvanceRepay: procedure<AppClient["employeePayrollAdvanceRepay"]>("employeePayrollAdvanceRepay"),
    employeePayrollGet: procedure<AppClient["employeePayrollGet"]>("employeePayrollGet"),
    metadata: procedure<AppClient["financial"]["metadata"]>("financial/metadata"),
    debtCreate: procedure<AppClient["financial"]["debts"]["create"]>("financial/debts/create"),
    debtDetail: procedure<AppClient["financial"]["debts"]["detail"]>("financial/debts/detail"),
  };
}

describe("selected exact Hono HTTP (not default activation)", { timeout: 60_000 }, () => {
  it.each(["", "558-http-key"])("persists exact payroll and refuses unauthorized or stale writes (%s)", async databaseKey => {
    vi.stubEnv("TUARI_LICENSE_STATUS", "trial");
    const directory = mkdtempSync(join(tmpdir(), "tuari-558-http-"));
    const databasePath = join(directory, "application.sqlite");
    const config = createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite", API_PORT: "4318", WEB_PORT: "3000" });
    const root = await createFreshExactAppDependencies({ databasePath, databaseKey, now: () => new Date("2026-11-18T09:00:00.000Z") }, config);
    roots.push(root);
    const connectionIndex = vi.mocked(createDatabaseConnection).mock.calls.map(args => args[0]).lastIndexOf(databasePath);
    const db = vi.mocked(createDatabaseConnection).mock.results[connectionIndex]!.value;
    const app = createApp(root, { allowedOrigins: [origin] });
    const bootstrap = await root.authBootstrapService.bootstrapFirstUser({ name: "HTTP owner", phone: "0612345678", password: "password123" });
    if (!bootstrap.success) throw new Error("Bootstrap failed");
    const adapter = (await root.auth.$context).internalAdapter;
    const session = await adapter.createSession(bootstrap.item.id);
    const client = httpClient(app, session.token);
    const authResponse = await app.request(base + "/api/auth/get-session", { headers: { origin, authorization: `Bearer ${session.token}` } });
    expect(authResponse.status).toBe(200);
    expect(await authResponse.json()).toMatchObject({ user: { id: bootstrap.item.id } });
    expect(authResponse.headers.get("cache-control")).toBe("no-store, private");
    const role = root.workforceService.listRoles().items.find(item => item.key === "worker")!;
    const employee = await client.employeesCreate({ firstName: "HTTP", lastName: "Payroll", phone: "0555123987", roleId: role.id });
    if (!employee.success) throw new Error("Employee failed");
    const employeeId = employee.item.id;
    expect((await client.metadata()).employees).toMatchObject([{ id: employeeId }]);
    const project = await client.projectsCreate({ name: "HTTP project", status: "ACTIVE" });
    if (!project.success) throw new Error("Project failed");
    const earning = await client.employeeEarningsApprove({ requestId: crypto.randomUUID(), employeeId, currencyCode: "DZD", periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z", totalAmount: "35000.00", unallocatedAmount: "0.00", segments: [{ id: "http-segment", projectId: project.item.id, days: 30, amount: "35000.00" }] });
    if (!earning.success) throw new Error("Earning failed");
    const paymentDate = "2026-11-18T09:00:00.000Z";
    const wageInput = { requestId: "http-wages", employeeId, amount: "25000.00", paymentDate, wages: [{ earningId: earning.item.id, amount: "25000.00" }] };
    const paid = await client.employeePayrollCashRecord(wageInput);
    expect(paid.actorUserId).toBe(bootstrap.item.id);
    const advance = await client.employeePayrollCashRecord({ requestId: "http-advance", employeeId, amount: "5000.00", paymentDate, wages: [], advanceAmount: "5000.00" });
    const offsetInput = { requestId: "http-offset", employeeId, amount: "2000.00", settlementDate: paymentDate, wageSource: { kind: "EARNING" as const, id: earning.item.id }, advanceSource: { kind: "ADVANCE" as const, id: advance.advance!.id } };
    const offset = await client.employeePayrollAdvanceOffset(offsetInput);
    const repaymentInput = { requestId: "http-repayment", employeeId, advanceId: advance.advance!.id, amount: "1000.00", paymentDate };
    const repayment = await client.employeePayrollAdvanceRepay(repaymentInput);
    const expected = { approvedEarnings: "35000.00", wageCashPaid: "25000.00", wagesOffset: "2000.00", wagesOwed: "8000.00", advancesGiven: "5000.00", advancesCashRecovered: "1000.00", advancesOffset: "2000.00", advancesOwed: "2000.00" };
    expect((await client.employeePayrollGet({ employeeId })).summary).toMatchObject(expected);
    const separate = await client.employeesCreate({ firstName: "Large", lastName: "Debt", phone: "0555123988", roleId: role.id });
    if (!separate.success) throw new Error("Separate employee failed");
    const large = await client.debtCreate({ requestId: "http-large", partyType: "INTERNAL_WORKER", workerId: separate.item.id, direction: "PAYABLE", openingBalanceDzd: "90071992547409.93" });
    expect(large.currentBalance).toBe("90071992547409.93");
    const before = db.prepare("SELECT total_changes() AS n").get();
    await expect(client.request("debtAccountsCreate", { partyType: "INTERNAL_WORKER", workerId: employeeId, direction: "PAYABLE", openingBalanceDzd: 123 })).rejects.toMatchObject({ status: 400, code: "BAD_REQUEST" });
    await expect(client.request("employeePayrollCashRecord", { ...wageInput, requestId: "forged", actorUserId: "attacker", actorLabel: "Forged", transactionId: "forged" })).rejects.toMatchObject({ status: 400, code: "BAD_REQUEST" });
    expect(db.prepare("SELECT total_changes() AS n").get()).toEqual(before);
    const nonowner = await adapter.createUser({ name: "Nonowner", phoneNumber: "0612345679", email: "other@example.test", emailVerified: false }, { method: "email" });
    const otherSession = await adapter.createSession(nonowner.id);
    for (const token of ["", otherSession.token]) {
      const denied = httpClient(app, token);
      await expect(denied.employeePayrollCashRecord({ ...wageInput, requestId: "denied" })).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
      await expect(denied.metadata()).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
      for (const [path, method] of [["/api/inventory/attachments/missing", "GET"], ["/api/inventory/invoice-groups/missing/attachments", "POST"]]) {
        const response = await app.request(base + path, { method, headers: { origin, authorization: token ? `Bearer ${token}` : "" } });
        expect(response.status).toBe(401);
        expect(await response.text()).not.toContain("application mode");
        expect(response.headers.get("cache-control")).toBe("no-store, private");
      }
    }
    for (const [path, method] of [["/api/inventory/attachments/missing", "GET"], ["/api/inventory/invoice-groups/missing/attachments", "POST"]]) {
      const response = await app.request(base + path, { method, headers: { origin, authorization: `Bearer ${session.token}` } });
      expect(response.status).toBe(503);
    }
    vi.stubEnv("TUARI_LICENSE_STATUS", "expired");
    const locked = await app.request(base + "/api/inventory/invoice-groups/missing/attachments", { method: "POST", headers: { origin, authorization: `Bearer ${session.token}` } });
    expect(locked.status).toBe(403);
    expect(await locked.json()).toMatchObject({ success: false, error: { code: "UPGRADE_REQUIRED" } });
    vi.stubEnv("TUARI_LICENSE_STATUS", "trial");
    const malformed = await app.request(base + "/rpc/financial/metadata", { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{" });
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get("x-frame-options")).toBe("DENY");
    const limited = createApp(root, { allowedOrigins: [origin], authRateLimitMaxRequests: 1 });
    expect((await limited.request(base + "/api/auth/get-session", { headers: { origin } })).status).toBe(200);
    expect((await limited.request(base + "/api/auth/get-session", { headers: { origin } })).status).toBe(429);
    const blocked = await app.request(base + "/rpc/financial/metadata", { method: "POST", headers: { origin: "https://evil.test", "content-type": "application/json" }, body: '{"json":null}' });
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
    const oversized = await app.request(base + "/rpc/financial/metadata", { method: "POST", headers: { origin, "content-type": "application/json", "content-length": "1048577" }, body: "{}" });
    expect(oversized.status).toBe(413);
    root.close();
    const reopened = await createFreshExactAppDependencies({ databasePath, databaseKey }, config);
    roots.push(reopened);
    const reload = httpClient(createApp(reopened, { allowedOrigins: [origin] }), session.token);
    expect(await reload.employeePayrollCashRecord(wageInput)).toEqual(paid);
    expect(await reload.employeePayrollAdvanceOffset(offsetInput)).toEqual(offset);
    expect(await reload.employeePayrollAdvanceRepay(repaymentInput)).toEqual(repayment);
    expect((await reload.employeePayrollGet({ employeeId })).summary).toMatchObject(expected);
    expect((await reload.debtDetail({ id: large.id })).account.currentBalance).toBe("90071992547409.93");
  });
});
