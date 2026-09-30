import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import { ensureDatabaseSchema } from "../../infrastructure/database/schema";
import { BetterSqlite3Executor } from "../../infrastructure/database/sqlite-executor";
import { createInventoryRepository } from "./adapters/sqlite-inventory.repository";
import { InventoryService } from "./inventory.service";
import { InventoryAttachmentStorage } from "./inventory.storage";
import { SqliteCompanyRepository } from "../company/company.repository";
import { CompanyService } from "../company/company.service";
import type { MutationAuditContext } from "../company/company.types";

const AUDIT: MutationAuditContext = { actorUserId: "user-1", actorLabel: "test", transactionId: "tx-1" };

async function createEnv() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = MEMORY");
  db.pragma("foreign_keys = ON");
  await ensureDatabaseSchema(new BetterSqlite3Executor(db));
  const company = new CompanyService(new SqliteCompanyRepository(db));
  const inventoryRepo = createInventoryRepository(db);
  const attachDir = mkdtempSync(join(tmpdir(), "debt-sign-"));
  const service = new InventoryService(inventoryRepo, new InventoryAttachmentStorage(attachDir), company);
  return {
    db,
    company,
    inventoryRepo,
    service,
    teardown: () => {
      db.close();
      rmSync(attachDir, { recursive: true, force: true });
    },
  };
}

/**
 * Debt signs on the two inventory writers (D4 purchase, D8 outbound sale).
 *
 * Both run over the production schema + migrations so the OUTBOUND_SALE
 * movement constraint and the `(worker_id, direction)` index are the real
 * ones.
 */
