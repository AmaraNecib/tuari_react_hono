import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exactInventoryDetailSchema, type AppClient } from "@tuari/contracts";
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
    catalogCreate: procedure<AppClient["inventoryItemDefinitionsCreate"]>("inventoryItemDefinitionsCreate"),
    catalogUpdate: procedure<AppClient["inventoryItemDefinitionsUpdate"]>("inventoryItemDefinitionsUpdate"),
    catalogGet: procedure<AppClient["inventoryItemDefinitionsGet"]>("inventoryItemDefinitionsGet"),
    catalogList: procedure<AppClient["inventoryItemDefinitionsList"]>("inventoryItemDefinitionsList"),
    catalogOptions: procedure<AppClient["inventoryItemDefinitionOptions"]>("inventoryItemDefinitionOptions"),
    employeesCreate: procedure<AppClient["employeesCreate"]>("employeesCreate"),
    projectsCreate: procedure<AppClient["projectsCreate"]>("projectsCreate"),
    employeeEarningsApprove: procedure<AppClient["employeeEarningsApprove"]>("employeeEarningsApprove"),
    employeePayrollCashRecord: procedure<AppClient["employeePayrollCashRecord"]>("employeePayrollCashRecord"),
    employeePayrollAdvanceOffset: procedure<AppClient["employeePayrollAdvanceOffset"]>("employeePayrollAdvanceOffset"),
    employeePayrollAdvanceRepay: procedure<AppClient["employeePayrollAdvanceRepay"]>("employeePayrollAdvanceRepay"),
    employeePayrollGet: procedure<AppClient["employeePayrollGet"]>("employeePayrollGet"),
    metadata: procedure<AppClient["financial"]["metadata"]>("financial/metadata"),
    report: procedure<AppClient["financial"]["reports"]["generate"]>("financial/reports/generate"),
    systemLog: procedure<AppClient["systemLogList"]>("systemLogList"),
    debtCreate: procedure<AppClient["financial"]["debts"]["create"]>("financial/debts/create"),
    debtDetail: procedure<AppClient["financial"]["debts"]["detail"]>("financial/debts/detail"),
  };
}

