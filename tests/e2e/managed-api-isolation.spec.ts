import { existsSync } from "node:fs"
import { expect, test, installManagedApiLifecycle } from "./helpers/test"
import { findE2eDatabase, loadDatabaseConstructor, seedEmployees } from "./helpers/db-seed"
import { restartManagedApi, stopManagedApi } from "./helpers/managed-api"
import { seedTransferAsset, readPlacement } from "./helpers/asset-charge"
import { bootstrapOrSignIn } from "./helpers/session"

installManagedApiLifecycle()

test("fresh exact API preserves the old file, closes its process and does not inherit rows", async () => {
  const first = await restartManagedApi()
  seedEmployees([{ firstName: "Isolation", lastName: "Probe", phone: "0799911122" }])
  const second = await restartManagedApi()
  expect(second.database).not.toBe(first.database)
  expect(second.pid).not.toBe(first.pid)
  expect(() => process.kill(first.pid, 0)).toThrow()
  expect(existsSync(first.database)).toBe(true)
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    expect(db.prepare("SELECT id FROM employee WHERE phone = ?").all("0799911122")).toEqual([])
    expect(db.prepare("SELECT slice FROM exact_money_schema ORDER BY slice").all()).toHaveLength(5)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all().length).toBeGreaterThan(0)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'employee_salary_payment'").all()).toEqual([])
  } finally { db.close() }
  const old = loadDatabaseConstructor()(first.database)
  try { expect(old.prepare("SELECT id FROM employee WHERE phone = ?").all("0799911122")).toHaveLength(1) }
  finally { old.close() }
  await stopManagedApi()
  expect(() => process.kill(second.pid, 0)).toThrow()
})

test("authenticated exact writer seeds a conserved asset purchase", async ({ page }) => {
  await restartManagedApi()
  await bootstrapOrSignIn(page)
  const fixture = await seedTransferAsset(page)
  expect(readPlacement(fixture)).toEqual({ unit: { warehouseId: fixture.warehouseId, projectId: null }, charges: [] })
  const db = loadDatabaseConstructor()(findE2eDatabase())
  try {
    expect(db.prepare("SELECT CAST(purchase_price_minor AS TEXT) AS price FROM inventory_asset_unit WHERE id = ?").get(fixture.assetId)).toEqual({ price: "500000" })
    expect(db.prepare("SELECT id FROM inventory_movement WHERE asset_unit_id = ? AND movement_type = 'PURCHASE'").all(fixture.assetId)).toHaveLength(1)
  } finally { db.close() }
})

test("unmanaged reset fails closed", async () => {
  const previous = process.env.E2E_API_MANAGED
  process.env.E2E_API_MANAGED = "0"
  try { await expect(restartManagedApi()).rejects.toThrow("requires managed API") }
  finally { process.env.E2E_API_MANAGED = previous }
})
