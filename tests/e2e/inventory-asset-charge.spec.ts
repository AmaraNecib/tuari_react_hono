import { expect, test } from "@playwright/test"

import { expectProjectCost, openHistory, openTransfer, readPlacement, seedTransferAsset, transferToProject } from "./helpers/asset-charge"

import { databaseFixturesAvailable, resetE2eDatabase } from "./helpers/db-isolation"
import { findE2eDatabase, loadDatabaseConstructor } from "./helpers/db-seed"
import { selectInvoiceLineItem } from "./helpers/invoice-line"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })

// Issue #413: a unit placed on a project is charged. This drives the real
// purchase path (an ASSET invoice placed on a project) and then reads the
// charge back on the invoice details screen, so the feature is covered end to
// end rather than only at the module seam.
let itemName = ""
let projectName = ""

test.beforeAll(() => {
  resetE2eDatabase()
})

test.describe("inventory asset charge transfers (#426)", () => {
  test("warehouse to project prefills price and percentage, records history and project cost", async ({ page }) => {
    await bootstrapOrSignIn(page)
    const fixture = seedTransferAsset()
    await transferToProject(page, fixture)
    const history = await openHistory(page)
    await expect(history).toContainText(fixture.projectName)
    await expect(history).toContainText((5000).toLocaleString("ar-DZ"))
    await expectProjectCost(page, fixture, 5000)
  })

  test("warehouse destination hides charge fields and records no charge", async ({ page }) => {
    await bootstrapOrSignIn(page)
    const fixture = seedTransferAsset()
    const dialog = await openTransfer(page, fixture)
    // Switch through PROJECT to catch a stale amount leaking into a
    // warehouse submission, not just the initial warehouse rendering.
    await dialog.getByLabel("نوع الوجهة").selectOption("PROJECT")
    await expect(dialog.getByLabel("مبلغ الاحتساب", { exact: true })).toHaveValue("5000")
    await dialog.getByLabel("نوع الوجهة").selectOption("WAREHOUSE")
    await dialog.getByLabel(/^الوجهة/).selectOption(fixture.destinationWarehouseId)
    await expect(dialog.getByLabel("مبلغ الاحتساب", { exact: true })).toHaveCount(0)
    await expect(dialog.getByLabel("النسبة من سعر الشراء")).toHaveCount(0)
    await dialog.getByRole("button", { name: "تأكيد التحويل" }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(() => readPlacement(fixture)).toEqual({
      unit: { warehouseId: fixture.destinationWarehouseId, projectId: null },
      charges: [],
    })
    const history = await openHistory(page)
    await expect(history).toHaveText("لا توجد احتسابات لهذا الأصل بعد.")
  })

  test("correct a past charge with its from/to amounts and reason", async ({ page }) => {
    await bootstrapOrSignIn(page)
    const fixture = seedTransferAsset()
    await transferToProject(page, fixture)
    // Move away first: this corrects a historical project placement.
    const dialog = await openTransfer(page, fixture)
    await dialog.getByLabel(/^الوجهة/).selectOption(fixture.destinationWarehouseId)
    await dialog.getByRole("button", { name: "تأكيد التحويل" }).click()
    await expect(dialog).toBeHidden()
    const history = await openHistory(page)
    await history.getByRole("button", { name: "تعديل", exact: true }).click()
    await history.getByLabel("المبلغ الجديد").fill("3500")
    const reason = `تصحيح احتساب ${uniqueSuffix()}`
    await history.getByLabel("السبب (اختياري)", { exact: true }).fill(reason)
    await history.getByRole("button", { name: "حفظ", exact: true }).click()
    const revisions = history.getByRole("list", { name: "سجل التصحيحات" })
    await expect(revisions.getByRole("listitem")).toHaveCount(1)
    await expect(revisions).toContainText(`تصحيح من ${(5000).toLocaleString("ar-DZ")} إلى ${(3500).toLocaleString("ar-DZ")}`)
    await expect(revisions).toContainText(reason)
    await expect.poll(() => readPlacement(fixture)).toEqual({
      unit: { warehouseId: fixture.destinationWarehouseId, projectId: null },
      charges: [{ amountDzd: 3500, projectId: fixture.projectId, status: "LIVE" }],
    })
    await page.reload()
    const persistedHistory = await openHistory(page)
    await expect(persistedHistory).toContainText(reason)
    await expectProjectCost(page, fixture, 3500)
  })
})

test.describe("inventory asset charge — purchase onto a project", () => {
  test("admin creates an ASSET item definition and a project", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "دليل العناصر" }).first().click()
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
    await expect(page.getByRole("heading", { name: "إضافة مخزون بالفاتورة" })).toBeVisible()

    // The page starts with one line. Variant C: choose the row's type first
    // (an ASSET definition is offered only under the ASSET kind), then pick the
    // definition by its unique name, then set the line's destination.
    await selectInvoiceLineItem(page, { kind: "ASSET", itemName })

    // The line's project select is a native <select> whose option list carries
    // the project; the header default project is a custom combobox, so this
    // targets only the line.
    const projectSelect = page
      .locator("select")
      .filter({ has: page.locator("option", { hasText: projectName }) })
      .first()
    await projectSelect.selectOption({ label: projectName })
    await page.getByLabel("سعر الأصل").fill("5000")

    await page.getByRole("button", { name: "حفظ الفاتورة" }).click()
    await expect(page.getByRole("link", { name: "تفاصيل الفاتورة" })).toBeVisible({ timeout: 20_000 })

    // The asset row keeps its charge history reachable; expanding it shows the
    // project and the amount charged for this placement.
    await expect(page.getByText(itemName).first()).toBeVisible({ timeout: 15_000 })
    await page.getByRole("button", { name: "سجل الاحتساب" }).first().click()
    const history = page.getByTestId("asset-charge-history").first()
    await expect(history).toBeVisible({ timeout: 10_000 })
    await expect(history).toContainText(projectName)
    // Grouping separator varies by ICU locale; accept grouped or ungrouped.
    await expect(history).toContainText(/5[.,٬]?000/)
  })

  test("the charge is persisted for the placement's project", () => {
    const Database = loadDatabaseConstructor()
    const db = Database(findE2eDatabase())
    try {
      const rows = db
        .prepare(
          `SELECT c.amount_dzd AS amountDzd, c.status AS status, p.name AS projectName
           FROM inventory_asset_charge c JOIN project p ON p.id = c.project_id
           WHERE p.name = ?`,
        )
        .all(projectName) as Array<{ amountDzd: number; status: string; projectName: string }>

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ amountDzd: 5000, status: "LIVE", projectName })
    } finally {
      db.close()
    }
  })

  test("the transfer dialog asks for the charge when the destination is a project", async ({ page }) => {
    await bootstrapOrSignIn(page)

    // Open the invoice details (the latest invoice is the one just created).
    await page.getByRole("link", { name: "الفواتير" }).first().click()
    await expect(page.getByRole("heading", { name: "الفواتير" })).toBeVisible()
    await page.getByText("IN-00001").first().click()
    await expect(page.getByRole("link", { name: "تفاصيل الفاتورة" })).toBeVisible({ timeout: 15_000 })

    await page.getByRole("button", { name: "تحويل الأصل" }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.getByLabel("نوع الوجهة").selectOption({ value: "PROJECT" })

    // The charge fields appear once the destination is a project.
    await expect(page.getByLabel("مبلغ الاحتساب")).toBeVisible()
  })
})
