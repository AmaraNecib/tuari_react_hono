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
it("restores a live warehouse inventory settlement and reversal across application restart", async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), "tuari-614-live-restart-")), "app.sqlite");
  const config = createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite" });
  let root = await createFreshExactAppDependencies({ databasePath, databaseKey: "", disposableManualSettlement: true }, config);
  roots.push(root);
  const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Restart owner", phone: "0612345678", password: "password123" });
  if (!owner.success) throw new Error("Owner bootstrap failed");
  const adapter = (await root.auth.$context).internalAdapter as unknown as { createSession(id: string): Promise<{ token: string }> };
  const session = await adapter.createSession(owner.item.id);
  const clientFor = (app: typeof root) => createRouterClient(createRouter(app), { context: createRpcContext(new Headers({ authorization: `Bearer ${session.token}` }), app.sessionService) }) as AppClient;
  let client = clientFor(root);
  const party = await client.externalCounterpartiesCreate({ fullName: "Restart purchase-sale party", phoneNumber: "0555123614" });
  const warehouse = await client.warehousesCreate({ name: "Restart warehouse" });
  const material = await client.inventoryItemDefinitionsCreate({ name: "Restart material", itemType: "CONSUMABLE", unit: "unit" });
  if (!party.success || !warehouse.success || !material.success) throw new Error("Inventory fixture setup failed");
  const purchase = await client.financial.inventory.createInvoice({ requestId: "restart-purchase", warehouseId: warehouse.item.id, externalCounterpartyId: party.item.id, createDebt: true, paymentInputType: "AMOUNT", paidAmountDzd: "20000.00", entries: [{ kind: "CONSUMABLE", itemDefinitionId: material.item.id, quantity: 2, priceSource: { mode: "agreed-total", total: "100000.00", quantity: "2" } }] });
  const sale = await client.financial.inventory.createOutbound({ requestId: "restart-sale", fromType: "WAREHOUSE", fromId: warehouse.item.id, counterpartyId: party.item.id, transferType: "SALE", debtAmountDzd: "30000.00", firstPaymentAmountDzd: "5000.00", items: [{ itemId: material.item.id, quantity: 1, unitPriceDzd: "30000.00" }] });
  const pair = { externalCounterpartyId: party.item.id, payableOriginalEntryId: purchase.group.debtEntryId!, receivableOriginalEntryId: sale.debtEntryId!, currency: "DZD" as const, amountDzd: "25000.00" };
  const confirmInput = { ...pair, requestId: "restart-confirm", expectedPayableRemainingDzd: "80000.00", expectedReceivableRemainingDzd: "25000.00" };
  const snapshot = async () => ({
    payable: await client.financial.debts.detail({ id: purchase.group.debtAccountId! }),
    receivable: await client.financial.debts.detail({ id: sale.associatedDebtAccountId! }),
    purchase: await client.financial.inventory.getInvoice({ id: purchase.group.id }),
    sale: await client.financial.inventory.getOutbound({ id: sale.id }),
    payableHistory: await client.financial.manualSettlement.accountHistory({ debtAccountId: purchase.group.debtAccountId! }),
    receivableHistory: await client.financial.manualSettlement.accountHistory({ debtAccountId: sale.associatedDebtAccountId! }),
    stock: await client.financial.inventory.locationContents({ warehouseId: warehouse.item.id }),
    history: await client.financial.inventory.transferHistory({ transferType: "SALE", warehouseId: warehouse.item.id, limit: 20, offset: 0 }),
  });
  const beforeFailure = await snapshot();
  const financeRepository = root.financial.services.financeRepository;
  const saveAggregateCommand = financeRepository.saveAggregateCommand.bind(financeRepository);
  financeRepository.saveAggregateCommand = () => { throw new Error("Injected inventory settlement aggregate receipt failure"); };
  try {
    await expect(client.financial.manualSettlement.confirm(confirmInput)).rejects.toThrow("Injected inventory settlement aggregate receipt failure");
  } finally {
    financeRepository.saveAggregateCommand = saveAggregateCommand;
  }
  expect(await snapshot()).toEqual(beforeFailure);
  const settled = await client.financial.manualSettlement.confirm(confirmInput);
  root.close();
  root = await createFreshExactAppDependencies({ databasePath, databaseKey: "", disposableManualSettlement: true }, config);
  roots.push(root);
  client = clientFor(root);
  const inventoryVoidSnapshot = async () => ({
    purchase: await client.financial.inventory.getInvoice({ id: purchase.group.id }),
    sale: await client.financial.inventory.getOutbound({ id: sale.id }),
    payable: await client.financial.debts.detail({ id: purchase.group.debtAccountId! }),
    receivable: await client.financial.debts.detail({ id: sale.associatedDebtAccountId! }),
    payableHistory: await client.financial.manualSettlement.accountHistory({ debtAccountId: purchase.group.debtAccountId! }),
    receivableHistory: await client.financial.manualSettlement.accountHistory({ debtAccountId: sale.associatedDebtAccountId! }),
    stock: await client.financial.inventory.locationContents({ warehouseId: warehouse.item.id }),
    transferHistory: await client.financial.inventory.transferHistory({ transferType: "SALE", warehouseId: warehouse.item.id, limit: 20, offset: 0 }),
  });
  // Inventory originals remain producer-owned; reversal is not an inventory cancellation API.
  const liveVoidSnapshot = await inventoryVoidSnapshot();
  const purchaseEntry = (await client.financial.debts.detail({ id: purchase.group.debtAccountId! })).entries.find(row => row.id === pair.payableOriginalEntryId)!;
  const saleEntry = (await client.financial.debts.detail({ id: sale.associatedDebtAccountId! })).entries.find(row => row.id === pair.receivableOriginalEntryId)!;
  for (const [entry, producerType, producerId] of [[purchaseEntry, purchaseEntry.producerType!, purchaseEntry.producerId!], [saleEntry, saleEntry.producerType!, saleEntry.producerId!]] as const) {
    await expect(client.financial.debts.void({ requestId: `public-void-${entry.id}`, entryId: entry.id, voidReason: "Guard proof" })).rejects.toThrow(/producer/i);
    expect(await inventoryVoidSnapshot()).toEqual(liveVoidSnapshot);
    expect(() => root.financial.services.finance.forProducer({ type: producerType, id: producerId }).voidEntry({ requestId: `trusted-void-${entry.id}`, entryId: entry.id, voidReason: "Guard proof" })).toThrow(/Reverse the linked settlement first/i);
    expect(await inventoryVoidSnapshot()).toEqual(liveVoidSnapshot);
  }
  const purchaseAfterRestart = await client.financial.inventory.getInvoice({ id: purchase.group.id });
  const saleAfterRestart = await client.financial.inventory.getOutbound({ id: sale.id });
  expect(purchaseAfterRestart.group).toMatchObject({ remainingDebtDzd: "55000.00", paidAmountDzd: "20000.00" });
  expect(saleAfterRestart).toMatchObject({ remainingDebtDzd: "0.00" });
  expect((await client.financial.inventory.transferHistory({ transferType: "SALE", warehouseId: warehouse.item.id, limit: 20, offset: 0 })).items.find(row => row.id === sale.id)).toMatchObject({ paidAmountDzd: "5000.00", remainingDebtDzd: "0.00" });
  const payableDetail = await client.financial.debts.detail({ id: purchase.group.debtAccountId! });
  const receivableDetail = await client.financial.debts.detail({ id: sale.associatedDebtAccountId! });
  expect(payableDetail.entries.find(row => row.id === pair.payableOriginalEntryId)?.remainingDzd).toBe("55000.00");
  expect(receivableDetail.entries.find(row => row.id === pair.receivableOriginalEntryId)?.remainingDzd).toBe("0.00");
  const paymentTotal = (entries: typeof payableDetail.entries) => entries.filter(row => row.entryType === "PAYMENT").reduce((sum, row) => sum + Number(row.signedAmountDzd), 0).toFixed(2);
  expect(paymentTotal(payableDetail.entries)).toBe("-20000.00");
  expect(paymentTotal(receivableDetail.entries)).toBe("-5000.00");
  expect(await client.financial.debts.summary()).toMatchObject({ grossPayableDzd: "55000.00", grossReceivableDzd: "0.00" });
  for (const accountId of [purchase.group.debtAccountId!, sale.associatedDebtAccountId!]) {
    expect((await client.financial.manualSettlement.accountHistory({ debtAccountId: accountId })).items).toContainEqual(expect.objectContaining({ id: settled.settlement.id, reversal: null, payableSource: expect.objectContaining({ kind: "PURCHASE", id: purchase.group.id }), receivableSource: expect.objectContaining({ kind: "SALE", id: sale.id }) }));
  }
  const reversed = await client.financial.manualSettlement.reverse({ requestId: "restart-reverse", settlementId: settled.settlement.id, reason: "Restart reversal proof" });
  expect((await client.financial.inventory.getInvoice({ id: purchase.group.id })).group).toMatchObject({ remainingDebtDzd: "80000.00", paidAmountDzd: "20000.00" });
  expect(await client.financial.inventory.getOutbound({ id: sale.id })).toMatchObject({ remainingDebtDzd: "25000.00" });
  expect((await client.financial.debts.detail({ id: purchase.group.debtAccountId! })).entries.find(row => row.id === pair.payableOriginalEntryId)?.remainingDzd).toBe("80000.00");
  const reversedReceivableDetail = await client.financial.debts.detail({ id: sale.associatedDebtAccountId! });
  expect(reversedReceivableDetail.entries.find(row => row.id === pair.receivableOriginalEntryId)?.remainingDzd).toBe("25000.00");
  expect(paymentTotal((await client.financial.debts.detail({ id: purchase.group.debtAccountId! })).entries)).toBe("-20000.00");
  expect(paymentTotal(reversedReceivableDetail.entries)).toBe("-5000.00");
  expect(await client.financial.debts.summary()).toMatchObject({ grossPayableDzd: "80000.00", grossReceivableDzd: "25000.00" });
  expect(reversed.reversal).toBeTruthy();
  for (const accountId of [purchase.group.debtAccountId!, sale.associatedDebtAccountId!]) {
    expect((await client.financial.manualSettlement.accountHistory({ debtAccountId: accountId })).items).toContainEqual(expect.objectContaining({ id: settled.settlement.id, reversal: reversed.reversal }));
  }
  const afterReversal = await inventoryVoidSnapshot();
  for (const entry of [purchaseEntry, saleEntry]) {
    await expect(client.financial.debts.void({ requestId: `public-void-after-reversal-${entry.id}`, entryId: entry.id, voidReason: "Guard proof after reversal" })).rejects.toThrow(/producer/i);
    expect(await inventoryVoidSnapshot()).toEqual(afterReversal);
  }
}, 60000);

