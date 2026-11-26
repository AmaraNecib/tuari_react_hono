import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRouterClient } from "@orpc/server";
import { afterEach, expect, it } from "vitest";
import type { AppClient } from "@tuari/contracts";
import { createAppConfig } from "../config";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createExperimentalInvoiceSettlementAppDependencies } from "./fresh-exact-dependencies";
import { createFreshExactAppDependencies } from "./fresh-exact-dependencies";
import { createRpcContext } from "../rpc/context";
import { createRouter } from "../rpc/router";

const roots: { close(): void }[] = [];
afterEach(() => { for (const root of roots.splice(0)) root.close(); });
const config = () => createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite" });
const rootPath = (prefix: string) => join(mkdtempSync(join(tmpdir(), prefix)), "app.sqlite");
const sessionAdapter = async (root: { auth: { $context: Promise<unknown> } }) => (await root.auth.$context as { internalAdapter: { createSession(id: string): Promise<{ token: string }> } }).internalAdapter;
type SelectedTestRoot = Awaited<ReturnType<typeof createFreshExactAppDependencies>> | Awaited<ReturnType<typeof createExperimentalInvoiceSettlementAppDependencies>>;
const clientFor = (root: SelectedTestRoot, token: string) => createRouterClient(createRouter(root), { context: createRpcContext(new Headers({ authorization: `Bearer ${token}` }), root.sessionService) }) as AppClient;
const anonymousFor = (root: SelectedTestRoot) => createRouterClient(createRouter(root), { context: createRpcContext(new Headers(), root.sessionService) }) as AppClient;
const remainingEntry = async (client: AppClient, accountId: string, entryId: string) => (await client.financial.debts.detail({ id: accountId })).entries.find(entry => entry.id === entryId)?.remainingDzd;

