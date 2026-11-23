import { installManagedApiLifecycle } from "./helpers/test"
import { expect, test } from "./helpers/test"

import { expectProjectCost, openChargeCorrection, openHistory, openTransfer, readPlacement, seedTransferAsset, transferToProject } from "./helpers/asset-charge"

import { databaseFixturesAvailable, resetE2eDatabase } from "./helpers/db-isolation"
import { findE2eDatabase, loadDatabaseConstructor } from "./helpers/db-seed"
import type { TransferFixture } from "./helpers/asset-charge"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

installManagedApiLifecycle()

test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })

// Issue #413: a unit placed on a project is charged. This drives the real
// purchase path (an ASSET invoice placed on a project) and then reads the
// charge back on the invoice details screen, so the feature is covered end to
// end rather than only at the module seam.
let itemName = ""
let projectName = ""
let purchased: TransferFixture

test.beforeAll(async () => {
  await resetE2eDatabase()
})

test.describe("inventory asset charge transfers (#426)", () => {
  test("warehouse to project prefills price and percentage, records history and project cost", async ({ page }) => {
    await bootstrapOrSignIn(page)
    const fixture = await seedTransferAsset(page)
    await transferToProject(page, fixture)
    const history = await openHistory(page, fixture)
    await expect(history).toContainText(fixture.projectName)
    await expect(history).toContainText("5,000")
    await expectProjectCost(page, fixture, 5000)
  })

  test("warehouse destination hides charge fields and records no charge", async ({ page }) => {
    await bootstrapOrSignIn(page)
    const fixture = await seedTransferAsset(page)
    const dialog = await openTransfer(page, fixture)
    // Switch through PROJECT to catch a stale amount leaking into a
    // warehouse submission, not just the initial warehouse rendering.
    await dialog.getByRole("combobox", { name: "الوجهة", exact: true }).selectOption(`PROJECT:${fixture.projectId}`)
    await expect(dialog.getByText(/الاحتساب الافتراضي/)).toContainText("5000.00")
    await dialog.getByRole("checkbox", { name: "تحديد احتساب مختلف على المشروع", exact: true }).check()
    await expect(dialog.getByLabel("احتساب المشروع، صفر يعني مجانًا", { exact: true })).toHaveValue("5000.00")
    await dialog.getByRole("combobox", { name: "الوجهة", exact: true }).selectOption(`WAREHOUSE:${fixture.destinationWarehouseId}`)
    await expect(dialog.getByLabel("احتساب المشروع، صفر يعني مجانًا", { exact: true })).toHaveCount(0)
    await expect(dialog.getByLabel("النسبة من سعر الشراء")).toHaveCount(0)
    await dialog.getByRole("button", { name: "تأكيد التحويل" }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(() => readPlacement(fixture)).toEqual({
      unit: { warehouseId: fixture.destinationWarehouseId, projectId: null },
      charges: [],
    })
    const history = await openHistory(page, fixture)
    await expect(history).toHaveText("لا توجد احتسابات لهذا الأصل بعد.")
  })

  test("correct a past charge with its from/to amounts and reason", async ({ page }) => {
    await bootstrapOrSignIn(page)
    const fixture = await seedTransferAsset(page)
    await transferToProject(page, fixture)
    // Move away first: this corrects a historical project placement.
    const dialog = await openTransfer(page, fixture)
    await dialog.getByRole("combobox", { name: "الوجهة", exact: true }).selectOption(`WAREHOUSE:${fixture.destinationWarehouseId}`)
    await dialog.getByRole("button", { name: "تأكيد التحويل" }).click()
    await expect(dialog).toBeHidden()
    const before = await openHistory(page, fixture)
    await expect(before).toContainText(fixture.projectName)
    await expect(before).toContainText("5,000")
    const editor = await openChargeCorrection(page, fixture)
    await editor.getByRole("textbox", { name: "المبلغ المصحح", exact: true }).fill("3500")
    const reason = `تصحيح احتساب ${uniqueSuffix()}`
    await editor.getByRole("textbox", { name: "السبب", exact: true }).fill(reason)
    await editor.getByRole("button", { name: "تأكيد الحفظ", exact: true }).click()
    await expect(editor).toBeHidden()
    const history = await openHistory(page, fixture)
    const revisions = history.getByRole("list", { name: "سجل التصحيحات" })
    await expect(revisions.getByRole("listitem")).toHaveCount(1)
    await expect(revisions.locator('span[dir="ltr"] > bdi[dir="ltr"]')).toHaveText(["5,000", "3,500"])
    await expect(revisions).toContainText(reason)
    await expect.poll(() => readPlacement(fixture)).toEqual({
      unit: { warehouseId: fixture.destinationWarehouseId, projectId: null },
      charges: [{ amountDzd: "3500.00", projectId: fixture.projectId, status: "LIVE" }],
    })
    await page.reload()
    const persistedHistory = await openHistory(page, fixture)
    await expect(persistedHistory).toContainText(reason)
    const persistedRevisions = persistedHistory.getByRole("list", { name: "سجل التصحيحات" })
    await expect(persistedRevisions.getByRole("listitem")).toHaveCount(1)
    await expect(persistedRevisions.locator('span[dir="ltr"] > bdi[dir="ltr"]')).toHaveText(["5,000", "3,500"])
    await expectProjectCost(page, fixture, 3500)
  })
})

test.describe("inventory asset charge — purchase onto a project", () => {
  test("admin creates an ASSET item definition and a project", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "دليل العناصر" }).first().click()
    await page.getByRole("button", { name: "دليل العناصر", exact: true }).click()
    await expect(page.getByRole("heading", { name: "دليل العناصر" })).toBeVisible()

    itemName = `مثقاب احتساب ${uniqueSuffix()}`
    await page.getByLabel("اسم العنصر").fill(itemName)
    // ASSET definitions do not require a unit of measure.
    await page.getByLabel("نوع العنصر").selectOption({ label: "أصل" })
    await page.getByRole("button", { name: "إنشاء التعريف" }).first().click()
    await expect(page.getByText(itemName)).toBeVisible({ timeout: 10_000 })

    await page.getByRole("link", { name: "المشاريع" }).first().click()
    await expect(page.getByRole("heading", { name: "المشاريع" })).toBeVisible()
    await page.getByRole("button", { name: "إضافة مشروع" }).first().click()
    await expect(page.getByRole("heading", { name: /إضافة مشروع/ })).toBeVisible()

    projectName = `مشروع احتساب ${uniqueSuffix()}`
    await page.getByLabel(/اسم/).first().fill(projectName)
    await page.getByLabel(/الموقع/).fill("الجزائر العاصمة")
    await page.getByRole("button", { name: "حفظ المشروع" }).click()
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 10_000 })
  })

  test("the purchase books a project charge visible in the unit's history", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.goto("/invoices/create")
    const dialog = page.getByRole("dialog", { name: "فاتورة مخزون جديدة", exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByRole("combobox", { name: "العنصر", exact: true }).selectOption({ label: `${itemName} · أصل` })
    await dialog.getByRole("combobox", { name: "وجهة البند", exact: true }).selectOption({ label: projectName })
    await dialog.getByRole("textbox", { name: "سعر شراء الأصل", exact: true }).fill("5000.00")
    await dialog.getByRole("button", { name: "حفظ الفاتورة والمخزون", exact: true }).click()
    await expect(dialog).toBeHidden()
    const db = loadDatabaseConstructor()(findE2eDatabase())
    try {
      const asset = db.prepare(`SELECT u.id AS assetId, u.current_project_id AS projectId,
        e.invoice_group_id AS invoiceId FROM inventory_asset_unit u JOIN inventory_entry e ON e.id = u.inventory_entry_id WHERE u.asset_name = ?`).get(itemName) as Pick<TransferFixture, "assetId" | "projectId" | "invoiceId">
      purchased = { ...asset, assetName: itemName, projectName, warehouseId: "", destinationWarehouseId: "" }
    } finally { db.close() }
    const history = await openHistory(page, purchased)
    await expect(history).toContainText(projectName)
    await expect(history).toContainText("5,000")  })

  test("the charge is persisted for the placement's project", () => {
    const Database = loadDatabaseConstructor()
    const db = Database(findE2eDatabase())
    try {
      const rows = db
        .prepare(
          `SELECT CAST(c.amount_minor AS TEXT) AS amountMinor, c.status AS status, p.name AS projectName
           FROM inventory_asset_charge c JOIN project p ON p.id = c.project_id
           WHERE p.name = ?`,
        )
        .all(projectName) as Array<{ amountMinor: string; status: string; projectName: string }>

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ amountMinor: "500000", status: "LIVE", projectName })
    } finally {
      db.close()
    }
  })

  test("the transfer dialog asks for the charge when the destination is a project", async ({ page }) => {
    await bootstrapOrSignIn(page)

    const fixture = await seedTransferAsset(page)
    const dialog = await openTransfer(page, purchased)
    await dialog.getByRole("combobox", { name: "الوجهة", exact: true }).selectOption(`PROJECT:${fixture.projectId}`)
    await dialog.getByRole("checkbox", { name: "تحديد احتساب مختلف على المشروع", exact: true }).check()
    const amount = dialog.getByRole("textbox", { name: "احتساب المشروع، صفر يعني مجانًا", exact: true })
    await expect(amount).toHaveValue("5000.00")
    await amount.fill("3500.00")
    await dialog.getByRole("button", { name: "تأكيد التحويل", exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(() => readPlacement(purchased)).toEqual({
      unit: { warehouseId: null, projectId: fixture.projectId },
      charges: [
        { amountDzd: "5000.00", projectId: purchased.projectId, status: "LIVE" },
        { amountDzd: "3500.00", projectId: fixture.projectId, status: "LIVE" },
      ],
    })
    const returnDialog = await openTransfer(page, purchased)
    await returnDialog.getByRole("combobox", { name: "الوجهة", exact: true }).selectOption(`PROJECT:${purchased.projectId}`)
    await expect(returnDialog.getByText(/الاحتساب الافتراضي/)).toContainText("3500.00")
    await expect(returnDialog.getByText(/الاحتساب الافتراضي/)).toContainText("من آخر احتساب")
    await returnDialog.getByRole("checkbox", { name: "تحديد احتساب مختلف على المشروع", exact: true }).check()
    const freeAmount = returnDialog.getByRole("textbox", { name: "احتساب المشروع، صفر يعني مجانًا", exact: true })
    await expect(freeAmount).toHaveValue("3500.00")
    await freeAmount.fill("0.00")
    await expect(freeAmount).toHaveValue("0.00")
    await returnDialog.getByRole("button", { name: "تأكيد التحويل", exact: true }).click()
    await expect(returnDialog).toBeHidden()
    await expect.poll(() => readPlacement(purchased)).toEqual({
      unit: { warehouseId: null, projectId: purchased.projectId },
      charges: [
        { amountDzd: "5000.00", projectId: purchased.projectId, status: "LIVE" },
        { amountDzd: "3500.00", projectId: fixture.projectId, status: "LIVE" },
        { amountDzd: "0.00", projectId: purchased.projectId, status: "LIVE" },
      ],
    })  })
})