it("settles a project SALE against manual payable across restart without changing stock or cash", async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), "tuari-614-project-sale-")), "app.sqlite");
  const config = createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite" });
  let root = await createFreshExactAppDependencies({ databasePath, databaseKey: "", disposableManualSettlement: true }, config);
  roots.push(root);
  const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Project sale owner", phone: "0612345679", password: "password123" });
  if (!owner.success) throw new Error("Owner bootstrap failed");
  const adapter = (await root.auth.$context).internalAdapter as unknown as { createSession(id: string): Promise<{ token: string }> };
  const session = await adapter.createSession(owner.item.id);
  const clientFor = (app: typeof root) => createRouterClient(createRouter(app), { context: createRpcContext(new Headers({ authorization: `Bearer ${session.token}` }), app.sessionService) }) as AppClient;
  let client = clientFor(root);
  const party = await client.externalCounterpartiesCreate({ fullName: "Project sale party", phoneNumber: "0555123615" });
  const project = await client.projectsCreate({ name: "Settlement project", status: "ACTIVE" });
  const material = await client.inventoryItemDefinitionsCreate({ name: "Project settlement material", itemType: "CONSUMABLE", unit: "unit" });
  if (!party.success || !project.success || !material.success) throw new Error("Project fixture setup failed");
  await client.financial.inventory.createInvoice({ requestId: "project-stock", projectId: project.item.id, entries: [{ kind: "CONSUMABLE", itemDefinitionId: material.item.id, quantity: 2, priceSource: { mode: "agreed-total", total: "10.00", quantity: "2" } }] });
  const payable = await client.financial.debts.create({ requestId: "project-manual-payable", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party.item.id, direction: "PAYABLE", openingBalanceDzd: "100.00", reasonCategory: "OTHER", reasonDetail: "Project sale settlement" });
  const sale = await client.financial.inventory.createOutbound({ requestId: "project-sale-outbound", fromType: "PROJECT", fromId: project.item.id, counterpartyId: party.item.id, transferType: "SALE", debtAmountDzd: "10.00", items: [{ itemId: material.item.id, quantity: 1, unitPriceDzd: "10.00" }] });
  const pair = { externalCounterpartyId: party.item.id, payableOriginalEntryId: (await client.financial.debts.detail({ id: payable.id })).entries[0]!.id, receivableOriginalEntryId: sale.debtEntryId!, currency: "DZD" as const, amountDzd: "4.00" };
  const physicalBefore = await client.financial.inventory.locationContents({ projectId: project.item.id });
  const contributionBefore = await client.financial.inventory.projectContribution({ projectId: project.item.id });
  const movementBefore = await client.financial.inventory.transferHistory({ transferType: "SALE", projectId: project.item.id, limit: 20, offset: 0 });
  expect(physicalBefore.consumables).toHaveLength(1);
  expect(physicalBefore.consumables[0]).toMatchObject({ quantity: 1 });
  expect(contributionBefore).toMatchObject({ totalDzd: "5.00" });
  expect(movementBefore.items).toContainEqual(expect.objectContaining({ id: sale.id, remainingDebtDzd: "10.00", paidAmountDzd: "0.00" }));
  const confirmed = await client.financial.manualSettlement.confirm({ ...pair, requestId: "project-settle", expectedPayableRemainingDzd: "100.00", expectedReceivableRemainingDzd: "10.00" });
  expect(confirmed.preview).toMatchObject({ projectedPayableRemainingDzd: "96.00", projectedReceivableRemainingDzd: "6.00", projectedNetPositionDzd: "90.00" });
  root.close();
  root = await createFreshExactAppDependencies({ databasePath, databaseKey: "", disposableManualSettlement: true }, config);
  roots.push(root);
  client = clientFor(root);
  expect(await client.financial.inventory.locationContents({ projectId: project.item.id })).toEqual(physicalBefore);
  expect(await client.financial.inventory.projectContribution({ projectId: project.item.id })).toEqual(contributionBefore);
  expect(await client.financial.inventory.transferHistory({ transferType: "SALE", projectId: project.item.id, limit: 20, offset: 0 })).toEqual(expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ id: sale.id, remainingDebtDzd: "6.00" })]) }));
  expect((await client.financial.debts.detail({ id: sale.associatedDebtAccountId! })).entries.filter(row => row.entryType === "PAYMENT")).toHaveLength(0);
  expect((await client.financial.inventory.transferHistory({ transferType: "SALE", projectId: project.item.id, limit: 20, offset: 0 })).items.find(row => row.id === sale.id)).toMatchObject({ paidAmountDzd: "0.00", remainingDebtDzd: "6.00" });
  expect(await client.financial.debts.summary()).toMatchObject({ grossPayableDzd: "96.00", grossReceivableDzd: "6.00" });
  expect((await client.financial.manualSettlement.accountHistory({ debtAccountId: payable.id })).items).toContainEqual(expect.objectContaining({ id: confirmed.settlement.id, reversal: null }));
  const paid = await client.financial.inventory.recordOutboundPayment({ requestId: "project-sale-payment", transferId: sale.id, amountDzd: "2.00" });
  expect(paid).toMatchObject({ remainingDebtDzd: "4.00" });
  expect((await client.financial.debts.detail({ id: sale.associatedDebtAccountId! })).entries.filter(row => row.entryType === "PAYMENT").map(row => row.signedAmountDzd)).toEqual(["-2.00"]);
  expect((await client.financial.inventory.transferHistory({ transferType: "SALE", projectId: project.item.id, limit: 20, offset: 0 })).items.find(row => row.id === sale.id)).toMatchObject({ paidAmountDzd: "2.00", remainingDebtDzd: "4.00" });
  const beforeOverpay = await client.financial.inventory.getOutbound({ id: sale.id });
  await expect(client.financial.inventory.recordOutboundPayment({ requestId: "project-sale-overpay", transferId: sale.id, amountDzd: "4.01" })).rejects.toThrow(/exceeds/i);
  expect(await client.financial.inventory.getOutbound({ id: sale.id })).toEqual(beforeOverpay);
  const projectReversal = await client.financial.manualSettlement.reverse({ requestId: "project-reverse", settlementId: confirmed.settlement.id, reason: "Project settlement reversal" });
  expect((await client.financial.debts.detail({ id: payable.id })).entries.find(row => row.id === pair.payableOriginalEntryId)?.remainingDzd).toBe("100.00");
  expect((await client.financial.debts.detail({ id: sale.associatedDebtAccountId! })).entries.find(row => row.id === pair.receivableOriginalEntryId)?.remainingDzd).toBe("8.00");
  expect(await client.financial.debts.summary()).toMatchObject({ grossPayableDzd: "100.00", grossReceivableDzd: "8.00" });
  expect(await client.financial.inventory.getOutbound({ id: sale.id })).toMatchObject({ remainingDebtDzd: "8.00" });
  expect((await client.financial.inventory.transferHistory({ transferType: "SALE", projectId: project.item.id, limit: 20, offset: 0 })).items.find(row => row.id === sale.id)).toMatchObject({ paidAmountDzd: "2.00", remainingDebtDzd: "8.00" });
  expect((await client.financial.inventory.transferHistory({ transferType: "SALE", projectId: project.item.id, limit: 20, offset: 0 })).items.find(row => row.id === sale.id)).toMatchObject({ paidAmountDzd: "2.00", remainingDebtDzd: "8.00" });
  expect((await client.financial.manualSettlement.accountHistory({ debtAccountId: payable.id })).items).toContainEqual(expect.objectContaining({ id: confirmed.settlement.id, reversal: projectReversal.reversal }));
  expect((await client.financial.debts.detail({ id: sale.associatedDebtAccountId! })).entries.filter(row => row.entryType === "PAYMENT").map(row => row.signedAmountDzd)).toEqual(["-2.00"]);
  expect(await client.financial.inventory.locationContents({ projectId: project.item.id })).toEqual(physicalBefore);
  expect(await client.financial.inventory.projectContribution({ projectId: project.item.id })).toEqual(contributionBefore);
}, 60000);