it("serves invoice settlement only through the explicit authenticated root and replays after reopen", async () => {
  const databasePath = rootPath("tuari-615-authenticated-experimental-");
  const appConfig = config();
  let root = await createExperimentalInvoiceSettlementAppDependencies({ databasePath, databaseKey: "" }, appConfig);
  roots.push(root);
  const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Experimental owner", phone: "0612345601", password: "password123" });
  if (!owner.success) throw new Error("Owner bootstrap failed");
  const authAdapter = await sessionAdapter(root);
  const ownerSession = await authAdapter.createSession(owner.item.id);
  let ownerClient = clientFor(root, ownerSession.token);
  const anonymous = anonymousFor(root);

  expect(await ownerClient.financial.metadata()).toMatchObject({ capabilities: { manualSettlement: true, experimentalInvoiceSettlement: true } });
  await expect(anonymous.financial.experimentalInvoices.listInvoices({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(ownerClient.financial.invoices.listInvoices({})).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  await expect(ownerClient.financial.experimentalInvoices.getInvoice({ id: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });

  const party = await ownerClient.externalCounterpartiesCreate({ fullName: "Experimental invoice party", phoneNumber: "0555123601" });
  if (!party.success) throw new Error("Counterparty creation failed");
  const draft = await ownerClient.financial.experimentalInvoices.createInvoice({
    requestId: "route-invoice-draft", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party.item.id,
    supplierName: "Experimental supplier", invoiceNumber: "EXP-615-001", direction: "PURCHASE",
    lineItems: [{ description: "Materials", source: { mode: "agreed-total", total: "100.00", quantity: "1" } }],
  });
  const received = await ownerClient.financial.experimentalInvoices.receiveInvoice({ requestId: "route-invoice-receive", id: draft.id });
  const payment = await ownerClient.financial.experimentalInvoices.createPayment({
    requestId: "route-invoice-bank", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party.item.id,
    direction: "PURCHASE", paymentDate: "2026-11-20T00:00:00.000Z", paymentMethod: "BANK_TRANSFER", totalAmount: "20.00",
    allocations: [{ invoiceId: received.id, amount: "20.00" }],
  });
  const manual = await ownerClient.financial.debts.create({ requestId: "route-manual-receivable", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party.item.id, direction: "RECEIVABLE", openingBalanceDzd: "80.00", reasonCategory: "OTHER", reasonDetail: "Experimental settlement route" });
  const manualOriginalId = (await ownerClient.financial.debts.detail({ id: manual.id })).entries[0]!.id;
  const pair = {
    externalCounterpartyId: party.item.id, payableOriginalEntryId: received.debtEntryId!, receivableOriginalEntryId: manualOriginalId,
    currency: "DZD" as const, amountDzd: "80.00",
  };
  const preview = await ownerClient.financial.manualSettlement.preview(pair);
  expect(preview).toMatchObject({ payableRemainingDzd: "80.00", receivableRemainingDzd: "80.00", projectedPayableRemainingDzd: "0.00", projectedReceivableRemainingDzd: "0.00" });
  const confirmInput = { ...pair, requestId: "route-settle-invoice", expectedPayableRemainingDzd: "80.00", expectedReceivableRemainingDzd: "80.00" };

  const db = createDatabaseConnection(databasePath, "");
  roots.push(db);
  const operatorId = randomUUID();
  const phone = "+213555000615";
  const now = new Date().toISOString();
  db.prepare('INSERT INTO user(id,name,"phoneNumber",created_at,updated_at) VALUES (?,?,?,?,?)').run(operatorId, "Debt operator", phone, now, now);
  const role = root.workforceService.listRoles().items.find(row => row.key === "worker");
  if (!role) throw new Error("Worker role fixture is unavailable");
  db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)").run(randomUUID(), "Debt", "Operator", phone, role.id, now, now);
  db.prepare("DELETE FROM role_permission WHERE role_id=?").run(role.id);
  const permissions = ["debts:read", "debts:settle", "debts:update"];
  const grant = (permission: string) => db.prepare("INSERT INTO role_permission(id,role_id,permission,created_at,updated_at) VALUES (?,?,?,?,?)").run(randomUUID(), role.id, permission, now, now);
  for (const permission of permissions) grant(permission);
  const operatorSession = await authAdapter.createSession(operatorId);
  let operator = clientFor(root, operatorSession.token);
  await expect(operator.financial.experimentalInvoices.getInvoice({ id: received.id })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(operator.financial.experimentalInvoices.listInvoices({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  const deniedInvoiceWriteSnapshot = {
    invoice: await ownerClient.financial.experimentalInvoices.getInvoice({ id: received.id }),
    payment: await ownerClient.financial.experimentalInvoices.getPayment({ id: payment.id }),
    payable: await ownerClient.financial.debts.detail({ id: received.debtAccountId! }),
  };
  await expect(operator.financial.experimentalInvoices.voidInvoice({ requestId: "operator-void-invoice", id: received.id, reason: "Unauthorized route proof" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect({
    invoice: await ownerClient.financial.experimentalInvoices.getInvoice({ id: received.id }),
    payment: await ownerClient.financial.experimentalInvoices.getPayment({ id: payment.id }),
    payable: await ownerClient.financial.debts.detail({ id: received.debtAccountId! }),
  }).toEqual(deniedInvoiceWriteSnapshot);
  const candidates = await operator.financial.manualSettlement.candidates({ externalCounterpartyId: party.item.id });
  const invoiceCandidate = candidates.find(candidate => candidate.id === received.debtEntryId);
  expect(invoiceCandidate).toMatchObject({ id: received.debtEntryId, debtAccountId: received.debtAccountId, direction: "PAYABLE", remainingDzd: "80.00", sourceKind: "RESTRICTED" });
  expect(invoiceCandidate).not.toHaveProperty("sourceId");
  expect(invoiceCandidate).not.toHaveProperty("sourceLabel");
  const candidatesWire = JSON.stringify(candidates);
  for (const privateValue of [received.id, received.invoiceNumber!, "EXP-615-001", "Purchase invoice", "Experimental supplier"]) expect(candidatesWire).not.toContain(privateValue);
  expect(candidatesWire).not.toMatch(/\/invoices\//i);
  await expect(anonymous.financial.manualSettlement.confirm(confirmInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(anonymous.financial.manualSettlement.history({ externalCounterpartyId: party.item.id })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  const spoofed = { ...confirmInput };
  Object.assign(spoofed, { actorUserId: owner.item.id, actorLabel: "Spoofed owner" });
  await expect(operator.financial.manualSettlement.confirm(spoofed)).rejects.toMatchObject({ code: "BAD_REQUEST" });

  const confirmed = await operator.financial.manualSettlement.confirm(confirmInput);
  expect(confirmed.preview).toEqual(preview);
  const ownerSettled = await ownerClient.financial.experimentalInvoices.getInvoice({ id: received.id });
  expect(ownerSettled).toMatchObject({ status: "SETTLED", totalAmount: "100.00", paidAmount: "20.00", settledAmount: "80.00", remainingAmount: "0.00" });
  expect(await remainingEntry(ownerClient, received.debtAccountId!, received.debtEntryId!)).toBe("0.00");
  expect(await remainingEntry(ownerClient, manual.id, manualOriginalId)).toBe("0.00");
  expect((await ownerClient.financial.experimentalInvoices.getPayment({ id: payment.id })).allocations).toEqual(payment.allocations);
  const history = await operator.financial.manualSettlement.history({ externalCounterpartyId: party.item.id });
  expect(history.items[0]).toMatchObject({ id: confirmed.settlement.id, payableSource: { kind: "RESTRICTED" }, receivableSource: { kind: "MANUAL" } });
  expect(history.items[0]?.payableSource).toEqual({ kind: "RESTRICTED" });
  const historyWire = JSON.stringify(history);
  for (const privateValue of [received.id, received.invoiceNumber!, "EXP-615-001", "Purchase invoice"]) expect(historyWire).not.toContain(privateValue);
  expect(historyWire).not.toMatch(/\/invoices\//i);

  const settledSnapshot = {
    invoice: await ownerClient.financial.experimentalInvoices.getInvoice({ id: received.id }),
    payment: await ownerClient.financial.experimentalInvoices.getPayment({ id: payment.id }),
    payable: await ownerClient.financial.debts.detail({ id: received.debtAccountId! }),
    receivable: await ownerClient.financial.debts.detail({ id: manual.id }),
    history: await ownerClient.financial.manualSettlement.history({ externalCounterpartyId: party.item.id }),
  };
  db.prepare("DELETE FROM role_permission WHERE role_id=? AND permission='debts:settle'").run(role.id);
  await expect(operator.financial.manualSettlement.confirm(confirmInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect({
    invoice: await ownerClient.financial.experimentalInvoices.getInvoice({ id: received.id }),
    payment: await ownerClient.financial.experimentalInvoices.getPayment({ id: payment.id }),
    payable: await ownerClient.financial.debts.detail({ id: received.debtAccountId! }),
    receivable: await ownerClient.financial.debts.detail({ id: manual.id }),
    history: await ownerClient.financial.manualSettlement.history({ externalCounterpartyId: party.item.id }),
  }).toEqual(settledSnapshot);
  grant("debts:settle");

  root.close();
  root = await createExperimentalInvoiceSettlementAppDependencies({ databasePath, databaseKey: "" }, appConfig);
  roots.push(root);
  ownerClient = clientFor(root, ownerSession.token);
  operator = clientFor(root, operatorSession.token);
  const replayed = await operator.financial.manualSettlement.confirm(confirmInput);
  expect(replayed).toEqual(confirmed);
  expect(await ownerClient.financial.experimentalInvoices.getInvoice({ id: received.id })).toMatchObject({ status: "SETTLED", paidAmount: "20.00", settledAmount: "80.00", remainingAmount: "0.00" });
  expect(await ownerClient.financial.experimentalInvoices.getPayment({ id: payment.id })).toEqual(payment);
  const reversed = await operator.financial.manualSettlement.reverse({ requestId: "route-reverse-invoice", settlementId: confirmed.settlement.id, reason: "Route reversal proof" });
  expect(reversed.settlement.id).toBe(confirmed.settlement.id);
  expect(await ownerClient.financial.experimentalInvoices.getInvoice({ id: received.id })).toMatchObject({ status: "RECEIVED", paidAmount: "20.00", settledAmount: "0.00", remainingAmount: "80.00" });
  expect(await ownerClient.financial.experimentalInvoices.getPayment({ id: payment.id })).toEqual(payment);
  expect(await remainingEntry(ownerClient, received.debtAccountId!, received.debtEntryId!)).toBe("80.00");
  expect(await remainingEntry(ownerClient, manual.id, manualOriginalId)).toBe("80.00");
  const accountHistory = await ownerClient.financial.manualSettlement.accountHistory({ debtAccountId: received.debtAccountId! });
  expect(accountHistory.items).toContainEqual(expect.objectContaining({ id: confirmed.settlement.id, reversal: reversed.reversal, payableSource: { kind: "RESTRICTED" } }));
  const accountHistoryWire = JSON.stringify(accountHistory);
  for (const privateValue of [received.id, received.invoiceNumber!, "EXP-615-001", "Purchase invoice"]) expect(accountHistoryWire).not.toContain(privateValue);
  expect(accountHistoryWire).not.toMatch(/\/invoices\//i);
}, 60000);

it("leaves the existing exact root usable and refuses the experimental root without changing its file", async () => {
  const databasePath = rootPath("tuari-615-root-selection-");
  const appConfig = config();
  let root = await createFreshExactAppDependencies({ databasePath, databaseKey: "" }, appConfig);
  roots.push(root);
  const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Normal owner", phone: "0612345602", password: "password123" });
  if (!owner.success) throw new Error("Owner bootstrap failed");
  const token = await (await sessionAdapter(root)).createSession(owner.item.id);
  const client = clientFor(root, token.token);
  expect(await client.financial.metadata()).toMatchObject({ capabilities: { manualSettlement: false, experimentalInvoiceSettlement: false } });
  await expect(client.financial.experimentalInvoices.listInvoices({})).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  const party = await client.externalCounterpartiesCreate({ fullName: "Normal invoice party", phoneNumber: "0555123602" });
  if (!party.success) throw new Error("Counterparty creation failed");
  const invoice = await client.financial.invoices.createInvoice({ requestId: "normal-invoice", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party.item.id, supplierName: "Normal supplier", direction: "PURCHASE", lineItems: [{ description: "Normal source", source: { mode: "agreed-total", total: "12.00", quantity: "1" } }] });
  roots.splice(roots.indexOf(root), 1);
  root.close();
  const digest = createHash("sha256").update(readFileSync(databasePath)).digest("hex");
  await expect(createExperimentalInvoiceSettlementAppDependencies({ databasePath, databaseKey: "" }, appConfig)).rejects.toThrow(/unsupported experimental invoice settlement schema/i);
  expect(createHash("sha256").update(readFileSync(databasePath)).digest("hex")).toBe(digest);
  root = await createFreshExactAppDependencies({ databasePath, databaseKey: "" }, appConfig);
  roots.push(root);
  const reopened = clientFor(root, token.token);
  expect(await reopened.financial.invoices.getInvoice({ id: invoice.id })).toMatchObject({ id: invoice.id, status: "DRAFT", totalAmount: "12.00" });
  await expect(reopened.financial.experimentalInvoices.getInvoice({ id: invoice.id })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
});
