import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { exactInventoryDetailSchema, type InventoryInvoiceAttachment } from "@tuari/contracts";
import { ExactFinanceService } from "../company/exact-finance.service";
import { InMemoryExactFinanceRepository } from "../company/adapters/inmemory-exact-finance.repository";
import { InMemoryExactInventoryRepository } from "./adapters/inmemory-exact-inventory.repository";
import { ExactInventoryService } from "./inventory-exact.service";

it("hydrates only the requested purchase's attachment metadata and requires the additive response field", () => {
  const date = "2026-11-10T00:00:00.000Z";
  const dependencies = { id: randomUUID, now: () => date };
  const ledger = new InMemoryExactFinanceRepository({ externalCounterpartyIds: [] });
  const attachments: InventoryInvoiceAttachment[] = [];
  const repo = new InMemoryExactInventoryRepository(ledger.transactionIdentity, { attachments, warehouses: [{ id: "warehouse", name: "Warehouse" }], projects: [], definitions: [{ id: "material", name: "Material", itemType: "CONSUMABLE", unit: "m", description: null, isActive: true, createdAt: date, updatedAt: date }] });
  const inventory = new ExactInventoryService(repo, new ExactFinanceService(ledger, dependencies), dependencies);
  const purchase = inventory.createInvoiceGroup({ requestId: "purchase", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 1, unitPriceDzd: "1.0000" }] });
  expect(purchase.attachments).toEqual([]);
  const expected = { id: "file", invoiceGroupId: purchase.group.id, originalName: "invoice.pdf", mimeType: "application/pdf", byteSize: 1, storageKey: "invoice.pdf", relativePath: "invoice.pdf", downloadUrl: "/api/inventory/attachments/file", sha256: null, createdAt: date };
  attachments.push(expected, { ...expected, id: "other", invoiceGroupId: "other-group" });
  const detail = exactInventoryDetailSchema.strict().parse(inventory.getInvoiceGroup(purchase.group.id));
  expect(detail.attachments).toEqual([expected]);
  const { attachments: omitted, ...oldShape } = detail;
  expect(omitted).toHaveLength(1);
  expect(exactInventoryDetailSchema.safeParse(oldShape).success).toBe(false);
  expect(exactInventoryDetailSchema.safeParse({ ...detail, attachments: [{ ...expected, byteSize: -1 }] }).success).toBe(false);
  expect(() => inventory.getInvoiceGroup("missing")).toThrow(/not found/i);
});
