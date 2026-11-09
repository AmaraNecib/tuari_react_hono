/* Black-box tests of the reportsGenerate RPC through a real router with a
   REAL full-schema in-memory database and REAL inventory + finance services.

   These are the meaningful API tests behind issue #242: they seed actual
   debt/inventory/movement data, then assert the report aggregates, date
   windows, and empty-range behavior — replacing the previous all-zero stubs.
   The client is untyped (like router.test.ts), hence the ts-nocheck. */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

import { MAX_MONEY_DZD } from "@tuari/contracts";

import { createRouter } from "../router";
import { toReportOrpcError } from "./reports";
import type { RpcContext } from "../context";
import { BetterSqlite3Executor } from "../../infrastructure/database/sqlite-executor";
import { ensureDatabaseSchema } from "../../infrastructure/database/schema";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { SqliteCompanyRepository } from "../../modules/company/company.repository";
import { CompanyService } from "../../modules/company/company.service";
import { FinanceService } from "../../modules/company/finance.service";
import { WorkforceService } from "../../modules/company/workforce.service";
import { OperationsService } from "../../modules/company/operations.service";
import { WorkspaceMutationContext } from "../../modules/company/workspace-mutation-context";
import { createInventoryRepository } from "../../modules/inventory/adapters/sqlite-inventory.repository";
import { createAssetChargeRepository } from "../../modules/inventory/adapters/sqlite-asset-charge.repository";
import { AssetChargeService } from "../../modules/inventory/asset-charge.service";
import { InventoryService } from "../../modules/inventory/inventory.service";
import { InventoryAttachmentStorage } from "../../modules/inventory/inventory.storage";
import { EmployeeModule } from "../../modules/workforce/employee.module";
import { SqliteEmployeeRepository } from "../../modules/workforce/adapters/employee.repository";
import { SqliteRoleRepository } from "../../modules/workforce/adapters/role.repository";
import { RoleModule } from "../../modules/rbac/role.module";
import { InMemoryRoleRepository } from "../../modules/rbac/adapters/in-memory-role.repository";
import { DEFAULT_ROLE_PERMISSIONS } from "../../modules/rbac/role-seeds";

const AUDIT = {
  actorUserId: "user-1",
  actorLabel: "Report Test User",
  transactionId: "tx-reports",
};

// ---------------------------------------------------------------------------
// Full-schema in-memory environment
// ---------------------------------------------------------------------------

function createEnvironment() {
  const raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  return { raw };
}

