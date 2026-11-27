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

  expect(await ownerClient.financial.metadata()).toMatchObject({ capabilities: { manualSettlement: true, experimentalInvoiceSettlement: true, experimentalSettlement: true } });
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

it("reveals validated invoice labels only to the bootstrap owner through the experimental settlement namespace", async () => {
  const databasePath = rootPath("tuari-615-source-visibility-");
  const appConfig = config();
  const root = await createExperimentalInvoiceSettlementAppDependencies({ databasePath, databaseKey: "" }, appConfig);
  roots.push(root);
  const bootstrapped = await root.authBootstrapService.bootstrapFirstUser({ name: "Source owner", phone: "0612345615", password: "password123" });
  if (!bootstrapped.success) throw new Error("Owner bootstrap failed");
  const authAdapter = await sessionAdapter(root);
  const ownerSession = await authAdapter.createSession(bootstrapped.item.id);
  const owner = clientFor(root, ownerSession.token);
  const party = await owner.externalCounterpartiesCreate({ fullName: "Source visibility party", phoneNumber: "0555123615" });
  if (!party.success) throw new Error("Counterparty creation failed");
  const purchaseDraft = await owner.financial.experimentalInvoices.createInvoice({
    requestId: "source-purchase-draft", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party.item.id,
    supplierName: "Private purchase supplier", invoiceNumber: "SRC-615-PUR-001", direction: "PURCHASE",
    lineItems: [{ description: "Purchase source", source: { mode: "agreed-total", total: "100.00", quantity: "1" } }],
  });
  const purchase = await owner.financial.experimentalInvoices.receiveInvoice({ requestId: "source-purchase-receive", id: purchaseDraft.id });
  const saleDraft = await owner.financial.experimentalInvoices.createInvoice({
    requestId: "source-sale-draft", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party.item.id,
    supplierName: "Private sale customer", direction: "SALE",
    lineItems: [{ description: "Sale source", source: { mode: "agreed-total", total: "40.00", quantity: "1" } }],
  });
  const sale = await owner.financial.experimentalInvoices.receiveInvoice({ requestId: "source-sale-receive", id: saleDraft.id });
  const purchaseLabel = `فاتورة شراء ${purchase.invoiceNumber}`;
  const saleLabel = `فاتورة بيع ${sale.id}`;

  const db = createDatabaseConnection(databasePath, "");
  roots.push(db);
  const now = new Date().toISOString();
  const addActor = async (name: string, key: string, suffix: string, permissions: string[]) => {
    const userId = randomUUID();
    const phone = `+213555615${suffix}`;
    const roleId = randomUUID();
    db.prepare('INSERT INTO user(id,name,"phoneNumber",created_at,updated_at) VALUES (?,?,?,?,?)').run(userId, name, phone, now, now);
    db.prepare("INSERT INTO role(id,key,name,description,is_system,created_at,updated_at) VALUES (?,?,?,?,0,?,?)").run(roleId, key, name, null, now, now);
    db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)").run(randomUUID(), name, "Test", phone, roleId, now, now);
    for (const permission of permissions) db.prepare("INSERT INTO role_permission(id,role_id,permission,created_at,updated_at) VALUES (?,?,?,?,?)").run(randomUUID(), roleId, permission, now, now);
    const session = await authAdapter.createSession(userId);
    return clientFor(root, session.token);
  };
  const operator = await addActor("Debt operator", "source-debt-operator", "001", ["debts:read", "debts:settle", "debts:update"]);
  const reader = await addActor("Invoice reader", "source-invoice-reader", "002", ["debts:read", "invoices:read"]);
  const operatorRole = db.prepare("SELECT id FROM role WHERE key='source-debt-operator'").get() as { id: string };
  const purchaseCandidate = (rows: Awaited<ReturnType<typeof owner.financial.experimentalSettlement.candidates>>, id: string) => rows.find(row => row.id === id);

  const ownerCandidates = await owner.financial.experimentalSettlement.candidates({ externalCounterpartyId: party.item.id });
  expect(purchaseCandidate(ownerCandidates, purchase.debtEntryId!)).toMatchObject({ sourceKind: "INVOICE_PURCHASE", sourceId: purchase.id, sourceLabel: purchaseLabel });
  expect(purchaseCandidate(ownerCandidates, sale.debtEntryId!)).toMatchObject({ sourceKind: "INVOICE_SALE", sourceId: sale.id, sourceLabel: saleLabel });
  const legacyOwnerCandidates = await owner.financial.manualSettlement.candidates({ externalCounterpartyId: party.item.id });
  for (const invoiceEntryId of [purchase.debtEntryId!, sale.debtEntryId!]) {
    expect(legacyOwnerCandidates.find(row => row.id === invoiceEntryId)).toMatchObject({ sourceKind: "RESTRICTED" });
  }
  const legacyWire = JSON.stringify(legacyOwnerCandidates);
  for (const privateValue of [purchase.id, purchase.invoiceNumber!, sale.id, "Private purchase supplier", "Private sale customer"]) expect(legacyWire).not.toContain(privateValue);

  const readerCandidates = await reader.financial.experimentalSettlement.candidates({ externalCounterpartyId: party.item.id });
  for (const invoiceEntryId of [purchase.debtEntryId!, sale.debtEntryId!]) {
    expect(readerCandidates.find(row => row.id === invoiceEntryId)).toMatchObject({ sourceKind: "RESTRICTED" });
  }
  const readerCandidateWire = JSON.stringify(readerCandidates);
  for (const privateValue of [purchase.id, purchase.invoiceNumber!, sale.id, purchaseLabel, saleLabel]) expect(readerCandidateWire).not.toContain(privateValue);
  expect(readerCandidateWire).not.toMatch(/\/invoices\//i);
  await expect(reader.financial.experimentalInvoices.getInvoice({ id: purchase.id })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(reader.financial.experimentalInvoices.listInvoices({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  const beforeDeniedWrite = {
    purchase: await owner.financial.experimentalInvoices.getInvoice({ id: purchase.id }),
    sale: await owner.financial.experimentalInvoices.getInvoice({ id: sale.id }),
  };
  await expect(reader.financial.experimentalInvoices.voidInvoice({ requestId: "reader-void-source", id: purchase.id, reason: "Reader write refusal" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect({
    purchase: await owner.financial.experimentalInvoices.getInvoice({ id: purchase.id }),
    sale: await owner.financial.experimentalInvoices.getInvoice({ id: sale.id }),
  }).toEqual(beforeDeniedWrite);

  const pair = {
    externalCounterpartyId: party.item.id,
    payableOriginalEntryId: purchase.debtEntryId!,
    receivableOriginalEntryId: sale.debtEntryId!,
    currency: "DZD" as const,
    amountDzd: "10.00",
  };
  const preview = await operator.financial.experimentalSettlement.preview(pair);
  expect(preview).toMatchObject({ payableRemainingDzd: "100.00", receivableRemainingDzd: "40.00" });
  const confirmInput = { ...pair, requestId: "source-visibility-confirm", expectedPayableRemainingDzd: "100.00", expectedReceivableRemainingDzd: "40.00" };
  const beforePermissionRefusal = {
    purchase: await owner.financial.experimentalInvoices.getInvoice({ id: purchase.id }),
    sale: await owner.financial.experimentalInvoices.getInvoice({ id: sale.id }),
    payable: await owner.financial.debts.detail({ id: purchase.debtAccountId! }),
    receivable: await owner.financial.debts.detail({ id: sale.debtAccountId! }),
    history: await owner.financial.experimentalSettlement.history({ externalCounterpartyId: party.item.id }),
  };
  db.prepare("DELETE FROM role_permission WHERE role_id=? AND permission='debts:settle'").run(operatorRole.id);
  await expect(operator.financial.experimentalSettlement.confirm(confirmInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect({
    purchase: await owner.financial.experimentalInvoices.getInvoice({ id: purchase.id }),
    sale: await owner.financial.experimentalInvoices.getInvoice({ id: sale.id }),
    payable: await owner.financial.debts.detail({ id: purchase.debtAccountId! }),
    receivable: await owner.financial.debts.detail({ id: sale.debtAccountId! }),
    history: await owner.financial.experimentalSettlement.history({ externalCounterpartyId: party.item.id }),
  }).toEqual(beforePermissionRefusal);
  db.prepare("INSERT INTO role_permission(id,role_id,permission,created_at,updated_at) VALUES (?,?,?,?,?)").run(randomUUID(), operatorRole.id, "debts:settle", now, now);
  const confirmed = await operator.financial.experimentalSettlement.confirm(confirmInput);
  const ownerHistory = await owner.financial.experimentalSettlement.history({ externalCounterpartyId: party.item.id });
  expect(ownerHistory.items[0]).toMatchObject({
    id: confirmed.settlement.id,
    amountDzd: "10.00",
    actorUserId: confirmed.settlement.actorUserId,
    actorLabel: confirmed.settlement.actorLabel,
    recordedAt: confirmed.settlement.recordedAt,
    note: null,
    reversal: null,
    payableSource: { kind: "INVOICE_PURCHASE", id: purchase.id, label: purchaseLabel },
    receivableSource: { kind: "INVOICE_SALE", id: sale.id, label: saleLabel },
  });
  const legacyHistory = await owner.financial.manualSettlement.history({ externalCounterpartyId: party.item.id });
  expect(legacyHistory.items[0]).toMatchObject({ payableSource: { kind: "RESTRICTED" }, receivableSource: { kind: "RESTRICTED" } });
  const ownerPurchaseHistory = await owner.financial.experimentalSettlement.accountHistory({ debtAccountId: purchase.debtAccountId! });
  const ownerSaleHistory = await owner.financial.experimentalSettlement.accountHistory({ debtAccountId: sale.debtAccountId! });
  expect(ownerPurchaseHistory.items[0]?.payableSource).toEqual({ kind: "INVOICE_PURCHASE", id: purchase.id, label: purchaseLabel });
  expect(ownerSaleHistory.items[0]?.receivableSource).toEqual({ kind: "INVOICE_SALE", id: sale.id, label: saleLabel });

  for (const client of [operator, reader]) {
    const restrictedHistory = await client.financial.experimentalSettlement.history({ externalCounterpartyId: party.item.id });
    expect(restrictedHistory.items[0]).toMatchObject({ payableSource: { kind: "RESTRICTED" }, receivableSource: { kind: "RESTRICTED" } });
    const restrictedPurchaseHistory = await client.financial.experimentalSettlement.accountHistory({ debtAccountId: purchase.debtAccountId! });
    const restrictedSaleHistory = await client.financial.experimentalSettlement.accountHistory({ debtAccountId: sale.debtAccountId! });
    expect(restrictedPurchaseHistory.items[0]?.payableSource).toEqual({ kind: "RESTRICTED" });
    expect(restrictedSaleHistory.items[0]?.receivableSource).toEqual({ kind: "RESTRICTED" });
    const historyWire = JSON.stringify([restrictedHistory, restrictedPurchaseHistory, restrictedSaleHistory]);
    for (const privateValue of [purchase.id, purchase.invoiceNumber!, sale.id, purchaseLabel, saleLabel, "Private purchase supplier", "Private sale customer"]) expect(historyWire).not.toContain(privateValue);
    expect(historyWire).not.toMatch(/\/invoices\//i);
  }

  const reversed = await operator.financial.experimentalSettlement.reverse({ requestId: "source-visibility-reverse", settlementId: confirmed.settlement.id, reason: "Source visibility reversal" });
  expect(reversed.settlement.id).toBe(confirmed.settlement.id);
  expect((await owner.financial.experimentalSettlement.accountHistory({ debtAccountId: purchase.debtAccountId! })).items[0]).toMatchObject({
    reversal: reversed.reversal,
    payableSource: { kind: "INVOICE_PURCHASE", id: purchase.id, label: purchaseLabel },
  });
  await owner.financial.experimentalInvoices.voidInvoice({ requestId: "source-history-cancel", id: purchase.id, reason: "Cancel after reversal" });
  expect((await owner.financial.experimentalSettlement.history({ externalCounterpartyId: party.item.id })).items[0]?.payableSource).toEqual({ kind: "INVOICE_PURCHASE", id: purchase.id, label: purchaseLabel });
  expect((await owner.financial.experimentalSettlement.accountHistory({ debtAccountId: purchase.debtAccountId! })).items[0]?.payableSource).toEqual({ kind: "INVOICE_PURCHASE", id: purchase.id, label: purchaseLabel });
  for (const client of [operator, reader]) {
    const hidden = await client.financial.experimentalSettlement.history({ externalCounterpartyId: party.item.id });
    expect(hidden.items[0]?.payableSource).toEqual({ kind: "RESTRICTED" });
    for (const value of [purchase.id, purchase.invoiceNumber!, purchaseLabel]) expect(JSON.stringify(hidden)).not.toContain(value);
  }
  expect((await owner.financial.experimentalSettlement.candidates({ externalCounterpartyId: party.item.id })).some(row => row.id === purchase.debtEntryId)).toBe(false);
  const canceledBefore = await owner.financial.experimentalSettlement.history({ externalCounterpartyId: party.item.id });
  await expect(owner.financial.experimentalSettlement.preview(pair)).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(owner.financial.experimentalSettlement.confirm({ ...confirmInput, requestId: "canceled-source-refused" })).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await owner.financial.experimentalSettlement.history({ externalCounterpartyId: party.item.id })).toEqual(canceledBefore);
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
  expect(await client.financial.metadata()).toMatchObject({ capabilities: { manualSettlement: false, experimentalInvoiceSettlement: false, experimentalSettlement: false } });
  await expect(client.financial.experimentalInvoices.listInvoices({})).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  await expect(client.financial.experimentalSettlement.candidates({ externalCounterpartyId: randomUUID() })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
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