describe("selected exact Hono HTTP (not default activation)", { timeout: 60_000 }, () => {
  it.each(["", "558-http-key"])("persists exact payroll and attachment bytes while enforcing owner and write gates (%s)", async databaseKey => {
    vi.stubEnv("TUARI_LICENSE_STATUS", "trial");
    mkdirSync("D:/temp/tuari-selected-attachments", { recursive: true });
    const directory = mkdtempSync("D:/temp/tuari-selected-attachments/http-");
    const databasePath = join(directory, "application.sqlite");
    const config = createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite", API_PORT: "4318", WEB_PORT: "3000" });
    config.attachmentsRootPath = join(directory, "attachments");
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
      await expect(denied.catalogCreate({ name: "Denied", itemType: "ASSET" })).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
      for (const [path, method] of [["/api/inventory/attachments/missing", "GET"], ["/api/inventory/invoice-groups/missing/attachments", "POST"]]) {
        const response = await app.request(base + path, { method, headers: { origin, authorization: token ? `Bearer ${token}` : "" } });
        expect(response.status).toBe(401);
        expect(await response.text()).not.toContain("application mode");
        expect(response.headers.get("cache-control")).toBe("no-store, private");
      }
    }
    const definition = await client.catalogCreate({ name: "HTTP cement", itemType: "CONSUMABLE", unit: "bag" });
    if (!definition.success) throw new Error("Catalog create failed");
    expect(await client.catalogUpdate({ id: definition.item.id, name: "HTTP cement updated" })).toMatchObject({ success: true, item: { name: "HTTP cement updated" } });
    expect(await client.catalogGet({ id: definition.item.id })).toMatchObject({ success: true, item: { unit: "bag" } });
    expect((await client.catalogList({})).items).toMatchObject([{ id: definition.item.id }]);
    expect(await client.catalogOptions({ usage: { surface: "INVOICE_LINE", kind: "CONSUMABLE" }, search: "cement", limit: 1 })).toMatchObject({ total: 1, hasMore: false, items: [{ id: definition.item.id }] });
    await expect(client.request("inventoryItemDefinitionsCreate", { name: "", itemType: "CONSUMABLE" })).rejects.toMatchObject({ status: 400, code: "BAD_REQUEST" });
    const warehouse = root.operationsService.createWarehouse({ name: "HTTP depot", status: "ACTIVE" }, { actorUserId: bootstrap.item.id });
    const purchase = root.financial.services.inventory.createInvoiceGroup({ requestId: "http-stock", warehouseId: warehouse.item.id, entries: [{ kind: "CONSUMABLE", itemDefinitionId: definition.item.id, quantity: 1, unitPriceDzd: "12.3400" }] });
    const assets = root.catalogService.createItemDefinition({ name: "HTTP equipment", itemType: "ASSET" }, { actorUserId: bootstrap.item.id });
    const party = root.companyService.createExternalCounterparty({ fullName: "HTTP recipient", phoneNumber: "0555123990" }, { actorUserId: bootstrap.item.id });
    root.financial.services.inventory.createInvoiceGroup({ requestId: "http-wide-assets", warehouseId: warehouse.item.id, entries: [{ kind: "ASSET", itemDefinitionId: assets.item.id, assets: [{ assetName: "Wide", purchasePriceDzd: "9007199254740993.07" }, { assetName: "Small", purchasePriceDzd: "20.00" }] }] });
    root.financial.services.inventory.transferConsumable({ requestId: "http-transfer", inventoryEntryId: purchase.entries[0]!.id, fromWarehouseId: warehouse.item.id, toProjectId: project.item.id, quantity: 1 });
    root.financial.services.inventory.createOutboundTransfer({ requestId: "http-gift", fromType: "WAREHOUSE", fromId: warehouse.item.id, counterpartyId: party.item.id, transferType: "GIFT", items: [{ itemId: assets.item.id, quantity: 2 }] });
    await adapter.updateUser(bootstrap.item.id, { name: "Renamed owner" });
    const assertReports = async (reader: ReturnType<typeof httpClient>) => {
      const inventory = await reader.report({ type: "INVENTORY" });
      expect(inventory.type).toBe("INVENTORY");
      if (inventory.type !== "INVENTORY") throw new Error("Wrong report binding");
      expect(inventory.summary).toEqual({ totalAssetsDzd: "9007199254741013.07", totalConsumablesDzd: "12.34", totalValueDzd: "9007199254741025.41" });
      expect(inventory.byLocation).toEqual([{ locationId: warehouse.item.id, locationType: "WAREHOUSE", locationLabel: "HTTP depot", assetCount: 2, assetValueDzd: "9007199254741013.07", consumableCount: 1 }]);
      expect(inventory.byItemType).toEqual(expect.arrayContaining([expect.objectContaining({ itemName: "HTTP equipment", quantity: 2, valueDzd: "9007199254741013.07" })]));
      const movement = await reader.report({ type: "MOVEMENT" });
      if (movement.type !== "MOVEMENT") throw new Error("Wrong movement binding");
      expect(movement.summary).toEqual({ totalMovements: 6, assetTransfers: 0, consumableTransfers: 1, outboundSales: 2 });
      expect(movement.outboundDocuments).toEqual([{ transferType: "SALE", count: 0 }, { transferType: "RETURN", count: 0 }, { transferType: "GIFT", count: 1 }]);
      expect(movement.byType).toEqual([{ movementType: "PURCHASE", count: 3, valueDzd: "9007199254741025.41" }, { movementType: "TRANSFER", count: 1, valueDzd: "12.34" }, { movementType: "OUTBOUND_SALE", count: 2, valueDzd: "9007199254741013.07" }]);
      const debt = await reader.report({ type: "DEBT" });
      if (debt.type !== "DEBT") throw new Error("Wrong debt binding");
      expect(debt.byParty).toEqual(expect.arrayContaining([expect.objectContaining({ partyId: separate.item.id, outstandingDzd: "90071992547409.93" })]));
      for (const type of ["DEBT", "INVENTORY", "MOVEMENT"] as const) {
        const empty = await reader.report({ type, startDate: "1900-01-01T00:00:00.000Z", endDate: "1900-01-02T00:00:00.000Z" });
        if (empty.type === "DEBT") expect(empty.summary.totalOutstandingDzd).toBe("0.00");
        if (empty.type === "INVENTORY") expect(empty.summary.totalValueDzd).toBe("0.00");
        if (empty.type === "MOVEMENT") expect(empty.summary.totalMovements).toBe(0);
      }
      const log = await reader.systemLog({});
      expect(Object.keys(log)).toEqual(["items"]);
      const wide = log.items.find(row => row.entityLabel === "Large Debt" && row.entityType === "DEBT_ENTRY");
      expect(wide).toMatchObject({ actorUserId: bootstrap.item.id, actorLabel: "HTTP owner", actorCurrentLabel: "Renamed owner" });
      expect(wide!.detail).toContain("+90071992547409.93 دج");
      // Metadata/cash use transaction groups; debt events retain individual IDs.
      const cash = log.items.find(row => row.id === paid.transactionId);
      expect(cash).toMatchObject({ actorUserId: bootstrap.item.id, actorLabel: "HTTP owner", transactionId: paid.transactionId });
      expect(cash!.detail).toContain("25000.00 دج");
      expect(log.items.filter(row => row.transactionId === paid.transactionId)).toHaveLength(3);
      expect(log.items.filter(row => row.id === paid.transactionId)).toHaveLength(1);
      const filtered = await reader.systemLog({ actorUserId: bootstrap.item.id, entityType: "DEBT_ENTRY", entityId: wide!.entityId! });
      expect(filtered.items).toEqual([wide]);
      expect((await reader.systemLog({ fromDate: "1900-01-01T00:00:00.000Z", toDate: "1900-01-02T00:00:00.000Z" })).items).toEqual([]);
      return { inventory, movement, debt, log };
    };
    // BetterAuth session lookup can refresh bookkeeping; financial tables must stay inert.
    const databaseState = () => db.serialize();
    const beforeReports = databaseState();
    const reports = await assertReports(client);
    expect(databaseState()).toEqual(beforeReports);
    const reportTrap = vi.fn(() => { throw new Error("Report capability reached before authorization"); });
    const logTrap = vi.fn(() => { throw new Error("Log capability reached before authorization"); });
    const guardedApp = createApp({ ...root, financial: { ...root.financial, reports: { generate: reportTrap } }, listSystemLog: logTrap }, { allowedOrigins: [origin] });
    for (const token of ["", otherSession.token]) {
      const denied = httpClient(guardedApp, token);
      for (const type of ["DEBT", "INVENTORY", "MOVEMENT"] as const) await expect(denied.report({ type })).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
      await expect(denied.systemLog({})).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    }
    expect(reportTrap).not.toHaveBeenCalled();
    expect(logTrap).not.toHaveBeenCalled();
    await expect(client.request("reportsGenerate", { type: "DEBT" })).rejects.toMatchObject({ status: 503 });
    expect(databaseState()).toEqual(beforeReports);
    const headers = { origin, authorization: `Bearer ${session.token}` };
    const uploadPath = base + `/api/inventory/invoice-groups/${purchase.group.id}/attachments`;
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 0, 255]);
    const form = () => { const data = new FormData(); data.append("files", new File([bytes], "invoice proof.pdf", { type: "application/pdf" })); return data; };
    const uploaded = await app.request(uploadPath, { method: "POST", headers, body: form() });
    expect(uploaded.status).toBe(200);
    const result = await uploaded.json();
    expect(result).toMatchObject({ success: true, items: [{ invoiceGroupId: purchase.group.id, originalName: "invoice proof.pdf", mimeType: "application/pdf", byteSize: 8 }] });
    const attachment = result.items[0];
    const assertDetailAttachments = async (reader: ReturnType<typeof httpClient>) => {
      const detail = exactInventoryDetailSchema.strict().parse(await reader.request("financial/inventory/getInvoice", { id: purchase.group.id }));
      expect(detail.attachments).toEqual([{ ...attachment, downloadUrl: `/api/inventory/attachments/${attachment.id}` }]);
      expect(detail.attachments[0]!.invoiceGroupId).toBe(detail.group.id);
    };
    await assertDetailAttachments(client);
    expect(readFileSync(join(config.attachmentsRootPath, attachment.relativePath))).toEqual(Buffer.from(bytes));
    expect(db.prepare("SELECT invoice_group_id AS groupId, byte_size AS size FROM inventory_invoice_attachment WHERE id=?").get(attachment.id)).toEqual({ groupId: purchase.group.id, size: 8 });
    const downloadPath = base + `/api/inventory/attachments/${attachment.id}`;
    const assertDownload = async (target: ReturnType<typeof createApp>) => {
      // Browser attachment navigation sends neither Origin nor Referer.
      const response = await target.request(downloadPath, { headers: { authorization: headers.authorization, "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "sec-fetch-site": "same-site" } });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-length")).toBe("8");
      expect(response.headers.get("content-disposition")).toBe('inline; filename="invoice%20proof.pdf"');
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    };
    await assertDownload(app);
    for (const requestOrigin of [undefined, "https://evil.test", "null"]) {
      const guardedHeaders = { authorization: headers.authorization, ...(requestOrigin === undefined ? {} : { origin: requestOrigin }) };
      const upload = await app.request(uploadPath, { method: "POST", headers: guardedHeaders, body: form() });
      expect(upload.status).toBe(403);
      expect(await upload.json()).toEqual({ message: "Blocked origin." });
      if (requestOrigin !== undefined) {
        const download = await app.request(downloadPath, { headers: guardedHeaders });
        expect(download.status).toBe(403);
        expect(await download.json()).toEqual({ message: "Blocked origin." });
      }
    }
    const unrelated = await app.request(base + "/api/inventory/unrelated", { headers: { authorization: headers.authorization } });
    expect(unrelated.status).toBe(403);
    const missingDownload = await app.request(base + "/api/inventory/attachments/missing", { headers: { authorization: headers.authorization } });
    expect(missingDownload.status).toBe(404);
    const snapshot = db.prepare("SELECT total_changes() AS n").get();
    const storedFiles = readdirSync(config.attachmentsRootPath, { recursive: true });
    for (const token of ["", otherSession.token]) {
      const refusedHeaders = { origin, authorization: token ? `Bearer ${token}` : "" };
      expect((await app.request(uploadPath, { method: "POST", headers: refusedHeaders, body: form() })).status).toBe(401);
      expect((await app.request(downloadPath, { headers: refusedHeaders })).status).toBe(401);
      expect((await app.request(downloadPath, { headers: { authorization: refusedHeaders.authorization } })).status).toBe(401);
    }
    expect(db.prepare("SELECT total_changes() AS n").get()).toEqual(snapshot);
    expect(readdirSync(config.attachmentsRootPath, { recursive: true })).toEqual(storedFiles);
    for (const [path, method] of [["/api/inventory/attachments/missing", "GET"], ["/api/inventory/invoice-groups/missing/attachments", "POST"]]) {
      const response = await app.request(base + path, { method, headers, ...(method === "POST" ? { body: form() } : {}) });
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
    }
    for (const status of ["expired", "grace"]) {
      vi.stubEnv("TUARI_LICENSE_STATUS", status);
      const locked = await app.request(uploadPath, { method: "POST", headers, body: form() });
      expect(locked.status).toBe(403);
      expect(await locked.json()).toMatchObject({ success: false, error: { code: "UPGRADE_REQUIRED" } });
      await assertDownload(app);
    }
    expect(db.prepare("SELECT total_changes() AS n").get()).toEqual(snapshot);
    expect(readdirSync(config.attachmentsRootPath, { recursive: true })).toEqual(storedFiles);
    vi.stubEnv("TUARI_LICENSE_STATUS", "trial");
    for (const data of [
      (() => { const data = new FormData(); data.append("files", new File([bytes], "unsafe.html", { type: "text/html" })); return data; })(),
      (() => { const data = form(); for (let n = 0; n < 10; n++) data.append("files", new File([bytes], "extra.pdf", { type: "application/pdf" })); return data; })(),
    ]) {
      const invalid = await app.request(uploadPath, { method: "POST", headers, body: data });
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({ success: false, error: { code: "VALIDATION" } });
    }
    expect(db.prepare("SELECT total_changes() AS n").get()).toEqual(snapshot);
    expect(readdirSync(config.attachmentsRootPath, { recursive: true })).toEqual(storedFiles);
    db.exec("CREATE TRIGGER reject_attachment BEFORE INSERT ON inventory_invoice_attachment WHEN NEW.original_name='reject.pdf' BEGIN SELECT RAISE(ABORT,'injected metadata failure'); END");
    const failingForm = form();
    failingForm.append("files", new File([bytes], "reject.pdf", { type: "application/pdf" }));
    const failedUpload = await app.request(uploadPath, { method: "POST", headers, body: failingForm });
    expect(failedUpload.status).toBe(500);
    expect(db.prepare("SELECT COUNT(*) AS n FROM inventory_invoice_attachment").get()).toEqual({ n: 1 });
    expect(readdirSync(config.attachmentsRootPath, { recursive: true })).toEqual(storedFiles);
    db.exec("DROP TRIGGER reject_attachment");
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
    const reopenedApp = createApp(reopened, { allowedOrigins: [origin] });
    await assertDownload(reopenedApp);
    const reload = httpClient(reopenedApp, session.token);
    await assertDetailAttachments(reload);
    const reloadedReports = await assertReports(reload);
    // generatedAt belongs to each read, not durable report state.
    expect({ ...reloadedReports.inventory, generatedAt: reports.inventory.generatedAt }).toEqual(reports.inventory);
    expect({ ...reloadedReports.movement, generatedAt: reports.movement.generatedAt }).toEqual(reports.movement);
    expect({ ...reloadedReports.debt, generatedAt: reports.debt.generatedAt }).toEqual(reports.debt);
    expect(reloadedReports.log).toEqual(reports.log);
    // Replay fingerprints include recorded audit labels; restore the original
    // authenticated name before replaying the earlier mutation requests.
    await (await reopened.auth.$context).internalAdapter.updateUser(bootstrap.item.id, { name: "HTTP owner" });
    expect(await reload.employeePayrollCashRecord(wageInput)).toEqual(paid);
    expect(await reload.employeePayrollAdvanceOffset(offsetInput)).toEqual(offset);
    expect(await reload.employeePayrollAdvanceRepay(repaymentInput)).toEqual(repayment);
    expect((await reload.employeePayrollGet({ employeeId })).summary).toMatchObject(expected);
    expect((await reload.debtDetail({ id: large.id })).account.currentBalance).toBe("90071992547409.93");
  });
});
