import { randomUUID } from "node:crypto"

import { expect, type Page } from "@playwright/test"

import { findE2eDatabase, loadDatabaseConstructor, seedWarehouse } from "./db-seed"
import { uniqueSuffix } from "./session"

export type TransferFixture = ReturnType<typeof seedTransferAsset>

/** Each attempt owns its asset and project, independent of earlier transfers. */
export function seedTransferAsset() {
  const suffix = uniqueSuffix()
  const warehouseId = seedWarehouse({ name: `مستودع احتساب ${suffix}` })
  const destinationWarehouseId = seedWarehouse({ name: `مستودع وجهة ${suffix}` })
  const projectId = randomUUID()
  const projectName = `مشروع تحويل ${suffix}`
  const assetId = randomUUID()
  const invoiceId = randomUUID()
  const definitionId = randomUUID()
  const entryId = randomUUID()
  const assetName = `مثقاب تحويل ${suffix}`
  const now = new Date().toISOString()
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    db.pragma("foreign_keys = ON")
    db.prepare(`INSERT INTO project (id, name, status, created_at, updated_at)
      VALUES (?, ?, 'ACTIVE', ?, ?)`).run(projectId, projectName, now, now)
    db.prepare(`INSERT INTO inventory_item_definition
      (id, name, item_type, created_at, updated_at)
      VALUES (?, ?, 'ASSET', ?, ?)`).run(definitionId, assetName, now, now)
    db.prepare(`INSERT INTO inventory_invoice_group
      (id, warehouse_id, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run(invoiceId, warehouseId, now, now)
    db.prepare(`INSERT INTO inventory_entry
      (id, invoice_group_id, item_definition_id, warehouse_id, item_type,
       item_name, quantity, total_price_dzd, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'ASSET', ?, 1, 5000, ?, ?)`)
      .run(entryId, invoiceId, definitionId, warehouseId, assetName, now, now)
    db.prepare(`INSERT INTO inventory_asset_unit
      (id, inventory_entry_id, asset_name, purchase_price_dzd,
       current_warehouse_id, created_at, updated_at)
      VALUES (?, ?, ?, 5000, ?, ?, ?)`)
      .run(assetId, entryId, assetName, warehouseId, now, now)
  } finally {
    db.close()
  }
  return { assetId, assetName, invoiceId, projectId, projectName, warehouseId, destinationWarehouseId }
}

export function readPlacement(fixture: TransferFixture) {
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    return {
      unit: db.prepare(`SELECT current_warehouse_id AS warehouseId,
        current_project_id AS projectId FROM inventory_asset_unit WHERE id = ?`).get(fixture.assetId),
      charges: db.prepare(`SELECT amount_dzd AS amountDzd, project_id AS projectId,
        status FROM inventory_asset_charge WHERE asset_unit_id = ?`).all(fixture.assetId),
    }
  } finally {
    db.close()
  }
}

export async function openTransfer(page: Page, fixture: TransferFixture) {
  await page.goto(`/invoices/${fixture.invoiceId}`)
  await expect(page.getByText(fixture.assetName).first()).toBeVisible()
  await page.getByRole("button", { name: "تحويل الأصل", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  return page.getByRole("dialog")
}

export async function transferToProject(page: Page, fixture: TransferFixture) {
  const dialog = await openTransfer(page, fixture)
  await dialog.getByLabel("نوع الوجهة").selectOption("PROJECT")
  await dialog.getByLabel(/^الوجهة/).selectOption(fixture.projectId)
  await expect(dialog.getByLabel("مبلغ الاحتساب", { exact: true })).toHaveValue("5000")
  await expect(dialog.getByLabel("النسبة من سعر الشراء")).toHaveValue("0")
  await dialog.getByRole("button", { name: "تأكيد التحويل" }).click()
  await expect(dialog).toBeHidden()
  await expect.poll(() => readPlacement(fixture)).toEqual({
    unit: { warehouseId: null, projectId: fixture.projectId },
    charges: [{ amountDzd: 5000, projectId: fixture.projectId, status: "LIVE" }],
  })
}

export async function openHistory(page: Page) {
  await page.getByRole("button", { name: "سجل الاحتساب", exact: true }).click()
  const history = page.getByTestId("asset-charge-history")
  await expect(history).toBeVisible()
  return history
}

export async function expectProjectCost(page: Page, fixture: TransferFixture, amount: number) {
  await page.goto(`/projects/${fixture.projectId}`)
  await page.getByRole("tab", { name: "التكلفة", exact: true }).click()
  const panel = page.getByRole("tabpanel", { name: "التكلفة", exact: true })
  const numericText = amount.toLocaleString("en-US")
  const total = panel.locator("section").filter({ has: page.getByRole("heading", { name: "الإجمالي", exact: true }) })
  const contribution = panel.getByRole("listitem").filter({ hasText: "عتاد مخصّص" })
  const stock = panel.locator("section").filter({ has: page.getByRole("heading", { name: "عتاد على المشروع", exact: true }) })
  const asset = stock.getByRole("listitem").filter({ hasText: fixture.assetName })
  for (const surface of [total.locator("p"), contribution, asset]) {
    const numericRun = surface.locator('bdi[dir="ltr"]')
    await expect(numericRun).toHaveText(numericText)
    const placement = await numericRun.evaluate(element => {
      const label = element.previousElementSibling!
      return {
        label: label.textContent,
        labelDirection: label.getAttribute("dir"),
        labelRight: label.getBoundingClientRect().right,
        numberLeft: element.getBoundingClientRect().left,
      }
    })
    expect(placement.label).toBe("دج")
    expect(placement.labelDirection).toBe("rtl")
    expect(placement.labelRight).toBeLessThanOrEqual(placement.numberLeft + 0.5)
  }
}