it("settles a purchase payable against a manual receivable and reverses without changing cash", async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), "tuari-614-inverse-mixed-")), "app.sqlite");
  const config = createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite" });
  const root = await createFreshExactAppDependencies({ databasePath, databaseKey: "", disposableManualSettlement: true }, config);
  roots.push(root);
  const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Inverse owner", phone: "0612343614", password: "password123" });
  if (!owner.success) throw new Error("Owner bootstrap failed");
  const adapter = (await root.auth.$context).internalAdapter as unknown as { createSession(id: string): Promise<{ token: string }> };
  const session = await adapter.createSession(owner.item.id);
  const client = createRouterClient(createRouter(root), { context: createRpcContext(new Headers({ authorization: `Bearer ${session.token}` }), root.sessionService) }) as AppClient;
  const party = await client.externalCounterpartiesCreate({ fullName: "Inverse mixed party", phoneNumber: "0555123616" });
  const warehouse = await client.warehousesCreate({ name: "Inverse warehouse" });
  const material = await client.inventoryItemDefinitionsCreate({ name: "Inverse material", itemType: "CONSUMABLE", unit: "unit" });
  if (!party.success || !warehouse.success || !material.success) throw new Error("Inverse fixture setup failed");
  const purchase = await client.financial.inventory.createInvoice({ requestId: "inverse-purchase", warehouseId: warehouse.item.id, externalCounterpartyId: party.item.id, createDebt: true, paymentInputType: "AMOUNT", paidAmountDzd: "20.00", entries: [{ kind: "CONSUMABLE", itemDefinitionId: material.item.id, quantity: 2, priceSource: { mode: "agreed-total", total: "100.00", quantity: "2" } }] });
  const receivable = await client.financial.debts.create({ requestId: "inverse-manual-receivable", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party.item.id, direction: "RECEIVABLE", openingBalanceDzd: "30.00", reasonCategory: "OTHER", reasonDetail: "Inverse mixed settlement" });
  const payableOriginal = purchase.group.debtEntryId!;
  const receivableOriginal = (await client.financial.debts.detail({ id: receivable.id })).entries[0]!.id;
  const before = await client.financial.inventory.locationContents({ warehouseId: warehouse.item.id });
  const input = { requestId: "inverse-mixed-confirm", externalCounterpartyId: party.item.id, payableOriginalEntryId: payableOriginal, receivableOriginalEntryId: receivableOriginal, currency: "DZD" as const, amountDzd: "25.00", expectedPayableRemainingDzd: "80.00", expectedReceivableRemainingDzd: "30.00" };
  const confirmInput = { ...input, requestId: "inverse-mixed-confirm" };
  const previewInput = { externalCounterpartyId: party.item.id, payableOriginalEntryId: payableOriginal, receivableOriginalEntryId: receivableOriginal, currency: "DZD" as const, amountDzd: "25.00" };
  expect(await client.financial.manualSettlement.preview(previewInput)).toMatchObject({ payableRemainingDzd: "80.00", receivableRemainingDzd: "30.00", projectedPayableRemainingDzd: "55.00", projectedReceivableRemainingDzd: "5.00", projectedNetPositionDzd: "50.00" });
  const confirmed = await client.financial.manualSettlement.confirm(confirmInput);
  expect(await client.financial.inventory.getInvoice({ id: purchase.group.id })).toMatchObject({ group: { remainingDebtDzd: "55.00", paidAmountDzd: "20.00" } });
  expect((await client.financial.debts.detail({ id: purchase.group.debtAccountId! })).entries.find(row => row.id === payableOriginal)?.remainingDzd).toBe("55.00");
  expect((await client.financial.debts.detail({ id: receivable.id })).entries.find(row => row.id === receivableOriginal)?.remainingDzd).toBe("5.00");
  expect(await client.financial.debts.summary()).toMatchObject({ grossPayableDzd: "55.00", grossReceivableDzd: "5.00" });
  expect((await client.financial.manualSettlement.accountHistory({ debtAccountId: purchase.group.debtAccountId! })).items).toContainEqual(expect.objectContaining({ id: confirmed.settlement.id, payableSource: expect.objectContaining({ kind: "PURCHASE", id: purchase.group.id }), receivableSource: expect.objectContaining({ kind: "MANUAL", id: receivableOriginal }) }));
  expect(await client.financial.inventory.locationContents({ warehouseId: warehouse.item.id })).toEqual(before);
  expect(await client.financial.manualSettlement.confirm(confirmInput)).toEqual(confirmed);
  await client.financial.manualSettlement.reverse({ requestId: "inverse-mixed-reverse", settlementId: confirmed.settlement.id, reason: "Inverse mixed reversal" });
  expect(await client.financial.inventory.getInvoice({ id: purchase.group.id })).toMatchObject({ group: { remainingDebtDzd: "80.00", paidAmountDzd: "20.00" } });
  expect((await client.financial.debts.detail({ id: purchase.group.debtAccountId! })).entries.find(row => row.id === payableOriginal)?.remainingDzd).toBe("80.00");
  expect((await client.financial.debts.detail({ id: receivable.id })).entries.find(row => row.id === receivableOriginal)?.remainingDzd).toBe("30.00");
  expect(await client.financial.debts.summary()).toMatchObject({ grossPayableDzd: "80.00", grossReceivableDzd: "30.00" });
  expect(await client.financial.inventory.locationContents({ warehouseId: warehouse.item.id })).toEqual(before);
}, 60000);

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
  const manualSnapshot = { payable: await client.financial.debts.detail({ id: payable.id }), receivable: await client.financial.debts.detail({ id: receivable.id }), history: await client.financial.manualSettlement.history({ externalCounterpartyId: party.item.id }) };
  await expect(client.financial.debts.void({ requestId: "public-manual-void", entryId: pair.payableOriginalEntryId, voidReason: "Cancel participating source" })).rejects.toThrow(/Reverse the linked settlement first/i);
  expect({ payable: await client.financial.debts.detail({ id: payable.id }), receivable: await client.financial.debts.detail({ id: receivable.id }), history: await client.financial.manualSettlement.history({ externalCounterpartyId: party.item.id }) }).toEqual(manualSnapshot);
  expect(() => finance.voidEntry({ requestId: "cancel-live-payable", entryId: pair.payableOriginalEntryId, voidReason: "Cancel participating source" })).toThrow(/Reverse the linked settlement first/i);
  expect(() => finance.voidEntry({ requestId: "cancel-live-receivable", entryId: pair.receivableOriginalEntryId, voidReason: "Cancel participating source" })).toThrow(/Reverse the linked settlement first/i);
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
  expect((await client.financial.manualSettlement.history({ externalCounterpartyId: party.item.id })).items).toMatchObject([{ ...saved.settlement, reversal: null, payableSource: { kind: "MANUAL" }, receivableSource: { kind: "MANUAL" } }]);
  await expect(client.financial.manualSettlement.confirm({ ...input, requestId: "stale" })).rejects.toMatchObject({ code: "CONFLICT", data: { manualSettlementOutcome: "UNCOMMITTED" } });
  await expect(client.financial.manualSettlement.confirm({ ...input, amountDzd: "24.00" })).rejects.toMatchObject({ code: "CONFLICT" });
  for (const id of [payable.id, receivable.id]) expect((await operator.financial.manualSettlement.accountHistory({ debtAccountId: id })).items).toMatchObject([{ ...saved.settlement, reversal: null, payableSource: { kind: "MANUAL" }, receivableSource: { kind: "MANUAL" } }]);
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
  expect((await client.financial.manualSettlement.history({ externalCounterpartyId: party.item.id })).items).toMatchObject([{ ...saved.settlement, reversal: reversed.reversal, payableSource: { kind: "MANUAL" }, receivableSource: { kind: "MANUAL" } }]);
  await expect(client.financial.manualSettlement.reverse({ requestId: "missing", settlementId: randomUUID(), reason: "Missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  for (const id of [payable.id, receivable.id]) expect((await operator.financial.manualSettlement.accountHistory({ debtAccountId: id })).items).toMatchObject([{ ...saved.settlement, reversal: reversed.reversal, payableSource: { kind: "MANUAL" }, receivableSource: { kind: "MANUAL" } }]);
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
    expect(linked.items.find(item => item.id === saved.settlement.id)).toMatchObject({ ...saved.settlement, reversal: reversed.reversal, payableSource: { kind: "MANUAL" }, receivableSource: { kind: "MANUAL" } });
  }
  const produced = finance.forProducer({ type: "PAYROLL_ADVANCE", id: randomUUID() }).postEntry({ requestId: "producer", debtAccountId: payable.id, entryType: "ADJUSTMENT", signedAmountDzd: "1.00" });
  const beforeRefusal = finance.listEntries(payable.id);
  await expect(client.financial.manualSettlement.confirm({ ...input, requestId: "producer-refused", payableOriginalEntryId: produced.id, amountDzd: "1.00", expectedPayableRemainingDzd: "1.00" })).rejects.toMatchObject({ code: "CONFLICT" });

  expect(finance.listEntries(payable.id)).toEqual(beforeRefusal);
  const inventory = root.financial.services.inventory;
  const purchase = await client.financial.inventory.createInvoice({ requestId: "settle-purchase", warehouseId: warehouse.item.id, externalCounterpartyId: party.item.id, createDebt: true, paymentInputType: "AMOUNT", paidAmountDzd: "20000.00",
    entries: [{ kind: "CONSUMABLE", itemDefinitionId: material.item.id, quantity: 2, priceSource: { mode: "agreed-total", total: "100000.00", quantity: "2" } }] });
  const sale = await client.financial.inventory.createOutbound({ requestId: "settle-sale", fromType: "WAREHOUSE", fromId: warehouse.item.id,
    counterpartyId: party.item.id, transferType: "SALE", debtAmountDzd: "30000.00", firstPaymentAmountDzd: "5000.00", items: [{ itemId: material.item.id, quantity: 1, unitPriceDzd: "30000.00" }] });
  const purchaseOriginal = purchase.group.debtEntryId!;
  const saleOriginal = sale.debtEntryId!;
  unchanged = physicalSnapshot();
  const settlementPair = { externalCounterpartyId: party.item.id, payableOriginalEntryId: purchaseOriginal, receivableOriginalEntryId: saleOriginal, currency: "DZD" as const, amountDzd: "25000.00" };
  expect(await client.financial.manualSettlement.preview(settlementPair)).toMatchObject({ payableRemainingDzd: "80000.00", receivableRemainingDzd: "25000.00", projectedPayableRemainingDzd: "55000.00", projectedReceivableRemainingDzd: "0.00" });
  const inventoryState = () => Object.fromEntries(tables.filter(name => (name.includes("inventory") && !name.includes("invoice_group") && !name.includes("outbound_transfer")) || name.includes("project_cost") || name.includes("asset_charge")).map(name => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
  const sourceState = inventoryState();
  const purchaseHeader = inventory.getInvoiceGroup(purchase.group.id).group;
  const saleHeader = inventory.getOutboundTransfer(sale.id);
  expect(await client.financial.manualSettlement.candidates({ externalCounterpartyId: party.item.id })).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: purchaseOriginal, direction: "PAYABLE", remainingDzd: "80000.00" }),
    expect.objectContaining({ id: saleOriginal, direction: "RECEIVABLE", remainingDzd: "25000.00" }),
  ]));
  const actualPayments = () => [purchase.group.debtEntryId, sale.debtEntryId].map(id => finance.listEntries(id === purchase.group.debtEntryId ? purchase.group.debtAccountId! : sale.associatedDebtAccountId!).filter(entry => entry.entryType === "PAYMENT").map(entry => ({ amount: entry.signedAmountDzd, method: entry.paymentMethod, target: entry.targetEntryId })));
  const paymentsBefore = actualPayments();
  const confirm = { ...settlementPair, requestId: "settle-inventory-pair", expectedPayableRemainingDzd: "80000.00", expectedReceivableRemainingDzd: "25000.00" };
  const settled = await client.financial.manualSettlement.confirm(confirm);
  expect(settled.preview).toMatchObject({ projectedPayableRemainingDzd: "55000.00", projectedReceivableRemainingDzd: "0.00" });
  expect(inventoryState()).toEqual(sourceState);
  expect(actualPayments()).toEqual(paymentsBefore);
  expect(finance.remaining(purchaseOriginal)).toBe("55000.00");
  expect(finance.remaining(saleOriginal)).toBe("0.00");
  await expect(client.financial.inventory.recordOutboundPayment({ requestId: "overpay-live-sale", transferId: sale.id, amountDzd: "0.01" })).rejects.toThrow(/exceeds/i);
  const settledPurchaseHeader = inventory.getInvoiceGroup(purchase.group.id).group;
  expect({ ...settledPurchaseHeader, remainingDebtDzd: purchaseHeader.remainingDebtDzd, updatedAt: purchaseHeader.updatedAt }).toEqual(purchaseHeader);
  expect({ ...inventory.getOutboundTransfer(sale.id), remainingDebtDzd: saleHeader.remainingDebtDzd }).toEqual(saleHeader);
  expect(inventory.getInvoiceGroup(purchase.group.id).group.remainingDebtDzd).toBe("55000.00");
  const inventoryReversal = await client.financial.manualSettlement.reverse({ requestId: "reverse-inventory-pair", settlementId: settled.settlement.id, reason: "Test reversal" });
  expect(inventoryReversal.settlement.id).toBe(settled.settlement.id);
  expect(inventoryState()).toEqual(sourceState);
  expect(actualPayments()).toEqual(paymentsBefore);
  expect(finance.remaining(purchaseOriginal)).toBe("80000.00");
  expect(finance.remaining(saleOriginal)).toBe("25000.00");
  const reversedPurchaseHeader = inventory.getInvoiceGroup(purchase.group.id).group;
  expect({ ...reversedPurchaseHeader, remainingDebtDzd: purchaseHeader.remainingDebtDzd, updatedAt: purchaseHeader.updatedAt }).toEqual(purchaseHeader);
  expect({ ...inventory.getOutboundTransfer(sale.id), remainingDebtDzd: saleHeader.remainingDebtDzd }).toEqual(saleHeader);
  expect(inventory.getInvoiceGroup(purchase.group.id).group.remainingDebtDzd).toBe("80000.00");
  const reverseInventoryInput = { requestId: "reverse-inventory-pair", settlementId: settled.settlement.id, reason: "Test reversal" };
  expect(await client.financial.manualSettlement.reverse(reverseInventoryInput)).toEqual(inventoryReversal);
  await expect(client.financial.manualSettlement.reverse({ ...reverseInventoryInput, requestId: "duplicate-inventory-reversal" })).rejects.toMatchObject({ code: "CONFLICT" });
  expect(() => inventory.recordOutboundPayment({ requestId: "overpay-after-settlement", transferId: sale.id, amountDzd: "25000.01" })).toThrow(/exceeds/i);
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
  expect((await reopenedOperator.financial.manualSettlement.history({ externalCounterpartyId: party.item.id })).items).toContainEqual(expect.objectContaining({ id: settled.settlement.id, reversal: inventoryReversal.reversal }));
  expect(reopened.financial.services.finance.remaining(purchaseOriginal)).toBe("80000.00");
  expect(reopened.financial.services.inventory.getInvoiceGroup(purchase.group.id).group.remainingDebtDzd).toBe("80000.00");
  expect(reopened.financial.services.inventory.getOutboundTransfer(sale.id).remainingDebtDzd).toBe("25000.00");
  expect((await retry.financial.manualSettlement.history({ externalCounterpartyId: party.item.id })).items.find(row => row.id === saved.settlement.id)?.reversal).toEqual(reversed.reversal);
}, 60000);
