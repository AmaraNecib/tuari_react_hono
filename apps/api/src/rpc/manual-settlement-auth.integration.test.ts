import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import type { AppClient } from "@tuari/contracts";
import { randomUUID } from "node:crypto";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createRouterClient } from "@orpc/server";
import { createFreshExactAppDependencies } from "../app/fresh-exact-dependencies";
import { createAppConfig } from "../config";
import { createRpcContext } from "./context";
import { createRouter } from "./router";

const roots: { close(): void }[] = [];
afterEach(() => { for (const root of roots.splice(0)) root.close(); });
it("binds manual settlement to a real authenticated session and retains original replay after reversal", async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), "tuari-613-route-")), "app.sqlite");
  const config = createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite" });
  const root = await createFreshExactAppDependencies({ databasePath, databaseKey: "", disposableManualSettlement: true }, config);
  roots.push(root);
  const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Settlement owner", phone: "0612345678", password: "password123" });
  if (!owner.success) throw new Error("Owner bootstrap failed");
  const adapter = (await root.auth.$context).internalAdapter as unknown as { createSession(id: string): Promise<{ token: string }> };
  const session = await adapter.createSession(owner.item.id);
  const headers = new Headers({ authorization: `Bearer ${session.token}` });
  const client = createRouterClient(createRouter(root), { context: createRpcContext(headers, root.sessionService) }) as AppClient;
  const anonymous = createRouterClient(createRouter(root), { context: createRpcContext(new Headers(), root.sessionService) }) as AppClient;
  expect(await client.financial.metadata()).toHaveProperty("capabilities.manualSettlement", true);
  await expect(anonymous.financial.metadata()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  const party = await client.externalCounterpartiesCreate({ fullName: "Pair", phoneNumber: "0555123456" });
  if (!party.success) throw new Error("Party creation failed");
  const finance = root.financial.services.finance;
  const payable = finance.createAccount({ requestId: "payable", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party.item.id, direction: "PAYABLE", openingBalanceDzd: "100.00" });
  const receivable = finance.createAccount({ requestId: "receivable", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party.item.id, direction: "RECEIVABLE", openingBalanceDzd: "60.00" });
  const pair = { externalCounterpartyId: party.item.id, payableOriginalEntryId: finance.listEntries(payable.id)[0]!.id, receivableOriginalEntryId: finance.listEntries(receivable.id)[0]!.id, currency: "DZD" as const, amountDzd: "25.00" };
  const input = { ...pair, requestId: "confirm", expectedPayableRemainingDzd: "100.00", expectedReceivableRemainingDzd: "60.00" };
  await expect(anonymous.financial.manualSettlement.history({ externalCounterpartyId: party.item.id })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(await client.financial.manualSettlement.preview(pair)).toMatchObject({ payableRemainingDzd: "100.00", receivableRemainingDzd: "60.00", projectedPayableRemainingDzd: "75.00", projectedReceivableRemainingDzd: "35.00", netPositionDzd: "40.00", projectedNetPositionDzd: "40.00" });
  const db = createDatabaseConnection(databasePath, "");
  roots.push(db);
  const operatorId = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO user(id,name,"phoneNumber",created_at,updated_at) VALUES (?,?,?,?,?)').run(operatorId, "Persisted operator", "+213555000002", now, now);
  const role = root.workforceService.listRoles().items.find(row => row.key === "worker")!;
  db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)").run(randomUUID(), "Op", "Erator", "+213555000002", role.id, now, now);
  db.prepare("DELETE FROM role_permission WHERE role_id=?").run(role.id);
  const permissions = ["debts:read", "debts:settle", "debts:update"];
  const grant = (permission: string) => db.prepare("INSERT INTO role_permission(id,role_id,permission,created_at,updated_at) VALUES (?,?,?,?,?)").run(randomUUID(), role.id, permission, now, now);
  for (const permission of permissions) grant(permission);
  const operatorSession = await adapter.createSession(operatorId);
  const cachedContext = createRpcContext(new Headers({ authorization: `Bearer ${operatorSession.token}` }), root.sessionService);
  const operator = createRouterClient(createRouter(root), { context: cachedContext }) as AppClient;
  // Capability metadata does not widen the existing bootstrap-owner shell gate.
  await expect(operator.financial.metadata()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect((await operator.financial.manualSettlement.candidates({ externalCounterpartyId: party.item.id })).sort((a,b) => a.direction.localeCompare(b.direction))).toEqual([
    expect.objectContaining({ id: pair.payableOriginalEntryId, direction: "PAYABLE", remainingDzd: "100.00" }),
    expect.objectContaining({ id: pair.receivableOriginalEntryId, direction: "RECEIVABLE", remainingDzd: "60.00" }),
  ]);
  await operator.financial.manualSettlement.preview(pair);
  expect((await cachedContext.resolveCurrentUser())?.permissions).toContain("debts:settle");
  for (const permission of ["debts:read", "debts:settle"]) {
    db.prepare("DELETE FROM role_permission WHERE role_id=? AND permission=?").run(role.id, permission);
    await expect(operator.financial.manualSettlement.confirm(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    if (permission === "debts:read") {
      await expect(operator.financial.manualSettlement.candidates({ externalCounterpartyId: party.item.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(operator.financial.manualSettlement.preview(pair)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(operator.financial.manualSettlement.history({ externalCounterpartyId: party.item.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    grant(permission);
  }
  await expect(client.financial.manualSettlement.confirm({ ...input, actorUserId: operatorId } as typeof input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(anonymous.financial.manualSettlement.confirm(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  const warehouse = await client.warehousesCreate({ name: "Stock warehouse" });
  const material = await client.inventoryItemDefinitionsCreate({ name: "Sand", itemType: "CONSUMABLE", unit: "kg" });
  if (!warehouse.success || !material.success) throw new Error("Inventory setup failed");
  root.financial.services.inventory.createInvoiceGroup({ requestId: "stock", warehouseId: warehouse.item.id, entries: [{ kind: "CONSUMABLE", itemDefinitionId: material.item.id, quantity: 4, priceSource: { mode: "agreed-total", total: "80.00", quantity: "4" } }] });
  const employee = await client.employeesCreate({ firstName: "Cash", lastName: "Worker", phone: "0555123999", roleId: role.id });
  if (!employee.success) throw new Error("Cash setup failed");
  await client.employeePayrollCashRecord({ requestId: "actual-cash", employeeId: employee.item.id, amount: "10.00", paymentDate: now, wages: [], advanceAmount: "10.00" });
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%cash%' OR name LIKE '%inventory%' OR name LIKE '%consumable%' OR name LIKE '%asset%' OR name LIKE '%project_cost%') ORDER BY name").all() as { name: string }[]).map(row => row.name);
  expect(tables.length).toBeGreaterThan(0);
  const physicalSnapshot = () => Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
  let unchanged = physicalSnapshot();
  expect(db.prepare("SELECT COUNT(*) AS n FROM employee_salary_cash").get()).toEqual({ n: 1 });
  expect(db.prepare("SELECT COUNT(*) AS n FROM inventory_entry").get()).toEqual({ n: 1 });
  const stockBefore = await client.financial.reports.generate({ type: "INVENTORY" });
  const save = root.financial.services.financeRepository.saveAggregateCommand.bind(root.financial.services.financeRepository);
  root.financial.services.financeRepository.saveAggregateCommand = () => { throw new Error("Route receipt failure"); };
  await expect(client.financial.manualSettlement.confirm(input)).rejects.toThrow("Route receipt failure");
  expect(finance.remaining(pair.payableOriginalEntryId)).toBe("100.00");
  expect(finance.remaining(pair.receivableOriginalEntryId)).toBe("60.00");
  expect((await client.financial.manualSettlement.history({ externalCounterpartyId: party.item.id })).items).toEqual([]);
  root.financial.services.financeRepository.saveAggregateCommand = save;
  db.prepare("UPDATE user SET name='Current persisted label' WHERE id=?").run(operatorId);
  const saved = await operator.financial.manualSettlement.confirm(input);
  expect(saved.settlement).toMatchObject({ actorUserId: operatorId, actorLabel: "Current persisted label" });
  db.prepare("UPDATE user SET name='Renamed after confirm' WHERE id=?").run(operatorId);
  expect(await operator.financial.manualSettlement.confirm(input)).toEqual(saved);
  expect(physicalSnapshot()).toEqual(unchanged);
  for (const permission of ["debts:read", "debts:settle"]) {
    db.prepare("DELETE FROM role_permission WHERE role_id=? AND permission=?").run(role.id, permission);
    await expect(operator.financial.manualSettlement.confirm(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    grant(permission);
  }
  await expect(client.financial.manualSettlement.confirm(input)).rejects.toMatchObject({ code: "CONFLICT" });
  expect(finance.remaining(pair.payableOriginalEntryId)).toBe("75.00");
  expect(finance.remaining(pair.receivableOriginalEntryId)).toBe("35.00");
  expect((await client.financial.debts.detail({ id: payable.id })).entries.find(row => row.id === pair.payableOriginalEntryId)?.remainingDzd).toBe("75.00");
  expect((await client.financial.debts.detail({ id: receivable.id })).entries.find(row => row.id === pair.receivableOriginalEntryId)?.remainingDzd).toBe("35.00");
  expect(await client.financial.debts.summary()).toMatchObject({ grossPayableDzd: "75.00", grossReceivableDzd: "45.00" });
  await expect(client.financial.manualSettlement.confirm({ ...input, requestId: "derived", payableOriginalEntryId: saved.settlement.payableSettlementEntryId })).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(client.financial.manualSettlement.history({ externalCounterpartyId: party.item.id, limit: 101 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(await client.financial.manualSettlement.history({ externalCounterpartyId: party.item.id, offset: 1, limit: 1 })).toEqual({ items: [], nextOffset: null });
  expect((await client.financial.manualSettlement.history({ externalCounterpartyId: party.item.id })).items).toEqual([{ ...saved.settlement, reversal: null }]);
  await expect(client.financial.manualSettlement.confirm({ ...input, requestId: "stale" })).rejects.toMatchObject({ code: "CONFLICT", data: { manualSettlementOutcome: "UNCOMMITTED" } });
  await expect(client.financial.manualSettlement.confirm({ ...input, amountDzd: "24.00" })).rejects.toMatchObject({ code: "CONFLICT" });
  for (const id of [payable.id, receivable.id]) expect((await operator.financial.manualSettlement.accountHistory({ debtAccountId: id })).items).toEqual([{ ...saved.settlement, reversal: null }]);
  const reverse = { requestId: "reverse", settlementId: saved.settlement.id, reason: "Wrong pair" };
  for (const permission of permissions) {
    db.prepare("DELETE FROM role_permission WHERE role_id=? AND permission=?").run(role.id, permission);
    await expect(operator.financial.manualSettlement.reverse(reverse)).rejects.toMatchObject({ code: "FORBIDDEN" });
    grant(permission);
  }
  const reversed = await operator.financial.manualSettlement.reverse(reverse);
  expect(reversed.reversal.actorLabel).toBe("Renamed after confirm");
  db.prepare("UPDATE user SET name='Renamed after reverse' WHERE id=?").run(operatorId);
  expect(await operator.financial.manualSettlement.reverse(reverse)).toEqual(reversed);
  expect(physicalSnapshot()).toEqual(unchanged);
  const stockAfter = await client.financial.reports.generate({ type: "INVENTORY" });
  expect({ ...stockAfter, generatedAt: null }).toEqual({ ...stockBefore, generatedAt: null });
  for (const permission of permissions) {
    db.prepare("DELETE FROM role_permission WHERE role_id=? AND permission=?").run(role.id, permission);
    await expect(operator.financial.manualSettlement.reverse(reverse)).rejects.toMatchObject({ code: "FORBIDDEN" });
    grant(permission);
  }
  expect(finance.remaining(pair.payableOriginalEntryId)).toBe("100.00");
  expect(finance.remaining(pair.receivableOriginalEntryId)).toBe("60.00");
  expect((await client.financial.manualSettlement.history({ externalCounterpartyId: party.item.id })).items).toEqual([{ ...saved.settlement, reversal: reversed.reversal }]);
  await expect(client.financial.manualSettlement.reverse({ requestId: "missing", settlementId: randomUUID(), reason: "Missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  for (const id of [payable.id, receivable.id]) expect((await operator.financial.manualSettlement.accountHistory({ debtAccountId: id })).items).toEqual([{ ...saved.settlement, reversal: reversed.reversal }]);
  const second = await operator.financial.manualSettlement.confirm({ ...input, requestId: "second", amountDzd: "1.00" });
  const page1 = await operator.financial.manualSettlement.history({ externalCounterpartyId: party.item.id, limit: 1 });
  expect(page1.nextOffset).toBe(1);
  const page2 = await operator.financial.manualSettlement.history({ externalCounterpartyId: party.item.id, limit: 1, offset: page1.nextOffset! });
  expect(page2.nextOffset).toBeNull();
  expect(new Set([page1.items[0]!.id, page2.items[0]!.id])).toEqual(new Set([saved.settlement.id, second.settlement.id]));
  expect(await operator.financial.manualSettlement.history({ externalCounterpartyId: party.item.id, limit: 1 })).toEqual(page1);
  await operator.financial.manualSettlement.reverse({ requestId: "second-reverse", settlementId: second.settlement.id, reason: "Test complete reversal" });
  for (let index = 0; index < 6; index++) {
    const additional = await operator.financial.manualSettlement.confirm({ ...input, requestId: `older-page-${index}`, amountDzd: "1.00" });
    await operator.financial.manualSettlement.reverse({ requestId: `older-page-reverse-${index}`, settlementId: additional.settlement.id, reason: "Pagination fixture" });
  }
  for (const id of [payable.id, receivable.id]) {
    const linked = await operator.financial.manualSettlement.accountHistory({ debtAccountId: id });
    expect(linked.items).toHaveLength(8);
    expect(linked.items.find(item => item.id === saved.settlement.id)).toEqual({ ...saved.settlement, reversal: reversed.reversal });
  }
  const produced = finance.forProducer({ type: "PAYROLL_ADVANCE", id: randomUUID() }).postEntry({ requestId: "producer", debtAccountId: payable.id, entryType: "ADJUSTMENT", signedAmountDzd: "1.00" });
  const beforeRefusal = finance.listEntries(payable.id);
  await expect(client.financial.manualSettlement.confirm({ ...input, requestId: "producer-refused", payableOriginalEntryId: produced.id, amountDzd: "1.00", expectedPayableRemainingDzd: "1.00" })).rejects.toMatchObject({ code: "CONFLICT" });

  expect(finance.listEntries(payable.id)).toEqual(beforeRefusal);
  const inventory = root.financial.services.inventory;
  const purchase = inventory.createInvoiceGroup({ requestId: "settle-purchase", warehouseId: warehouse.item.id, externalCounterpartyId: party.item.id, createDebt: true, paymentInputType: "AMOUNT", paidAmountDzd: "20000.00",
    entries: [{ kind: "CONSUMABLE", itemDefinitionId: material.item.id, quantity: 2, priceSource: { mode: "agreed-total", total: "100000.00", quantity: "2" } }] });
  const sale = inventory.createOutboundTransfer({ requestId: "settle-sale", fromType: "WAREHOUSE", fromId: warehouse.item.id,
    counterpartyId: party.item.id, transferType: "SALE", debtAmountDzd: "30000.00", firstPaymentAmountDzd: "5000.00", items: [{ itemId: material.item.id, quantity: 1, unitPriceDzd: "30000.00" }] });
  const purchaseOriginal = purchase.group.debtEntryId!;
  const saleOriginal = sale.debtEntryId!;
  unchanged = physicalSnapshot();
  const settlementPair = { externalCounterpartyId: party.item.id, payableOriginalEntryId: purchaseOriginal, receivableOriginalEntryId: saleOriginal, currency: "DZD" as const, amountDzd: "25000.00" };
  expect(await client.financial.manualSettlement.preview(settlementPair)).toMatchObject({ payableRemainingDzd: "80000.00", receivableRemainingDzd: "25000.00", projectedPayableRemainingDzd: "55000.00", projectedReceivableRemainingDzd: "0.00" });
  const inventoryState = () => Object.fromEntries(tables.filter(name => (name.includes("inventory") && !name.includes("invoice_group") && !name.includes("outbound_transfer")) || name.includes("project_cost") || name.includes("asset_charge")).map(name => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
  const sourceState = inventoryState();
  const actualPayments = () => [purchase.group.debtEntryId, sale.debtEntryId].map(id => finance.listEntries(id === purchase.group.debtEntryId ? purchase.group.debtAccountId! : sale.associatedDebtAccountId!).filter(entry => entry.entryType === "PAYMENT").map(entry => ({ amount: entry.signedAmountDzd, method: entry.paymentMethod, target: entry.targetEntryId })));
  const paymentsBefore = actualPayments();
  const confirm = { ...settlementPair, requestId: "settle-inventory-pair", expectedPayableRemainingDzd: "80000.00", expectedReceivableRemainingDzd: "25000.00" };
  const settled = await client.financial.manualSettlement.confirm(confirm);
  expect(settled.preview).toMatchObject({ projectedPayableRemainingDzd: "55000.00", projectedReceivableRemainingDzd: "0.00" });
  expect(inventoryState()).toEqual(sourceState);
  expect(actualPayments()).toEqual(paymentsBefore);
  expect(finance.remaining(purchaseOriginal)).toBe("55000.00");
  expect(finance.remaining(saleOriginal)).toBe("0.00");
  expect(inventory.getInvoiceGroup(purchase.group.id).group.remainingDebtDzd).toBe("55000.00");
  const inventoryReversal = await client.financial.manualSettlement.reverse({ requestId: "reverse-inventory-pair", settlementId: settled.settlement.id, reason: "Test reversal" });
  expect(inventoryReversal.settlement.id).toBe(settled.settlement.id);
  expect(inventoryState()).toEqual(sourceState);
  expect(actualPayments()).toEqual(paymentsBefore);
  expect(finance.remaining(purchaseOriginal)).toBe("80000.00");
  expect(finance.remaining(saleOriginal)).toBe("25000.00");
  expect(inventory.getInvoiceGroup(purchase.group.id).group.remainingDebtDzd).toBe("80000.00");
  const project = await client.projectsCreate({ name: "Settlement project", status: "ACTIVE" });
  if (!project.success) throw new Error("Project setup failed");
  inventory.createInvoiceGroup({ requestId: "project-stock", projectId: project.item.id, entries: [{ kind: "CONSUMABLE", itemDefinitionId: material.item.id, quantity: 1, priceSource: { mode: "agreed-total", total: "10.00", quantity: "1" } }] });
  const projectSale = inventory.createOutboundTransfer({ requestId: "project-sale", fromType: "PROJECT", fromId: project.item.id, counterpartyId: party.item.id,
    transferType: "SALE", debtAmountDzd: "10.00", items: [{ itemId: material.item.id, quantity: 1, unitPriceDzd: "10.00" }] });
  expect(await client.financial.manualSettlement.preview({ externalCounterpartyId: party.item.id, payableOriginalEntryId: pair.payableOriginalEntryId,
    receivableOriginalEntryId: projectSale.debtEntryId!, currency: "DZD", amountDzd: "1.00" })).toMatchObject({ payableRemainingDzd: "100.00", receivableRemainingDzd: "10.00", projectedPayableRemainingDzd: "99.00", projectedReceivableRemainingDzd: "9.00" });
  root.close();
  const reopened = await createFreshExactAppDependencies({ databasePath, databaseKey: "", disposableManualSettlement: true }, config);
  roots.push(reopened);
  const retry = createRouterClient(createRouter(reopened), { context: createRpcContext(headers, reopened.sessionService) }) as AppClient;
  const reopenedOperator = createRouterClient(createRouter(reopened), { context: createRpcContext(new Headers({ authorization: `Bearer ${operatorSession.token}` }), reopened.sessionService) }) as AppClient;
  expect(await reopenedOperator.financial.manualSettlement.confirm(input)).toEqual(saved);
  expect(await reopenedOperator.financial.manualSettlement.reverse(reverse)).toEqual(reversed);
  expect((await retry.financial.manualSettlement.history({ externalCounterpartyId: party.item.id })).items.find(row => row.id === saved.settlement.id)?.reversal).toEqual(reversed.reversal);
}, 60000);