async function createReportEnvironment() {
  const { raw } = createEnvironment();
  await ensureDatabaseSchema(new BetterSqlite3Executor(raw));
  const companyRepo = new SqliteCompanyRepository(raw);
  // A project placement now requires the charge service (it must never book an
  // uncharged placement), so the seeds that create assets on a project wire it
  // over the SAME connection lock the inventory repo uses (#422 round 5).
  const connectionLock = createFifoLock();
  const inventoryRepo = createInventoryRepository(raw, connectionLock);
  const mutation = new WorkspaceMutationContext(companyRepo);
  const financeService = new FinanceService(companyRepo, companyRepo, mutation);
  const inventoryService = new InventoryService(
    inventoryRepo,
    new InventoryAttachmentStorage(join(tmpdir(), "reports-test-attachments")),
    financeService,
    undefined,
    new AssetChargeService(createAssetChargeRepository(raw, connectionLock), inventoryRepo),
  );
  const service = new CompanyService(companyRepo);
  const workforceService = new WorkforceService(companyRepo, companyRepo, mutation);
  const operationsService = new OperationsService(companyRepo, companyRepo, mutation);

  const employeeRepository = new SqliteEmployeeRepository(companyRepo);
  const roleRepository = new SqliteRoleRepository(companyRepo);
  const employeeModule = new EmployeeModule({ employeeRepository, roleRepository });
  const rbacRoleRepository = new InMemoryRoleRepository();
  for (const seed of DEFAULT_ROLE_PERMISSIONS) {
    rbacRoleRepository.seed({
      id: `id-${seed.role.key}`,
      key: seed.role.key,
      name: seed.role.name,
      description: seed.role.description,
      isSystem: seed.role.isSystem,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      permissions: [...seed.permissions],
    });
  }
  const roleModule = new RoleModule({ repository: rbacRoleRepository });

  const router = createRouter({
    authBootstrapService: {
      getSetupStatus: async () => ({ hasUsers: false, requiresSetupKey: false }),
      isBootstrapOwner: async () => true,
      bootstrapFirstUser: async () => ({
        success: true as const,
        message: "created",
        item: { id: "user-1", name: "T", phone: "0612345678" },
      }),
    },
    companyService: service,
    workforceService,
    operationsService,
    financeService,
    inventoryService,
    employeeModule,
    invoiceModule: {} as never,
    paymentModule: {} as never,
    roleModule,
    recoveryKeyService: {} as never,
    updateService: {} as never,
    updateHistoryService: {} as never,
    databaseKeyManager: {} as never,
    databaseKeyPersister: {} as never,
  } as never);

  const currentUser = {
    id: "user-1",
    name: "Taylor",
    phone: "0612345678",
    permissions: ["debts:read", "debts:create", "debts:settle", "inventory:read", "inventory:create", "inventory:transfer"],
    version: "0.0.0",
  };
  const context = (): RpcContext => ({
    headers: new Headers({ cookie: "session=token" }),
    resolveCurrentUser: vi.fn().mockResolvedValue(currentUser),
  });
  const client = createRouterClient(router, { context: context() as never });

  return {
    raw,
    client,
    companyRepo,
    inventoryRepo,
    inventoryService,
    financeService,
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const daysBetween = (reportIso: string, fromIso: string) =>
  Math.max(0, Math.floor((Date.parse(reportIso) - Date.parse(fromIso)) / MS_PER_DAY));

describe("reportsGenerate — real aggregations over seeded data (issue #242)", () => {
  const environments: Array<ReturnType<typeof createReportEnvironment>> = [];

  afterEach(() => {
    while (environments.length > 0) {
      environments.pop()?.raw.close();
    }
  });

  const setup = async () => {
    const env = await createReportEnvironment();
    environments.push(env);
    return env;
  };

  // ------------------------------------------------------------------
  // DEBT report
  // ------------------------------------------------------------------

  function seedDebts(env: ReturnType<typeof createReportEnvironment>) {
    const { financeService, companyRepo, raw } = env;

    // FinanceService.createDebtAccount requires the internal worker to hold
    // the "worker" role key. That role is now a seeded default (issue #20), so
    // we reuse the seeded role instead of inserting one.
    const workerRoleId = (raw
      .prepare('SELECT id FROM "role" WHERE key = ?')
      .get("worker") as { id: string }).id;

    const counterpartyA = financeService.createExternalCounterparty(
      { fullName: "شركة الفاضل", phoneNumber: "0661234567" },
      AUDIT,
    ).item;
    const counterpartyB = financeService.createExternalCounterparty(
      { fullName: "مؤسسة النور", phoneNumber: "0777654321" },
      AUDIT,
    ).item;

    const employee = companyRepo.createEmployee(
      {
        firstName: "أحمد",
        lastName: "بن علي",
        phone: "0555555555",
        roleId: workerRoleId,
        status: "ACTIVE",
      },
      AUDIT,
    );

    // Party A: opened 2026-01-01 with 50k, paid 20k on 2026-02-01 → 30k OPEN.
    const accountA = financeService.createDebtAccount(
      {
        direction: "PAYABLE",
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterpartyA.id,
        openingBalanceDzd: 50000,
        openingEntryDate: "2026-01-01T10:00:00+01:00",
      },
      AUDIT,
    ).item;
    financeService.createDebtEntry(
      {
        debtAccountId: accountA.id,
        entryType: "PAYMENT",
        signedAmountDzd: -20000,
        entryDate: "2026-02-01T10:00:00+01:00",
        note: "دفعة أولى",
      },
      AUDIT,
    );

    // Party B: opened 2025-03-15 with 200k, settled 2026-05-20 → SETTLED.
    const accountB = financeService.createDebtAccount(
      {
        direction: "PAYABLE",
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: counterpartyB.id,
        openingBalanceDzd: 200000,
        openingEntryDate: "2025-03-15T10:00:00+01:00",
      },
      AUDIT,
    ).item;
    financeService.settleDebtAccount(
      { id: accountB.id, entryDate: "2026-05-20T10:00:00+01:00" },
      AUDIT,
    );

    // Worker W1: opened 2026-04-10 with 80k → OPEN.
    const accountW = financeService.createDebtAccount(
      {
        direction: "PAYABLE",
        partyType: "INTERNAL_WORKER",
        workerId: employee.id,
        openingBalanceDzd: 80000,
        openingEntryDate: "2026-04-10T10:00:00+01:00",
      },
      AUDIT,
    ).item;

    return { accountA, accountB, accountW };
  }

  it("DEBT: aggregates outstanding/settled/overdue/aging/parties/top-debtors from real data", async () => {
    const env = await setup();
    seedDebts(env);

    const report = await env.client.reportsGenerate({
      type: "DEBT",
      endDate: "2026-06-01T00:00:00+01:00",
    });

    expect(report.type).toBe("DEBT");
    expect(report.summary).toEqual({
      totalOutstandingDzd: 110000,
      totalSettledDzd: 200000,
      overdueDzd: 30000,
      partyCount: 3,
    });

    // A (opened 2026-01-01, ~150d) → 60+ bucket; W1 (2026-04-10, ~51d) → 31-60.
    expect(report.agingBreakdown).toEqual([
      { ageCategory: "0-30_DAYS", countOpen: 0, amountDzd: 0 },
      { ageCategory: "31-60_DAYS", countOpen: 1, amountDzd: 80000 },
      { ageCategory: "60+_DAYS", countOpen: 1, amountDzd: 30000 },
    ]);

    expect(report.byParty).toHaveLength(3);
    const byPartyName = Object.fromEntries(
      report.byParty.map((p) => [p.partyName, p]),
    );
    expect(byPartyName["شركة الفاضل"]).toMatchObject({
      partyType: "EXTERNAL_COUNTERPARTY",
      outstandingDzd: 30000,
      settledDzd: 0,
      lastTransaction: "2026-02-01T10:00:00+01:00",
    });
    expect(byPartyName["مؤسسة النور"]).toMatchObject({
      partyType: "EXTERNAL_COUNTERPARTY",
      outstandingDzd: 0,
      settledDzd: 200000,
      lastTransaction: "2026-05-20T10:00:00+01:00",
    });
    expect(byPartyName["أحمد بن علي"]).toMatchObject({
      partyType: "INTERNAL_WORKER",
      outstandingDzd: 80000,
      settledDzd: 0,
      lastTransaction: "2026-04-10T10:00:00+01:00",
    });

    // Top debtors ordered by outstanding; W1 first, then A.
    expect(report.topDebtors).toEqual([
      {
        partyName: "أحمد بن علي",
        amountDzd: 80000,
        daysSinceLastPayment: daysBetween("2026-06-01T00:00:00+01:00", "2026-04-10T10:00:00+01:00"),
      },
      {
        partyName: "شركة الفاضل",
        amountDzd: 30000,
        daysSinceLastPayment: daysBetween("2026-06-01T00:00:00+01:00", "2026-02-01T10:00:00+01:00"),
      },
    ]);
  });

  it("DEBT: excludes voided (non-LIVE) entries from live aggregation", async () => {
    const env = await setup();
    const cp = env.financeService.createExternalCounterparty(
      { fullName: "طرف ملغى", phoneNumber: "0699999901" },
      AUDIT,
    ).item;
    const account = env.financeService.createDebtAccount(
      {
        direction: "PAYABLE",
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: cp.id,
        openingBalanceDzd: 1000,
        openingEntryDate: "2026-05-01T00:00:00+01:00",
      },
      AUDIT,
    ).item;
    const payment = env.financeService.createDebtEntry(
      {
        debtAccountId: account.id,
        entryType: "PAYMENT",
        signedAmountDzd: -200,
        entryDate: "2026-05-10T00:00:00+01:00",
      },
      AUDIT,
    );
    env.financeService.voidDebtEntry({ entryId: payment.item.id, voidReason: "ملغى" }, AUDIT);

    const report = await env.client.reportsGenerate({
      type: "DEBT",
      endDate: "2026-06-01T00:00:00+01:00",
    });
    // Only the LIVE OPENING remains; the voided payment is excluded.
    expect(report.summary.totalSettledDzd).toBe(0);
    const party = report.byParty.find((p) => p.partyName === "طرف ملغى");
    expect(party).toMatchObject({ outstandingDzd: 1000, settledDzd: 0 });
  });

  it("DEBT: includes OPEN receivables as gross exposure (documented direction-agnostic semantics)", async () => {
    const env = await setup();
    seedDebts(env);

    // A RECEIVABLE (someone owes us) OPEN account contributes its balance to
    // outstanding/overdue/aging gross figures alongside payables — this pins
    // the documented "gross exposure across both directions" behavior.
    const receivablesCounterparty = env.financeService.createExternalCounterparty(
      { fullName: "شركة الاستيراد", phoneNumber: "0688881122" },
      AUDIT,
    ).item;
    env.financeService.createDebtAccount(
      {
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: receivablesCounterparty.id,
        direction: "RECEIVABLE",
        openingBalanceDzd: 70000,
        openingEntryDate: "2025-11-01T10:00:00+01:00",
      },
      AUDIT,
    );

    const report = await env.client.reportsGenerate({
      type: "DEBT",
      endDate: "2026-06-01T00:00:00+01:00",
    });

    expect(report.summary.totalOutstandingDzd).toBe(110000 + 70000);
    expect(report.summary.totalSettledDzd).toBe(200000);
    expect(report.summary.overdueDzd).toBe(30000 + 70000);
    expect(report.summary.partyCount).toBe(4);
    const sixtyPlus = report.agingBreakdown.find((a) => a.ageCategory === "60+_DAYS");
    expect(sixtyPlus).toMatchObject({ countOpen: 2, amountDzd: 30000 + 70000 });
  });

  it("DEBT: an account exactly 60 days old goes to the 60+ bucket and counts as overdue (boundary consistency)", async () => {
    const env = await setup();
    const cp = env.financeService.createExternalCounterparty(
      { fullName: "طرف حدودي", phoneNumber: "0666001122" },
      AUDIT,
    ).item;
    env.financeService.createDebtAccount(
      {
        direction: "PAYABLE",
        partyType: "EXTERNAL_COUNTERPARTY",
        externalCounterpartyId: cp.id,
        openingBalanceDzd: 90000,
        openingEntryDate: "2026-04-16T00:00:00+01:00",
      },
      AUDIT,
    );

    // endDate is exactly 60 days after the opening, so age === 60 days.
    const report = await env.client.reportsGenerate({
      type: "DEBT",
      endDate: "2026-06-15T00:00:00+01:00",
    });

    const sixtyPlus = report.agingBreakdown.find((a) => a.ageCategory === "60+_DAYS");
    const thirtyToSixty = report.agingBreakdown.find((a) => a.ageCategory === "31-60_DAYS");
    // age 60 must be in the 60+ bucket (which by definition sums to overdue).
    expect(thirtyToSixty).toMatchObject({ countOpen: 0, amountDzd: 0 });
    expect(sixtyPlus).toMatchObject({ countOpen: 1, amountDzd: 90000 });
    expect(report.summary.overdueDzd).toBe(90000);
  });

  it("DEBT: date window keeps only accounts active in the range", async () => {
    const env = await setup();
    seedDebts(env);

    // Window [2026-02-01, 2026-04-30]: A's payment and W1's opening are in;
    // B (settled 2026-05-20) is out.
    const range = await env.client.reportsGenerate({
      type: "DEBT",
      startDate: "2026-02-01T00:00:00+01:00",
      endDate: "2026-04-30T00:00:00+01:00",
    });
    expect(range.summary).toEqual({
      totalOutstandingDzd: 110000,
      totalSettledDzd: 0,
      overdueDzd: 30000,
      partyCount: 2,
    });

    // Window [2026-05-15, 2026-05-30]: only B's settlement is in.
    const settledOnly = await env.client.reportsGenerate({
      type: "DEBT",
      startDate: "2026-05-15T00:00:00+01:00",
      endDate: "2026-05-30T00:00:00+01:00",
    });
    expect(settledOnly.summary).toEqual({
      totalOutstandingDzd: 0,
      totalSettledDzd: 200000,
      overdueDzd: 0,
      partyCount: 1,
    });

    // Empty range → honest all-zero report with valid shape.
    const empty = await env.client.reportsGenerate({
      type: "DEBT",
      startDate: "2027-01-01T00:00:00+01:00",
      endDate: "2027-01-02T00:00:00+01:00",
    });
    expect(empty.summary).toEqual({
      totalOutstandingDzd: 0,
      totalSettledDzd: 0,
      overdueDzd: 0,
      partyCount: 0,
    });
    expect(empty.agingBreakdown).toHaveLength(3);
    expect(empty.byParty).toHaveLength(0);
    expect(empty.topDebtors).toHaveLength(0);
  });

  // ------------------------------------------------------------------
  // INVENTORY + MOVEMENT report
  // ------------------------------------------------------------------

  function seedInventory(env: ReturnType<typeof createReportEnvironment>) {
    const { companyRepo, inventoryService } = env;

    const wh1 = companyRepo.createWarehouse(
      { name: "مستودع الجزائر", address: "الجزائر", status: "ACTIVE", notes: null },
      AUDIT,
    );
    const wh2 = companyRepo.createWarehouse(
      { name: "المستودع الفرعي", address: "باب الزوار", status: "ACTIVE", notes: null },
      AUDIT,
    );
    const pj1 = companyRepo.createProject(
      { name: "مشروع تجريبي", location: "الوادي", status: "ACTIVE", notes: null },
      AUDIT,
    );

    const cement = inventoryService.createItemDefinition(
      { name: "أسمنت", itemType: "CONSUMABLE", unit: "kg", description: "أسمنت بناء" },
      AUDIT,
    ).item;
    const mixer = inventoryService.createItemDefinition(
      { name: "خلاطة", itemType: "ASSET", description: "خلاطة خرسانة" },
      AUDIT,
    ).item;

    // G1 (2026-01-15): 100kg cement @500 → 50 000 (warehouse) + 2 mixers @2 500 000 → 5 000 000 (project).
    const g1 = inventoryService.createInvoiceGroup(
      {
        invoiceNumber: "IN-00001",
        supplierName: "مورد الإسمنت",
        invoiceDate: "2026-01-15T10:00:00+01:00",
        warehouseId: wh1.id,
        entries: [
          {
            kind: "CONSUMABLE",
            itemDefinitionId: cement.id,
            quantity: 100,
            unitPriceDzd: 500,
            totalPriceDzd: 50000,
            warehouseId: wh1.id,
          },
        ],
      },
      AUDIT,
    ).item;

    const g2 = inventoryService.createInvoiceGroup(
      {
        invoiceNumber: "IN-00002",
        supplierName: "مورد الآلات",
        invoiceDate: "2026-01-15T10:00:00+01:00",
        projectId: pj1.id,
        entries: [
          {
            kind: "ASSET",
            itemDefinitionId: mixer.id,
            projectId: pj1.id,
            assets: [
              { assetName: "خلاطة 1", purchasePriceDzd: 2500000 },
              { assetName: "خلاطة 2", purchasePriceDzd: 2500000 },
            ],
          },
        ],
      },
      AUDIT,
    ).item;

    // G3 (2026-03-10): 50kg cement @600 → 30 000 (warehouse).
    const g3 = inventoryService.createInvoiceGroup(
      {
        invoiceNumber: "IN-00003",
        supplierName: "مورد الإسمنت",
        invoiceDate: "2026-03-10T10:00:00+01:00",
        warehouseId: wh1.id,
        entries: [
          {
            kind: "CONSUMABLE",
            itemDefinitionId: cement.id,
            quantity: 50,
            unitPriceDzd: 600,
            totalPriceDzd: 30000,
            warehouseId: wh1.id,
          },
        ],
      },
      AUDIT,
    ).item;

    // References used by the movement seeds below.
    const cementEntryId = g1.entries.find((e) => e.itemType === "CONSUMABLE")!.id;
    const mixerEntryId = g2.entries.find((e) => e.itemType === "ASSET")!.id;
    const mixerAssetId = g2.movements.find((m) => m.movementType === "PURCHASE" && m.itemType === "ASSET")!.assetUnitId!;

    // Transfer 20kg cement wh1 → wh2 (2026-04-01) and transfer one mixer to wh2.
    inventoryService.transferConsumable(
      {
        inventoryEntryId: cementEntryId,
        quantity: 20,
        fromWarehouseId: wh1.id,
        toWarehouseId: wh2.id,
        occurredAt: "2026-04-01T10:00:00+01:00",
      },
      AUDIT,
    );
    inventoryService.transferAsset(
      {
        assetUnitId: mixerAssetId,
        toWarehouseId: wh2.id,
        occurredAt: "2026-04-01T11:00:00+01:00",
      },
      AUDIT,
    );

    return { wh1, wh2, pj1, g1, g2, g3, cement, mixer, cementEntryId, mixerEntryId, mixerAssetId };
  }

  it("INVENTORY: total value/assets/consumables split honestly from real entries", async () => {
    const env = await setup();
    seedInventory(env);

    const report = await env.client.reportsGenerate({ type: "INVENTORY" });

    expect(report.type).toBe("INVENTORY");
    expect(report.summary).toEqual({
      totalAssetsDzd: 5000000,
      totalConsumablesDzd: 80000,
      totalValueDzd: 5080000,
    });

    // byLocation: warehouse bucket (2 cement entries, 0 assets) + project bucket (2 mixers).
    expect(report.byLocation).toHaveLength(2);
    const byLocation = Object.fromEntries(report.byLocation.map((l) => [l.locationLabel, l]));
    expect(byLocation["المستودع: مستودع الجزائر"]).toMatchObject({
      assetCount: 0,
      assetValueDzd: 0,
      consumableCount: 150,
    });
    expect(byLocation["المشروع: مشروع تجريبي"]).toMatchObject({
      assetCount: 2,
      assetValueDzd: 5000000,
      consumableCount: 0,
    });

    // byItemType groups by item name.
    const byItemType = Object.fromEntries(report.byItemType.map((i) => [i.itemName, i]));
    expect(byItemType["أسمنت"]).toMatchObject({ quantity: 150, valueDzd: 80000 });
    expect(byItemType["خلاطة"]).toMatchObject({ quantity: 2, valueDzd: 5000000 });
  });

  it("INVENTORY: aging buckets derive from the invoice date vs an explicit report date", async () => {
    const env = await setup();
    seedInventory(env);

    // endDate pins the report date so aging is deterministic.
    const report = await env.client.reportsGenerate({
      type: "INVENTORY",
      endDate: "2026-06-01T00:00:00+01:00",
    });

    // G1 (2026-01-15, 2 entries) → 90-180 bucket; G3 (2026-03-10, 1 entry) → 31-90.
    expect(report.agingAnalysis).toEqual([
      { ageCategory: "0-30_DAYS", count: 0, valueDzd: 0 },
      { ageCategory: "31-90_DAYS", count: 1, valueDzd: 30000 },
      { ageCategory: "90-180_DAYS", count: 2, valueDzd: 5050000 },
      { ageCategory: "180+_DAYS", count: 0, valueDzd: 0 },
    ]);
  });

  it("INVENTORY: exact 90- and 180-day ages land in the OLDER bucket (boundary pin)", async () => {
    const env = await setup();
    const { companyRepo, inventoryService } = env;
    const wh = companyRepo.createWarehouse(
      { name: "مستودع الحدود", address: "الجزائر", status: "ACTIVE", notes: null },
      AUDIT,
    );
    const cement = inventoryService.createItemDefinition(
      { name: "حدود", itemType: "CONSUMABLE", unit: "kg", description: null },
      AUDIT,
    ).item;
    // Report date 2026-06-01; invoice exactly 90 days before = 2026-03-03,
    // exactly 180 days before = 2025-12-03.
    inventoryService.createInvoiceGroup(
      {
        invoiceNumber: "B-90",
        supplierName: "مورد",
        invoiceDate: "2026-03-03T00:00:00+01:00",
        warehouseId: wh.id,
        entries: [{ kind: "CONSUMABLE", itemDefinitionId: cement.id, quantity: 1, unitPriceDzd: 90, totalPriceDzd: 90, warehouseId: wh.id }],
      },
      AUDIT,
    );
    inventoryService.createInvoiceGroup(
      {
        invoiceNumber: "B-180",
        supplierName: "مورد",
        invoiceDate: "2025-12-03T00:00:00+01:00",
        warehouseId: wh.id,
        entries: [{ kind: "CONSUMABLE", itemDefinitionId: cement.id, quantity: 1, unitPriceDzd: 180, totalPriceDzd: 180, warehouseId: wh.id }],
      },
      AUDIT,
    );

    const report = await env.client.reportsGenerate({
      type: "INVENTORY",
      endDate: "2026-06-01T00:00:00+01:00",
    });
    expect(report.agingAnalysis).toEqual([
      { ageCategory: "0-30_DAYS", count: 0, valueDzd: 0 },
      { ageCategory: "31-90_DAYS", count: 0, valueDzd: 0 },
      { ageCategory: "90-180_DAYS", count: 1, valueDzd: 90 },
      { ageCategory: "180+_DAYS", count: 1, valueDzd: 180 },
    ]);
  });

  it("INVENTORY: date filter windows receipts; empty range is an honest zero report", async () => {
    const env = await setup();
    seedInventory(env);

    const inMarch = await env.client.reportsGenerate({
      type: "INVENTORY",
      startDate: "2026-03-01T00:00:00+01:00",
      endDate: "2026-03-31T00:00:00+01:00",
    });
    expect(inMarch.summary).toEqual({
      totalAssetsDzd: 0,
      totalConsumablesDzd: 30000,
      totalValueDzd: 30000,
    });
    const inMarchItems = Object.fromEntries(inMarch.byItemType.map((i) => [i.itemName, i]));
    expect(inMarchItems["أسمنت"]).toMatchObject({ quantity: 50, valueDzd: 30000 });
    expect(inMarchItems["خلاطة"]).toBeUndefined();

    const empty = await env.client.reportsGenerate({
      type: "INVENTORY",
      startDate: "2027-01-01T00:00:00+01:00",
      endDate: "2027-02-01T00:00:00+01:00",
    });
    expect(empty.summary).toEqual({
      totalAssetsDzd: 0,
      totalConsumablesDzd: 0,
      totalValueDzd: 0,
    });
    expect(empty.byLocation).toHaveLength(0);
    expect(empty.byItemType).toHaveLength(0);
    expect(empty.agingAnalysis).toHaveLength(4);
    expect(empty.agingAnalysis.every((a) => a.count === 0 && a.valueDzd === 0)).toBe(true);
  });

  it("MOVEMENT: summaries, byType values, byPeriod and top destinations over real movements", async () => {
    const env = await setup();
    const seed = seedInventory(env);

    // One outbound sale movement of 10kg cement @500 — entry-linked, so its
    // value is real. Seeded at the repository (createMovement) because this
    // suite is about aggregation, not the writer; the movement row is identical
    // to the one createOutboundTransfer would write (see
    // outbound-transfer-availability.test.ts for the writer itself).
    env.inventoryRepo.createMovement({
      movementType: "OUTBOUND_SALE",
      itemType: "CONSUMABLE",
      inventoryEntryId: seed.cementEntryId,
      quantity: 10,
      fromWarehouseId: seed.wh1.id,
      note: "بيع 10 كغ أسمنت",
      occurredAt: "2026-04-20T10:00:00+01:00",
    });

    const report = await env.client.reportsGenerate({ type: "MOVEMENT" });

    // Purchases: G1 cement(100) + G1 mixers ×2 + G3 cement(50) = 4 total.
    // Transfers: consumable 20kg + asset 1 unit = 2. Outbound sale = 1.
    expect(report.summary).toEqual({
      totalMovements: 7,
      assetTransfers: 1,
      consumableTransfers: 1,
      outboundSales: 1,
    });

    const byType = Object.fromEntries(report.byType.map((t) => [t.movementType, t]));
    expect(byType.PURCHASE).toEqual({
      movementType: "PURCHASE",
      count: 4,
      valueDzd: 5080000,
    });
    expect(byType.TRANSFER).toEqual({
      movementType: "TRANSFER",
      count: 2,
      valueDzd: 20 * 500 + 2500000,
    });
    expect(byType.OUTBOUND_SALE).toEqual({
      movementType: "OUTBOUND_SALE",
      count: 1,
      valueDzd: 5000,
    });

    // Every movement date is pinned, so every period bucket is deterministic.
    const periods = report.byPeriod;
    const periodCounts = Object.fromEntries(periods.map((p) => [p.period, p.count]));
    const byPeriodValues = Object.fromEntries(periods.map((p) => [p.period, p]));
    expect(periodCounts["2026-01"]).toBe(3); // G1 purchases
    expect(periodCounts["2026-03"]).toBe(1); // G3 purchase
    expect(periodCounts["2026-04"]).toBe(3); // consumable transfer + asset transfer + outbound sale
    expect(periods.reduce((sum, p) => sum + p.count, 0)).toBe(report.summary.totalMovements);
    // January value = G1 cement 50 000 + both mixers 5 000 000.
    expect(byPeriodValues["2026-01"].valueDzd).toBe(5050000);

    // Top destinations: wh1 receives 2 purchases, pj1 receives 2 mixer purchases, wh2 receives 2 transfers.
    const destinations = Object.fromEntries(
      report.topDestinations.map((d) => [d.destinationLabel, d]),
    );
    expect(destinations["المستودع: مستودع الجزائر"]).toMatchObject({ receiveCount: 2 });
    expect(destinations["المشروع: مشروع تجريبي"]).toMatchObject({ receiveCount: 2 });
    expect(destinations["المستودع: المستودع الفرعي"]).toMatchObject({ receiveCount: 2 });
    expect(report.topDestinations.reduce((sum, d) => sum + d.receiveCount, 0)).toBe(6);
  });

  it("MOVEMENT: date filter windows movements; empty range is an honest zero report", async () => {
    const env = await setup();
    seedInventory(env);

    const inApril = await env.client.reportsGenerate({
      type: "MOVEMENT",
      startDate: "2026-04-01T00:00:00+01:00",
      endDate: "2026-04-30T00:00:00+01:00",
    });
    expect(inApril.summary).toEqual({
      totalMovements: 2,
      assetTransfers: 1,
      consumableTransfers: 1,
      outboundSales: 0,
    });

    const empty = await env.client.reportsGenerate({
      type: "MOVEMENT",
      startDate: "2027-01-01T00:00:00+01:00",
      endDate: "2027-02-01T00:00:00+01:00",
    });
    expect(empty.summary).toEqual({
      totalMovements: 0,
      assetTransfers: 0,
      consumableTransfers: 0,
      outboundSales: 0,
    });
    expect(empty.byType.every((t) => t.count === 0 && t.valueDzd === 0)).toBe(true);
    expect(empty.byPeriod).toHaveLength(0);
    expect(empty.topDestinations).toHaveLength(0);
  });

  it("MOVEMENT: asset transfers are valued at the transferred asset's purchase price, not the entry average", async () => {
    const env = await setup();
    const { companyRepo, inventoryService } = env;

    const wh1 = companyRepo.createWarehouse(
      { name: "مستودع الأصلين", address: "الجزائر", status: "ACTIVE", notes: null },
      AUDIT,
    );
    const wh2 = companyRepo.createWarehouse(
      { name: "مستودع النقل", address: "باب الزوار النقل", status: "ACTIVE", notes: null },
      AUDIT,
    );
    const mixer = inventoryService.createItemDefinition(
      { name: "خلاطة متفاوتة", itemType: "ASSET", description: null },
      AUDIT,
    ).item;

    // One invoice entry holding TWO assets at DIFFERENT prices: 1 000 000 and 3 000 000.
    // The entry's unit price is the AVERAGE (4 000 000 / 2 = 2 000 000), but each asset
    // unit keeps its own purchase price to be used when it moves on its own.
    const g = inventoryService.createInvoiceGroup(
      {
        invoiceNumber: "IN-MIXED",
        supplierName: "مورد الأصول",
        invoiceDate: "2026-05-01T10:00:00+01:00",
        warehouseId: wh1.id,
        entries: [
          {
            kind: "ASSET",
            itemDefinitionId: mixer.id,
            warehouseId: wh1.id,
            assets: [
              { assetName: "آلة رخيصة", purchasePriceDzd: 1000000 },
              { assetName: "آلة غالية", purchasePriceDzd: 3000000 },
            ],
          },
        ],
      },
      AUDIT,
    ).item;

    // Find the CHEAPER asset (1 000 000) by listing the entry's asset units.
    const entryId = g.entries.find((e) => e.itemType === "ASSET")!.id;
    const cheapAsset = inventoryService
      .getLocationContents({ warehouseId: wh1.id }) // both assets start in wh1
      .item.assets.find((a) => a.inventoryEntryId === entryId && a.purchasePriceDzd === 1000000)!;
    const expensiveAsset = inventoryService
      .getLocationContents({ warehouseId: wh1.id })
      .item.assets.find((a) => a.inventoryEntryId === entryId && a.purchasePriceDzd === 3000000)!;
    expect(cheapAsset.id).not.toBe(expensiveAsset.id);
    inventoryService.transferAsset(
      {
        assetUnitId: cheapAsset.id,
        toWarehouseId: wh2.id,
        occurredAt: "2026-05-20T10:00:00+01:00",
      },
      AUDIT,
    );

    const report = await env.client.reportsGenerate({ type: "MOVEMENT" });

    // The transfer of the 1 000 000 asset must be valued at ITS purchase price,
    // not the entry average of 2 000 000.
    const byType = Object.fromEntries(report.byType.map((t) => [t.movementType, t]));
    expect(byType.TRANSFER.valueDzd).toBe(1000000);

    const byPeriod = Object.fromEntries(report.byPeriod.map((p) => [p.period, p]));
    // May holds the two purchases (1M + 3M) plus the 1M transfer = 5M.
    expect(byPeriod["2026-05"].valueDzd).toBe(5000000);

    const dest = report.topDestinations.find((d) => d.destinationLabel === "المستودع: مستودع النقل")!;
    expect(dest).toMatchObject({ receiveCount: 1, valueDzd: 1000000 });
  });

  it("generatedAt is a valid offset timestamp on every report", async () => {
    const env = await setup();
    seedDebts(env);
    seedInventory(env);
    for (const type of ["INVENTORY", "DEBT", "MOVEMENT"]) {
      const report = await env.client.reportsGenerate({ type });
      expect(report.type).toBe(type);
      expect(typeof report.generatedAt).toBe("string");
      expect(() => new Date(report.generatedAt).toISOString()).not.toThrow();
    }
  });

  it("rejects an unknown report type at the wire contract", async () => {
    const env = await setup();
    await expect(env.client.reportsGenerate({ type: "BOGUS" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("entry that explicitly picks one destination never inherits the opposite header default", async () => {
    const env = await setup();
    const { companyRepo, inventoryService } = env;

    const wh = companyRepo.createWarehouse(
      { name: "مستودع الإرث", address: "الجزائر", status: "ACTIVE", notes: null },
      AUDIT,
    );
    const pj = companyRepo.createProject(
      { name: "مشروع الإرث", location: "وهران", status: "ACTIVE", notes: null },
      AUDIT,
    );
    const cement = inventoryService.createItemDefinition(
      { name: "أسمنت إرث", itemType: "CONSUMABLE", unit: "kg", description: "" },
      AUDIT,
    ).item;

    // Header defaults to a WAREHOUSE; the line explicitly picks a PROJECT.
    // The line must resolve to the project only — the header warehouse must
    // NOT be re-inherited through the entry's null warehouseId (that would
    // resurrect both destinations and trip the XOR rule).
    const g1 = inventoryService.createInvoiceGroup(
      {
        invoiceNumber: "IN-XOR-1",
        supplierName: "مورد إرث",
        warehouseId: wh.id,
        entries: [
          {
            kind: "CONSUMABLE",
            itemDefinitionId: cement.id,
            quantity: 10,
            unitPriceDzd: 100,
            totalPriceDzd: 1000,
            projectId: pj.id,
          },
        ],
      },
      AUDIT,
    ).item;

    // Header defaults to a PROJECT; the line explicitly picks a WAREHOUSE.
    const g2 = inventoryService.createInvoiceGroup(
      {
        invoiceNumber: "IN-XOR-2",
        supplierName: "مورد إرث",
        projectId: pj.id,
        entries: [
          {
            kind: "CONSUMABLE",
            itemDefinitionId: cement.id,
            quantity: 5,
            unitPriceDzd: 100,
            totalPriceDzd: 500,
            warehouseId: wh.id,
          },
        ],
      },
      AUDIT,
    ).item;

    const entries1 = inventoryService.getInvoiceGroup(g1.group.id).item.entries;
    expect(entries1).toHaveLength(1);
    expect(entries1[0].warehouseId).toBeNull();
    expect(entries1[0].projectId).toBe(pj.id);

    const entries2 = inventoryService.getInvoiceGroup(g2.group.id).item.entries;
    expect(entries2).toHaveLength(1);
    expect(entries2[0].warehouseId).toBe(wh.id);
    expect(entries2[0].projectId).toBeNull();
  });

  it("rethrows a non-domain report error instead of returning it as procedure output (#479 P2)", () => {
    // An appError-carrying failure becomes the typed wire error...
    expect(toReportOrpcError({ appError: { code: "BUSINESS_RULE", message: "over" } })).toMatchObject({
      code: "BUSINESS_RULE",
      message: "over",
    });
    // ...but any other error must be THROWN so `queryAuth` keeps the original
    // cause instead of handing it to ORPC as output (which `reportSchema` would
    // reject with an output-validation error, losing the cause).
    const boom = new Error("boom");
    expect(() => toReportOrpcError(boom)).toThrow(boom);
  });

  it("refuses an unrepresentable inventory aggregate with the business-rule code (#475)", async () => {
    const env = await setup();
    const seed = seedInventory(env);

    // A legacy stored entry at the bound; a second money row pushes the
    // aggregate past MAX_MONEY_DZD. The write gate never wrote these, but the
    // DDL only enforces >= 0, so an older build can leave them.
    const atBound = MAX_MONEY_DZD;
    for (const entryId of [seed.cementEntryId, seed.mixerEntryId]) {
      env.raw
        .prepare('UPDATE "inventory_entry" SET "total_price_dzd" = ? WHERE "id" = ?')
        .run(atBound, entryId);
    }

    await expect(env.client.reportsGenerate({ type: "INVENTORY" })).rejects.toMatchObject({
      code: "BUSINESS_RULE",
    });
  });
});
