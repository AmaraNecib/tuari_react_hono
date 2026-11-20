import { randomUUID } from "node:crypto"

import { expect, type Page } from "@playwright/test"

import { findE2eDatabase, loadDatabaseConstructor, seedWarehouse } from "./db-seed"
import { uniqueSuffix } from "./session"
import { apiBaseUrl } from "./urls"

export type TransferFixture = Awaited<ReturnType<typeof seedTransferAsset>>

/** Each attempt owns its asset and project, independent of earlier transfers. */
export async function seedTransferAsset(page: Page) {
  const suffix = uniqueSuffix()
  const warehouseId = seedWarehouse({ name: `مستودع احتساب ${suffix}` })
  const destinationWarehouseId = seedWarehouse({ name: `مستودع وجهة ${suffix}` })
  const projectId = randomUUID()
  const projectName = `مشروع تحويل ${suffix}`

  const definitionId = randomUUID()
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

  } finally {
    db.close()
  }
  const response = await page.request.post(`${apiBaseUrl()}/rpc/financial/inventory/createInvoice`, {
    headers: { origin: new URL(page.url()).origin },
    data: { json: { requestId: randomUUID(), warehouseId, entries: [
      { kind: "ASSET", itemDefinitionId: definitionId, assets: [{ assetName, purchasePriceDzd: "5000.00" }] },
    ] } },
  })
  expect(response.ok(), await response.text()).toBe(true)
  const { json: detail } = await response.json()
  const invoiceId: string = detail.group.id
  const assetId: string = detail.entries[0].assets[0].id
  return { assetId, assetName, invoiceId, projectId, projectName, warehouseId, destinationWarehouseId }
}

export function readPlacement(fixture: TransferFixture) {
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    return {
      unit: db.prepare(`SELECT current_warehouse_id AS warehouseId,
        current_project_id AS projectId FROM inventory_asset_unit WHERE id = ?`).get(fixture.assetId),
      charges: db.prepare(`SELECT CAST(amount_minor AS TEXT) AS amountMinor, project_id AS projectId,
        status FROM inventory_asset_charge WHERE asset_unit_id = ?`).all(fixture.assetId).map(row => {
          const charge = row as { amountMinor: string; projectId: string; status: string }
          const minor = BigInt(charge.amountMinor)
          return { amountDzd: `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`, projectId: charge.projectId, status: charge.status }
        }),
    }
  } finally {
    db.close()
  }
}

export async function openTransfer(page: Page, fixture: TransferFixture) {
  await page.goto(`/invoices/${fixture.invoiceId}`)
  await expect(page.getByText(fixture.assetName).first()).toBeVisible()
  // A purchase-group detail proves provenance; movement starts from current stock.
  const placement = readPlacement(fixture).unit as { warehouseId: string | null; projectId: string | null }
  await page.goto("/inventory")
  await page.getByRole("combobox", { name: "الموقع", exact: true }).selectOption(
    placement.warehouseId ? `WAREHOUSE:${placement.warehouseId}` : `PROJECT:${placement.projectId}`,
  )
  await expect(page.getByText(fixture.assetName).first()).toBeVisible()
  await page.getByRole("button", { name: "تحويل مخزون أو بيع", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "تحويل مخزون أو بيع", exact: true })
  await dialog.getByRole("combobox", { name: "المخزون المختار", exact: true }).selectOption({ label: fixture.assetName })
  return dialog
}

export async function transferToProject(page: Page, fixture: TransferFixture) {
  const dialog = await openTransfer(page, fixture)
  await dialog.getByRole("combobox", { name: "الوجهة", exact: true }).selectOption(`PROJECT:${fixture.projectId}`)
  await expect(dialog.getByText(/الاحتساب الافتراضي/)).toContainText("5000.00")
  await expect(dialog.getByLabel("النسبة من سعر الشراء")).toHaveValue("0")
  await dialog.getByRole("button", { name: "تأكيد التحويل" }).click()
  await expect(dialog).toBeHidden()
  await expect.poll(() => readPlacement(fixture)).toEqual({
    unit: { warehouseId: null, projectId: fixture.projectId },
    charges: [{ amountDzd: "5000.00", projectId: fixture.projectId, status: "LIVE" }],
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
    const numericRun = surface.locator('span[dir="ltr"] > span[dir="rtl"] + bdi[dir="ltr"]')
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
