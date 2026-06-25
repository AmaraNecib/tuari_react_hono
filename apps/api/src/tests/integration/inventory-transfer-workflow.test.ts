import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import { schemaStatements as fullSchema } from "../../infrastructure/database/schema-definitions";
import { createInventoryRepository, type InventoryRepository } from "../../modules/inventory/inventory.repository";
import { InventoryService } from "../../modules/inventory/inventory.service";
import { InventoryAttachmentStorage } from "../../modules/inventory/inventory.storage";
import { SqliteCompanyRepository } from "../../modules/company/company.repository";
import type { MutationAuditContext, WarehouseRecord } from "../../modules/company/company.types";

// ---------------------------------------------------------------------------
// In-memory SQLite setup
// ---------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = MEMORY");
  db.pragma("foreign_keys = ON");

  for (const stmt of fullSchema) {
    db.exec(stmt);
  }

  return db;
}

const AUDIT: MutationAuditContext = {
  actorUserId: "user-1",
  actorLabel: "Test User",
  transactionId: "tx-1",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestEnvironment() {
  const db = createTestDb();
  const companyRepo = new SqliteCompanyRepository(db);
  const inventoryRepo = createInventoryRepository(db);
  const attachDir = mkdtempSync(join(tmpdir(), "inventory-test-"));
  const storage = new InventoryAttachmentStorage(attachDir);
  const service = new InventoryService(inventoryRepo, storage);
  const teardown = () => {
    db.close();
    rmSync(attachDir, { recursive: true, force: true });
  };
  return { db, companyRepo, inventoryRepo, service, teardown };
}

function createWarehouse(companyRepo: SqliteCompanyRepository): WarehouseRecord {
  return companyRepo.createWarehouse(
    {
      name: "مستودع الاختبار",
      address: "الجزائر",
      status: "ACTIVE",
      notes: null,
    },
    AUDIT,
  );
}

// ---------------------------------------------------------------------------
// Suite: Inventory transfer
// ---------------------------------------------------------------------------

describe("Cross-domain: Inventory transfer", () => {
  let companyRepo: SqliteCompanyRepository;
  let inventoryRepo: InventoryRepository;
  let service: InventoryService;

  let teardown: () => void;

  beforeEach(() => {
    const env = createTestEnvironment();
    companyRepo = env.companyRepo;
    inventoryRepo = env.inventoryRepo;
    service = env.service;
    teardown = env.teardown;
  });

  afterEach(() => {
    teardown();
  });

  it("creates consumable items → transfers between warehouses → verifies quantities and history", () => {
    // ---- 1. Create two warehouses ----
    const wh1 = createWarehouse(companyRepo);
    const wh2 = companyRepo.createWarehouse(
      {
        name: "المستودع الفرعي",
        address: "باب الزوار",
        status: "ACTIVE",
        notes: null,
      },
      AUDIT,
    );

    // ---- 2. Create item definition ----
    const itemDef = service.createItemDefinition(
      { name: "أسمنت", itemType: "CONSUMABLE", unit: "kg", description: "أسمنت بناء" },
      AUDIT,
    );
    expect(itemDef).not.toBeNull();
    expect(itemDef.item.name).toBe("أسمنت");

    // ---- 3. Create invoice group (stock receipt in WH1) ----
    const invoiceGroup = inventoryRepo.createInvoiceGroup({
      supplierName: "مورد الإسمنت",
      warehouseId: wh1.id,
      grossTotalDzd: 500000,
      paidAmountDzd: 0,
      remainingDebtDzd: 500000,
      note: "توريد أسمنت",
    });
    expect(invoiceGroup).not.toBeNull();

    // ---- 4. Create inventory entry in WH1 ----
    const entry = inventoryRepo.createEntry({
      invoiceGroupId: invoiceGroup.id,
      itemDefinitionId: itemDef.item.id,
      itemType: "CONSUMABLE",
      itemName: "أسمنت",
      unit: "kg",
      quantity: 1000,
      unitPriceDzd: 500,
      totalPriceDzd: 500000,
      warehouseId: wh1.id,
      note: null,
    });
    expect(entry).not.toBeNull();
    expect(entry.quantity).toBe(1000);

    // ---- 5. Create consumable balance in WH1 ----
    const bal1 = inventoryRepo.createConsumableBalance({
      inventoryEntryId: entry.id,
      itemDefinitionId: itemDef.item.id,
      warehouseId: wh1.id,
      quantity: 1000,
    });
    expect(bal1).not.toBeNull();
    expect(bal1.quantity).toBe(1000);

    // ---- 6. Transfer 300 kg from WH1 to WH2 ----
    const transferResult = service.transferConsumable(
      {
        inventoryEntryId: entry.id,
        quantity: 300,
        fromWarehouseId: wh1.id,
        toWarehouseId: wh2.id,
        note: "تحويل 300 كجم إلى المستودع الفرعي",
      },
      AUDIT,
    );
    expect(transferResult).not.toBeNull();

    // ---- 7. Source decreased (700 remaining) ----
    const srcBal = inventoryRepo.getConsumableBalanceByEntryAndLocation({
      inventoryEntryId: entry.id,
      warehouseId: wh1.id,
    });
    expect(srcBal).not.toBeNull();
    expect(srcBal!.quantity).toBe(700);

    // ---- 8. Destination received (300) ----
    const dstBal = inventoryRepo.getConsumableBalanceByEntryAndLocation({
      inventoryEntryId: entry.id,
      warehouseId: wh2.id,
    });
    expect(dstBal).not.toBeNull();
    expect(dstBal!.quantity).toBe(300);

    // ---- 9. Movement history recorded ----
    const movements = inventoryRepo.listMovementsByInvoiceGroupId(invoiceGroup.id);
    const transferMovements = movements.filter(
      (m) =>
        m.fromWarehouseId === wh1.id &&
        m.toWarehouseId === wh2.id &&
        m.quantity === 300,
    );
    expect(transferMovements.length).toBe(1);
    expect(transferMovements[0]!.movementType).toBe("TRANSFER");
    expect(transferMovements[0]!.itemType).toBe("CONSUMABLE");
  });

  it("rejects transfer when source quantity is insufficient", () => {
    const wh1 = createWarehouse(companyRepo);
    const wh2 = companyRepo.createWarehouse(
      {
        name: "مستودع آخر",
        address: "مكان آخر",
        status: "ACTIVE",
        notes: null,
      },
      AUDIT,
    );

    const itemDef = service.createItemDefinition(
      { name: "طوب", itemType: "CONSUMABLE", unit: "piece" },
      AUDIT,
    );

    const invoiceGroup = inventoryRepo.createInvoiceGroup({
      supplierName: "مورد",
      warehouseId: wh1.id,
      grossTotalDzd: 50000,
      paidAmountDzd: 0,
      remainingDebtDzd: 50000,
      note: null,
    });

    const entry = inventoryRepo.createEntry({
      invoiceGroupId: invoiceGroup.id,
      itemDefinitionId: itemDef.item.id,
      itemType: "CONSUMABLE",
      itemName: "طوب",
      unit: "piece",
      quantity: 100,
      unitPriceDzd: 500,
      totalPriceDzd: 50000,
      warehouseId: wh1.id,
      note: null,
    });

    inventoryRepo.createConsumableBalance({
      inventoryEntryId: entry.id,
      itemDefinitionId: itemDef.item.id,
      warehouseId: wh1.id,
      quantity: 100,
    });

    // Trying to transfer 150 pieces (only 100 available)
    expect(() =>
      service.transferConsumable(
        {
          inventoryEntryId: entry.id,
          quantity: 150,
          fromWarehouseId: wh1.id,
          toWarehouseId: wh2.id,
          note: "This should fail",
        },
        AUDIT,
      ),
    ).toThrow(/الكمية/);
  });
});
