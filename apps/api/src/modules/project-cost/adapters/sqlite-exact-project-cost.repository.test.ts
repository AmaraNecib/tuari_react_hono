import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../../infrastructure/database/factory";
import { ensureFreshExactApplicationSchema } from "../../../infrastructure/database/fresh-exact-schema";
import { createFifoLock } from "../../../infrastructure/database/fifo-lock";
import { createFinancialDependencies } from "../../../app/financial-dependencies";
import { SqliteEmployeeEarningRepository } from "../../workforce/adapters/sqlite-employee-earning.repository";
import { ProjectCostService } from "../project-cost.service";
import { createExactProjectCostRepository } from "./sqlite-exact-project-cost.repository";
import type { BetterSqliteDatabase } from "../../../types/sqlite";

const connections: BetterSqliteDatabase[] = [];
afterEach(() => { for (const db of connections.splice(0)) db.close(); });
const now = "2026-11-19T10:00:00.000Z";

describe("exact project cost on the selected application schema", () => {
  it.each(["", "558-project-cost-key"]) ("reconciles source operands and keeps cash separate from labor cost (%s)", async key => {
    const db = createDatabaseConnection(join(mkdtempSync(join(tmpdir(), "tuari-558-cost-")), "application.sqlite"), key);
    connections.push(db);
    await ensureFreshExactApplicationSchema(db);
    const lock = createFifoLock();
    const graph = createFinancialDependencies(db, lock, { id: randomUUID, now: () => now });
    db.prepare("INSERT INTO project(id,name,status,created_at,updated_at) VALUES ('project','Project','ACTIVE',?,?)").run(now, now);
    db.prepare("INSERT INTO warehouse(id,name,status,created_at,updated_at) VALUES ('warehouse','Warehouse','ACTIVE',?,?)").run(now, now);
    const role = db.prepare("SELECT id FROM role WHERE key='worker'").get() as { id: string };
    db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES ('employee','Cost','Worker','0555123987',?,'ACTIVE',?,?)").run(role.id, now, now);
    for (const [id, kind, unit] of [["material", "CONSUMABLE", "m"], ["asset", "ASSET", null]]) {
      db.prepare("INSERT INTO inventory_item_definition(id,name,item_type,unit,is_active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)").run(id, id, kind, unit, now, now);
    }
    const audit = { actorUserId: randomUUID(), actorLabel: "Owner", transactionId: randomUUID() };
    const earning = new SqliteEmployeeEarningRepository(db, lock).create({
      requestId: randomUUID(), employeeId: "employee", currencyCode: "DZD",
      periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z",
      totalAmount: "35000.00", unallocatedAmount: "0.00", referenceSalary: { period: "MONTHLY", amount: "30000.00" },
      segments: [{ id: randomUUID(), projectId: "project", days: 30, amount: "35000.00" }],
    }, "cost-proof", now, audit);
    await graph.expenses.create({ id: randomUUID(), amount: "100.10", expenseDate: now, projectId: "project" }, audit);
    const purchase = graph.inventory.createInvoiceGroup({ requestId: "material-purchase", warehouseId: "warehouse", entries: [{ kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 3, priceSource: { mode: "agreed-total", total: "10.00", quantity: "3" } }], ...audit });
    const entryId = purchase.entries[0]!.id;
    graph.inventory.transferConsumable({ requestId: "in-one", inventoryEntryId: entryId, quantity: 1, fromWarehouseId: "warehouse", toProjectId: "project", ...audit });
    graph.inventory.transferConsumable({ requestId: "in-two", inventoryEntryId: entryId, quantity: 2, fromWarehouseId: "warehouse", toProjectId: "project", ...audit });
    const cost = new ProjectCostService(createExactProjectCostRepository(db, lock));
    expect(cost.getProjectCost({ projectId: "project" }).item.parts.chargedMaterialsAmount).toBe("10.00");
    graph.inventory.transferConsumable({ requestId: "return-one", inventoryEntryId: entryId, quantity: 1, fromProjectId: "project", toWarehouseId: "warehouse", ...audit });
    graph.inventory.createInvoiceGroup({ requestId: "equipment-purchase", projectId: "project", entries: [{ kind: "ASSET", itemDefinitionId: "asset", assets: [{ assetName: "Equipment", purchasePriceDzd: "20.00" }] }], ...audit });
    const before = cost.getProjectCost({ projectId: "project" }).item;
    const inventory = graph.inventory.getProjectContribution("project");
    expect(before.parts).toEqual({ expensesAmount: "100.10", salariesAmount: "35000.00", stockAmount: "20.00", chargedMaterialsAmount: "6.67" });
    expect(before.totalAmount).toBe("35126.77");
    expect(before.parts.chargedMaterialsAmount).toBe(inventory.chargedMaterialsDzd);
    expect(before.parts.stockAmount).toBe(inventory.equipmentChargesDzd);
    expect(before.parkedInventory.totalAmount).toBe("20.00");
    expect(before.materialMovements.every(row => row.unitPrice === null)).toBe(true);
    const cash = graph.payroll.recordCash({ requestId: "cost-cash", employeeId: "employee", amount: "25000.00", paymentDate: now, wages: [{ earningId: earning.id, amount: "25000.00" }], ...audit });
    expect(cash.amount).toBe("25000.00");
    const advance = graph.payroll.recordCash({ requestId: "cost-advance", employeeId: "employee", amount: "5000.00", paymentDate: now, wages: [], advanceAmount: "5000.00", ...audit });
    graph.payroll.offsetAdvance({ requestId: "cost-offset", employeeId: "employee", amount: "2000.00", settlementDate: now, wageSource: { kind: "EARNING", id: earning.id }, advanceSource: { kind: "ADVANCE", id: advance.advance!.id }, ...audit });
    graph.payroll.repayAdvance({ requestId: "cost-repayment", employeeId: "employee", advanceId: advance.advance!.id, amount: "1000.00", paymentDate: now, ...audit });
    expect(cost.getProjectCost({ projectId: "project" }).item).toEqual(before);
    await graph.expenses.create({ id: randomUUID(), amount: "90071992547409.93", expenseDate: now, projectId: "project" }, audit);
    expect(cost.getProjectCost({ projectId: "project" }).item.totalAmount).toBe("90071992582536.70");
  });
});
