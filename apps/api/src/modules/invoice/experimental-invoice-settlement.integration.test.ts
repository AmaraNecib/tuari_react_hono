import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Money, sumMoneyHistory } from "@tuari/contracts";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { ensureFreshExperimentalInvoiceSettlementSchema } from "../../infrastructure/database/fresh-experimental-invoice-settlement-schema";
import { ExactFinanceService } from "../company/exact-finance.service";
import { SqliteExactFinanceRepository } from "../company/adapters/sqlite-exact-finance.repository";
import { SqliteManualSettlementRepository } from "../company/adapters/sqlite-manual-settlement.repository";
import { ManualSettlementService } from "../company/manual-settlement.service";
import { ExperimentalInvoiceSettlementParticipant } from "./experimental-invoice-settlement-participant";
import { SqliteExperimentalInvoiceRepository } from "./adapters/sqlite-exact-invoice.repository";
import { ExperimentalExactInvoiceService } from "./experimental-invoice.service";
import { SqliteExactInventoryRepository } from "../inventory/adapters/sqlite-exact-inventory.repository";
import { ExactInventoryService } from "../inventory/inventory-exact.service";

const party = "00000000-0000-4000-8000-000000000991";
const date = "2026-11-10T00:00:00.000Z";
const dependencies = { id: () => crypto.randomUUID(), now: () => date };
const matrix = [
  "invoice-purchase-sale",
  "invoice-sale-manual-payable",
  "invoice-sale-inventory-purchase",
  "invoice-purchase-outbound-warehouse",
  "invoice-purchase-outbound-project",
] as const;

type Source = { kind: "invoice" | "manual" | "inventory" | "outbound"; originalId: string; accountId: string; invoiceId?: string; inventoryGroupId?: string; stockGroupId?: string; outboundId?: string; initialPaymentEntryId?: string };