describe("Inventory debt signs (D4/D8)", () => {
  let env: Awaited<ReturnType<typeof createEnv>>;

  beforeEach(async () => {
    env = await createEnv();
  });
  afterEach(() => env.teardown());

  function setupPurchaseBase() {
    const supplier = env.company.createExternalCounterparty({ fullName: "مورد", phoneNumber: "0218000001" }, AUDIT).item;
    const warehouse = env.company.createWarehouse({ name: "المستودع", status: "ACTIVE" }, AUDIT).item;
    const item = env.service.createItemDefinition({ name: "إسمنت", itemType: "CONSUMABLE", unit: "kg" }, AUDIT).item;
    return { supplier, warehouse, item };
  }

  describe("D4 — a purchase debt keeps currentBalance === remainingDebtDzd", () => {
    it("signs OPENING +gross and PAYMENT -paid, so 1000 gross / 400 paid / 600 later reaches zero", () => {
      const { supplier, warehouse, item } = setupPurchaseBase();

      const created = env.service.createInvoiceGroup(
        {
          supplierName: "مورد",
          warehouseId: warehouse.id,
          externalCounterpartyId: supplier.id,
          createDebt: true,
          paymentInputType: "AMOUNT",
          paidAmountDzd: 400,
          entries: [{ kind: "CONSUMABLE", itemDefinitionId: item.id, warehouseId: warehouse.id, quantity: 2, unitPriceDzd: 500, totalPriceDzd: 1000 }],
        },
        AUDIT,
      ).item.group;

      const accountId = created.debtAccountId!;
      let account = env.company.getDebtAccount(accountId).item;
      expect(account.direction).toBe("PAYABLE");
      expect(account.currentBalance).toBe(600);
      expect(created.remainingDebtDzd).toBe(600);

      env.service.recordInvoicePayment({ invoiceGroupId: created.id, amountDzd: 600 }, AUDIT);

      account = env.company.getDebtAccount(accountId).item;
      const paidInvoice = env.inventoryRepo.getInvoiceGroupById(created.id)!;
      expect(paidInvoice.remainingDebtDzd).toBe(0);
      expect(account.currentBalance).toBe(paidInvoice.remainingDebtDzd);
      expect(account.currentBalance).toBe(0);
      // The pre-fix bug left the ledger at -1200 here.
      expect(account.currentBalance).not.toBe(-1200);
    });

    it("keeps the invariant across a partial payment sequence", () => {
      const { supplier, warehouse, item } = setupPurchaseBase();

      const created = env.service.createInvoiceGroup(
        {
          invoiceNumber: "INV-1",
          warehouseId: warehouse.id,
          externalCounterpartyId: supplier.id,
          createDebt: true,
          paymentInputType: "AMOUNT",
          paidAmountDzd: 0,
          entries: [{ kind: "CONSUMABLE", itemDefinitionId: item.id, warehouseId: warehouse.id, quantity: 4, unitPriceDzd: 250, totalPriceDzd: 1000 }],
        },
        AUDIT,
      ).item.group;
      const accountId = created.debtAccountId!;

      expect(env.company.getDebtAccount(accountId).item.currentBalance).toBe(1000);

      let expectedRemaining = 1000;
      for (const amount of [200, 300, 500]) {
        env.service.recordInvoicePayment({ invoiceGroupId: created.id, amountDzd: amount }, AUDIT);
        expectedRemaining -= amount;
        const invoice = env.inventoryRepo.getInvoiceGroupById(created.id)!;
        // Absolute expectation, so a bug that dropped the payment from both the
        // ledger and the invoice counter in lockstep cannot pass this test.
        expect(invoice.remainingDebtDzd).toBe(expectedRemaining);
        expect(env.company.getDebtAccount(accountId).item.currentBalance).toBe(invoice.remainingDebtDzd);
      }
      expect(env.company.getDebtAccount(accountId).item.currentBalance).toBe(0);
    });
  });

  describe("D8 — the outbound first payment is implemented", () => {
    function setupOutboundBase() {
      const warehouse = env.company.createWarehouse({ name: "المستودع", status: "ACTIVE" }, AUDIT).item;
      const buyer = env.company.createExternalCounterparty({ fullName: "مشتري", phoneNumber: "0218000002" }, AUDIT).item;
      const item = env.service.createItemDefinition({ name: "مثقاب", itemType: "ASSET", unit: "pc" }, AUDIT).item;
      env.service.createInvoiceGroup(
        {
          invoiceNumber: "INV-ASSET",
          warehouseId: warehouse.id,
          entries: [{ kind: "ASSET", itemDefinitionId: item.id, warehouseId: warehouse.id, assets: [{ assetName: "مثقاب-1", purchasePriceDzd: 1000 }] }],
        },
        AUDIT,
      );
      return { warehouse, buyer, item };
    }

    it("creates a RECEIVABLE and posts the first payment as a real PAYMENT entry", () => {
      const { warehouse, buyer, item } = setupOutboundBase();

      env.service.createOutboundTransfer(
        {
          fromType: "WAREHOUSE",
          fromId: warehouse.id,
          counterpartyId: buyer.id,
          transferType: "SALE",
          items: [{ itemId: item.id, quantity: 1, unitPriceDzd: 500 }],
          debtAmountDzd: 500,
          firstPaymentAmountDzd: 200,
        },
        AUDIT,
      );

      const accounts = env.company.listDebtAccounts({ externalCounterpartyId: buyer.id }).items;
      expect(accounts).toHaveLength(1);
      expect(accounts[0]!.direction).toBe("RECEIVABLE");
      // OPENING +500 (the full sale) then PAYMENT -200 leaves +300 on credit.
      expect(accounts[0]!.currentBalance).toBe(300);

      const entries = env.company.listDebtEntries({ debtAccountId: accounts[0]!.id }).items;
      const opening = entries.find((entry) => entry.entryType === "OPENING")!;
      const firstPayment = entries.find((entry) => entry.entryType === "PAYMENT")!;
      expect(opening.signedAmountDzd).toBe(500);
      expect(firstPayment.signedAmountDzd).toBe(-200);
    });

    it("allows a first payment larger than the remaining balance but not above the transfer value", () => {
      const { warehouse, buyer, item } = setupOutboundBase();

      env.service.createOutboundTransfer(
        {
          fromType: "WAREHOUSE",
          fromId: warehouse.id,
          counterpartyId: buyer.id,
          transferType: "SALE",
          items: [{ itemId: item.id, quantity: 1, unitPriceDzd: 500 }],
          debtAmountDzd: 500,
          firstPaymentAmountDzd: 300,
        },
        AUDIT,
      );

      const account = env.company.listDebtAccounts({ externalCounterpartyId: buyer.id }).items[0]!;
      expect(account.direction).toBe("RECEIVABLE");
      // 300 of 500 paid up front still leaves 200 on credit.
      expect(account.currentBalance).toBe(200);
    });

    it("records the debt with no first payment when none was collected", () => {
      const { warehouse, buyer, item } = setupOutboundBase();

      env.service.createOutboundTransfer(
        {
          fromType: "WAREHOUSE",
          fromId: warehouse.id,
          counterpartyId: buyer.id,
          transferType: "SALE",
          items: [{ itemId: item.id, quantity: 1, unitPriceDzd: 500 }],
          debtAmountDzd: 300,
        },
        AUDIT,
      );

      const account = env.company.listDebtAccounts({ externalCounterpartyId: buyer.id }).items[0]!;
      expect(account.direction).toBe("RECEIVABLE");
      expect(account.currentBalance).toBe(300);
      expect(
        env.company.listDebtEntries({ debtAccountId: account.id }).items.filter((entry) => entry.entryType === "PAYMENT"),
      ).toHaveLength(0);
    });

    it("rejects a first payment larger than the debt amount", () => {
      const { warehouse, buyer, item } = setupOutboundBase();

      expect(() =>
        env.service.createOutboundTransfer(
          {
            fromType: "WAREHOUSE",
            fromId: warehouse.id,
            counterpartyId: buyer.id,
            transferType: "SALE",
            items: [{ itemId: item.id, quantity: 1, unitPriceDzd: 500 }],
            debtAmountDzd: 300,
            firstPaymentAmountDzd: 400,
          },
          AUDIT,
        ),
      ).toThrowError(/الدفعة الأولى/);
    });
  });

  describe("D3 — the worker uniqueness is (worker_id, direction)", () => {
    it("creates the composite index, drops the legacy single-column one, and is idempotent", async () => {
      const indexNames = env.db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'debt_account'`)
        .all()
        .map((row) => (row as { name: string }).name);

      expect(indexNames).toContain("debt_account_worker_direction_unique");
      expect(indexNames).not.toContain("debt_account_worker_unique");

      // Re-running the bootstrap (every startup) must be a no-op.
      await expect(ensureDatabaseSchema(new BetterSqlite3Executor(env.db))).resolves.toBeUndefined();
    });

    it("rejects a second account for the same worker and direction at the database level", () => {
      const roleId = env.company.listRoles().items.find((role) => role.key === "worker")!.id;
      const worker = env.company.createEmployee(
        { firstName: "عامل", lastName: "فهرس", phone: "0551080001", roleId, status: "ACTIVE" },
        AUDIT,
      ).item;

      env.company.createDebtAccount(
        {
        direction: "RECEIVABLE", partyType: "INTERNAL_WORKER", workerId: worker.id, openingBalanceDzd: 100, reasonCategory: "SALARY_ADVANCE" },
        AUDIT,
      );

      // Bypass the service's find-or-reuse lookup and insert the duplicate
      // directly: the unique index must be the last line of defence.
      expect(() =>
        env.db
          .prepare(
            `INSERT INTO "debt_account" (id, party_type, worker_id, external_counterparty_id, status, direction, current_balance, created_at, updated_at) VALUES (?, 'INTERNAL_WORKER', ?, NULL, 'OPEN', 'RECEIVABLE', 100, ?, ?)`,
          )
          .run(crypto.randomUUID(), worker.id, new Date().toISOString(), new Date().toISOString()),
      ).toThrow(/UNIQUE/);
    });
  });
});