it.each(matrix)("native source pairing %s confirms, reloads and reverses without changing source economics", async mode => {
  const path = join(mkdtempSync(join(tmpdir(), `tuari-615-matrix-${mode}-`)), "fixture.sqlite");
  let db = createDatabaseConnection(path, "", { journalMode: "preserve" });
  try {
    await ensureFreshExperimentalInvoiceSettlementSchema(db);
    db.prepare("INSERT INTO external_counterparty(id,full_name,phone_number,note,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(party,"Matrix party","",null,date,date);
    db.prepare("INSERT INTO warehouse(id,name,address,manager_id,status,notes,created_at,updated_at) VALUES ('wh-matrix','Matrix warehouse',NULL,NULL,'ACTIVE',NULL,?,?)").run(date,date);
    db.prepare("INSERT INTO project(id,name,location,manager_id,status,notes,created_at,updated_at) VALUES ('pr-matrix','Matrix project',NULL,NULL,'ACTIVE',NULL,?,?)").run(date,date);
    db.prepare("INSERT INTO inventory_item_definition(id,name,item_type,unit,description,is_active,created_at,updated_at) VALUES ('material','Material','CONSUMABLE','ea',NULL,1,?,?)").run(date,date);

    const compose = (connection: typeof db) => {
      const lock = createFifoLock();
      const ledger = new SqliteExactFinanceRepository(connection, lock);
      const finance = new ExactFinanceService(ledger, dependencies);
      const invoices = new SqliteExperimentalInvoiceRepository(connection, lock);
      const invoiceService = new ExperimentalExactInvoiceService(invoices, finance, dependencies);
      const inventoryRepository = new SqliteExactInventoryRepository(connection, lock);
      const inventory = new ExactInventoryService(inventoryRepository, finance, dependencies);
      const invoiceParticipant = new ExperimentalInvoiceSettlementParticipant(invoices, finance, ledger, dependencies);
      const manualRepository = new SqliteManualSettlementRepository(connection, lock, inventoryRepository, invoiceParticipant);
      const manual = new ManualSettlementService(finance, ledger, manualRepository, { authorize: () => ({ actorUserId: "matrix-operator", actorLabel: "Matrix operator" }) }, dependencies, inventoryRepository, invoiceParticipant);
      return { lock, ledger, finance, invoices, invoiceService, inventoryRepository, inventory, invoiceParticipant, manualRepository, manual };
    };
    let graph = compose(db);
    const makeInvoice = (direction: "PURCHASE" | "SALE", requestId: string): Source => {
      const id = crypto.randomUUID();
      graph.invoiceService.createInvoice({ requestId: `${requestId}-draft`, id, counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party, supplierName: "Matrix party", direction, lineItems: [{ description: "Goods", source: { mode: "agreed-total", total: "100.00", quantity: "1" } }] });
      const received = graph.invoiceService.receiveInvoice({ requestId: `${requestId}-receive`, id });
      graph.invoiceService.createPayment({ requestId: `${requestId}-cash`, counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party, direction, paymentDate: date, paymentMethod: "BANK_TRANSFER", totalAmount: "20.00", allocations: [{ invoiceId: id, amount: "20.00" }] });
      return { kind: "invoice", originalId: received.debtEntryId!, accountId: received.debtAccountId!, invoiceId: id };
    };
    const makeInventoryPurchase = (requestId: string): Source => {
      const purchase = graph.inventory.createInvoiceGroup({ requestId, warehouseId: "wh-matrix", createDebt: true, externalCounterpartyId: party, paymentInputType: "AMOUNT", paidAmountDzd: "20.00", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 1, unitPriceDzd: "100.0000" }] });
      return { kind: "inventory", originalId: purchase.group.debtEntryId!, accountId: purchase.group.debtAccountId!, inventoryGroupId: purchase.group.id };
    };
    const makeOutbound = (project: boolean, requestId: string): Source => {
      const stock = graph.inventory.createInvoiceGroup({ requestId: `${requestId}-stock`, warehouseId: "wh-matrix", entries: [{ kind: "CONSUMABLE", ...(project ? { projectId: "pr-matrix" } : {}), itemDefinitionId: "material", quantity: 1, unitPriceDzd: "100.0000" }] });
      const outbound = graph.inventory.createOutboundTransfer({ requestId, fromType: project ? "PROJECT" : "WAREHOUSE", fromId: project ? "pr-matrix" : "wh-matrix", counterpartyId: party, transferType: "SALE", debtAmountDzd: "100.00", firstPaymentAmountDzd: "20.00", items: [{ itemId: "material", optionId: stock.consumableBalances[0]!.id, quantity: 1 }] });
      return { kind: "outbound", originalId: outbound.debtEntryId!, accountId: outbound.associatedDebtAccountId!, stockGroupId: stock.group.id, outboundId: outbound.id, initialPaymentEntryId: outbound.initialPaymentEntryId! };
    };
    const readCash = (source: Source): unknown => {
      if (source.invoiceId) return graph.invoiceService.listPayments({ filters: { counterpartyId: party } }).items.filter(row => row.allocations.some(allocation => allocation.invoiceId === source.invoiceId)).map(row => ({ id: row.id, totalAmount: row.totalAmount, unallocatedAmount: row.unallocatedAmount, status: row.status, allocations: row.allocations.filter(allocation => allocation.invoiceId === source.invoiceId) }));
      if (source.inventoryGroupId) return graph.inventory.getInvoiceGroup(source.inventoryGroupId).payments.map(row => ({ id: row.id, signedAmountDzd: row.signedAmountDzd, targetEntryId: row.targetEntryId, paymentMethod: row.paymentMethod }));
      if (source.initialPaymentEntryId) return graph.ledger.getEntry(source.initialPaymentEntryId);
      return null;
    };
    let payable: Source;
    let receivable: Source;
    if (mode === "invoice-purchase-sale") {
      payable = makeInvoice("PURCHASE", "inv-p"); receivable = makeInvoice("SALE", "inv-s");
    } else if (mode === "invoice-sale-manual-payable") {
      receivable = makeInvoice("SALE", "inv-s");
      const account = graph.finance.createAccount({ requestId: "manual-payable", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party, direction: "PAYABLE", openingBalanceDzd: "80.00" });
      payable = { kind: "manual", originalId: graph.ledger.listEntries(account.id)[0]!.id, accountId: account.id };
    } else if (mode === "invoice-sale-inventory-purchase") {
      receivable = makeInvoice("SALE", "inv-s"); payable = makeInventoryPurchase("inv-purchase");
    } else {
      payable = makeInvoice("PURCHASE", "inv-p"); receivable = makeOutbound(mode === "invoice-purchase-outbound-project", "outbound-sale");
    }
    expect(graph.finance.remaining(payable.originalId)).toBe("80.00");
    expect(graph.finance.remaining(receivable.originalId)).toBe("80.00");
    const netPosition = () => sumMoneyHistory(graph.finance.listAccounts().filter(account => account.partyType === "EXTERNAL_COUNTERPARTY" && account.externalCounterpartyId === party && account.currency === "DZD").map(account => account.direction === "PAYABLE" ? Money.parse(account.currentBalance) : Money.parse(account.currentBalance).negate()));
    const inventoryBefore = { warehouse: graph.inventory.getLocationContents({ warehouseId: "wh-matrix" }), project: graph.inventory.getLocationContents({ projectId: "pr-matrix" }), contribution: graph.inventory.getProjectContribution("pr-matrix"), stockGroup: (payable.inventoryGroupId ?? receivable.stockGroupId) ? graph.inventory.getInvoiceGroup((payable.inventoryGroupId ?? receivable.stockGroupId)!) : null, outbound: receivable.outboundId ? graph.inventory.getOutboundTransfer(receivable.outboundId) : null };
    const invoiceBefore = [payable, receivable].filter(source => source.invoiceId).map(source => graph.invoiceService.getInvoice(source.invoiceId!));
    const cashBefore = [payable, receivable].map(readCash);
    const previewInput = { currency: "DZD" as const, externalCounterpartyId: party, payableOriginalEntryId: payable.originalId, receivableOriginalEntryId: receivable.originalId, amountDzd: "80.00" };
    const preview = graph.manual.preview(previewInput);
    expect(netPosition()).toBe(preview.netPositionDzd);
    const confirmInput = { ...previewInput, requestId: `pair-${mode}`, expectedPayableRemainingDzd: "80.00", expectedReceivableRemainingDzd: "80.00" };
    const confirmed = graph.manual.confirm(confirmInput);
    expect(confirmed.preview).toEqual(preview);
    expect(confirmed.settlement.payableOriginalEntryId).toBe(payable.originalId);
    expect(confirmed.settlement.receivableOriginalEntryId).toBe(receivable.originalId);
    expect(preview.projectedPayableRemainingDzd).toBe("0.00");
    expect(preview.projectedReceivableRemainingDzd).toBe("0.00");
    expect(graph.finance.remaining(payable.originalId)).toBe("0.00");
    expect(graph.finance.remaining(receivable.originalId)).toBe("0.00");
    const recorded = graph.manual.history({ externalCounterpartyId: party }).items[0]!;
    for (const [source, key] of [[payable, "payableSource"], [receivable, "receivableSource"]] as const) {
      const metadata = recorded[key];
      if (source.kind === "manual") expect(metadata).toMatchObject({ kind: "MANUAL", id: source.originalId });
      else expect(metadata).toEqual({ kind: "RESTRICTED" });
    }
    for (const source of [payable, receivable]) if (source.invoiceId) expect(graph.invoiceService.getInvoice(source.invoiceId)).toMatchObject({ status: "SETTLED", paidAmount: "20.00", settledAmount: "80.00", remainingAmount: "0.00" });
    if (payable.inventoryGroupId) expect(graph.inventory.getInvoiceGroup(payable.inventoryGroupId).group).toMatchObject({ grossTotalDzd: "100.00", paidAmountDzd: "20.00", remainingDebtDzd: "0.00", debtEntryId: payable.originalId });
    if (receivable.outboundId) {
      expect(graph.inventory.getOutboundTransfer(receivable.outboundId).remainingDebtDzd).toBe("0.00");
      expect(graph.inventory.transferHistory({ transferType: "SALE" }).items.find(row => row.id === receivable.outboundId)).toMatchObject({ totalAmountDzd: "100.00", paidAmountDzd: "20.00", remainingDebtDzd: "0.00" });
    }
    for (const source of [payable, receivable]) if (source.invoiceId) expect(graph.invoiceService.getInvoice(source.invoiceId)).toMatchObject({ totalAmount: "100.00", paidAmount: "20.00", settledAmount: "80.00", remainingAmount: "0.00" });
    expect(graph.inventory.getLocationContents({ warehouseId: "wh-matrix" })).toEqual(inventoryBefore.warehouse);
    expect(graph.inventory.getLocationContents({ projectId: "pr-matrix" })).toEqual(inventoryBefore.project);
    expect(graph.inventory.getProjectContribution("pr-matrix")).toEqual(inventoryBefore.contribution);
    if (inventoryBefore.stockGroup) {
      const currentStock = graph.inventory.getInvoiceGroup(inventoryBefore.stockGroup.group.id);
      expect(currentStock.entries).toEqual(inventoryBefore.stockGroup.entries);
      expect(currentStock.consumableBalances).toEqual(inventoryBefore.stockGroup.consumableBalances);
      expect(currentStock.movements).toEqual(inventoryBefore.stockGroup.movements);
    }
    expect([payable, receivable].map(readCash)).toEqual(cashBefore);
    expect(graph.finance.detail(payable.accountId).account.currentBalance).toBe("0.00");
    expect(graph.finance.detail(receivable.accountId).account.currentBalance).toBe("0.00");
    expect(netPosition()).toBe(preview.netPositionDzd);
    db.close(); db = createDatabaseConnection(path, "", { journalMode: "preserve" }); graph = compose(db);
    expect(graph.finance.remaining(payable.originalId)).toBe("0.00");
    expect(graph.finance.remaining(receivable.originalId)).toBe("0.00");
    for (const source of [payable, receivable]) if (source.invoiceId) expect(graph.invoiceService.getInvoice(source.invoiceId)).toMatchObject({ status: "SETTLED", paidAmount: "20.00", settledAmount: "80.00", remainingAmount: "0.00" });
    expect(graph.manual.confirm(confirmInput)).toEqual(confirmed);
    expect([payable, receivable].map(readCash)).toEqual(cashBefore);
    const reversed = graph.manual.reverse({ requestId: `reverse-${mode}`, settlementId: confirmed.settlement.id, reason: "Matrix reversal" });
    expect(graph.finance.remaining(payable.originalId)).toBe("80.00");
    expect(graph.finance.remaining(receivable.originalId)).toBe("80.00");
    expect(graph.manualRepository.getReversal(confirmed.settlement.id)).toEqual(reversed.reversal);
    expect([payable, receivable].filter(source => source.invoiceId).map(source => graph.invoiceService.getInvoice(source.invoiceId!))).toEqual(invoiceBefore);
    if (payable.inventoryGroupId) {
      const currentPurchase = graph.inventory.getInvoiceGroup(payable.inventoryGroupId);
      expect(currentPurchase.group).toMatchObject({ grossTotalDzd: "100.00", paidAmountDzd: "20.00", remainingDebtDzd: "80.00", debtEntryId: payable.originalId });
      expect(currentPurchase.entries).toEqual(inventoryBefore.stockGroup!.entries);
      expect(currentPurchase.consumableBalances).toEqual(inventoryBefore.stockGroup!.consumableBalances);
      expect(currentPurchase.movements).toEqual(inventoryBefore.stockGroup!.movements);
    }
    if (receivable.outboundId) expect(graph.inventory.getOutboundTransfer(receivable.outboundId)).toMatchObject({ ...inventoryBefore.outbound, remainingDebtDzd: "80.00" });
    expect(graph.inventory.getLocationContents({ warehouseId: "wh-matrix" })).toEqual(inventoryBefore.warehouse);
    expect(graph.inventory.getLocationContents({ projectId: "pr-matrix" })).toEqual(inventoryBefore.project);
    expect(graph.inventory.getProjectContribution("pr-matrix")).toEqual(inventoryBefore.contribution);
    expect([payable, receivable].map(readCash)).toEqual(cashBefore);
    expect(netPosition()).toBe(preview.netPositionDzd);
    db.close(); db = createDatabaseConnection(path, "", { journalMode: "preserve" }); graph = compose(db);
    expect(graph.finance.remaining(payable.originalId)).toBe("80.00");
    expect(graph.finance.remaining(receivable.originalId)).toBe("80.00");
    expect([payable, receivable].map(readCash)).toEqual(cashBefore);
    expect(graph.manual.reverse({ requestId: `reverse-${mode}`, settlementId: confirmed.settlement.id, reason: "Matrix reversal" })).toEqual(reversed);
  } finally { db.close(); }
});
