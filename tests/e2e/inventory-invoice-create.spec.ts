import { expect, test } from "@playwright/test"

import { resetE2eDatabase } from "./helpers/db-isolation"
import { findE2eDatabase, loadDatabaseConstructor } from "./helpers/db-seed"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

import { databaseFixturesAvailable } from "./helpers/db-isolation"


test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })

let warehouseName = ""
let itemName = ""

// Issue #24: the header-LEVEL default warehouse / default project custom
// comboboxes on the invoice creation page must keep their selection across
// re-renders and the header default must seed line items that leave their own
// warehouse/project unset.
test.describe("inventory invoice create — header default warehouse persistence and seeding", () => {
  test.beforeAll(() => {
    resetE2eDatabase()
  })

  test("admin creates a consumable item and a warehouse to use as the header default", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.getByRole("link", { name: "دليل العناصر" }).first().click()
    await expect(page.getByRole("heading", { name: "دليل العناصر" })).toBeVisible()

    itemName = `صنف فاتورة ${uniqueSuffix()}`
    await page.getByLabel("اسم العنصر").fill(itemName)
    await page.getByLabel("وحدة القياس").fill("قطعة")
    await page.getByRole("button", { name: "إنشاء التعريف" }).first().click()

    await expect(page.getByText(itemName)).toBeVisible({ timeout: 10_000 })

    await page.getByRole("link", { name: "المستودعات" }).first().click()
    await expect(page.getByRole("heading", { name: "المستودعات" })).toBeVisible()

    warehouseName = `مستودع فاتورة ${uniqueSuffix()}`
    await page.getByRole("button", { name: "إضافة مستودع" }).first().click()
    await expect(page.getByRole("heading", { name: /إضافة مستودع/ })).toBeVisible()

    await page.getByLabel(/اسم/).first().fill(warehouseName)
    await page.getByRole("button", { name: "حفظ المستودع" }).click()

    await expect(page.getByText(warehouseName)).toBeVisible({ timeout: 10_000 })
  })

  test("the header default warehouse selection persists and seeds the unset line item", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.goto("/invoices/create")
    await expect(page.getByRole("heading", { name: "إضافة مخزون بالفاتورة" })).toBeVisible()

    // Issue #25: the header defaults now live in a collapsible section — open
    // it first. The disclosure must not hide the seeding behavior.
    const defaultsSection = page.getByRole("button", { name: "المستودع والمشروع الافتراضي" })
    await expect(defaultsSection).toHaveAttribute("aria-expanded", "false")
    await defaultsSection.click()
    await expect(defaultsSection).toHaveAttribute("aria-expanded", "true")

    // 1) Pick the default warehouse in the header custom combobox. The
    // combobox opens on mouse down and lists the warehouses as options.
    const warehouseField = page.locator("label").filter({ hasText: "المستودع الافتراضي" })
    const warehouseTrigger = warehouseField.locator("[role=combobox]")
    await warehouseTrigger.click()
    await page
      .locator('div[role="option"]', { hasText: warehouseName })
      .first()
      .click()

    // The trigger must display the warehouse NAME — not the raw id (UUID) or
    // the empty label — proving the selection is displayed and held.
    await expect(warehouseTrigger).toContainText(warehouseName, { timeout: 10_000 })
    await expect(warehouseTrigger).not.toContainText("بدون مستودع")

    // 2) Re-render by adding a line item: the selection must persist.
    await page.getByRole("button", { name: "إضافة سطر" }).click()
    await expect(warehouseTrigger).toContainText(warehouseName)

    // 3) Fill both rows. Variant C: the row's type comes first and filters the
    // item options, so choose the type on each row before its item. Leave the
    // rows' warehouse/project on "default" so the header default must seed it.
    const typeSelects = page.getByLabel("النوع")
    await typeSelects.first().selectOption("CONSUMABLE")
    await typeSelects.last().selectOption("CONSUMABLE")
    const definitionSelects = page.getByLabel("تعريف العنصر")
    await definitionSelects.first().selectOption({ index: 1 })
    await definitionSelects.last().selectOption({ index: 1 })

    // 4) Save the invoice and wait for the success navigation (onCreated only
    //    fires after the create RPC resolves).
    await page.getByRole("button", { name: "حفظ الفاتورة" }).click()
    await expect(page.getByRole("link", { name: "تفاصيل الفاتورة" })).toBeVisible({ timeout: 20_000 })

    // 5) The details view must actually mount and render the created invoice
    //    (issue #30). The unique line-item name can only appear on this page
    //    if `inventoryInvoiceGroupsGet` fired and the details UI received the
    //    group payload — the post-create navigation bug left this main empty
    //    and made zero further requests after the create RPC. Assert the
    //    data-dependent content first so a regression fails on the
    //    meaningful assert, not on static shell chrome.
    await expect(page.getByText(itemName).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole("button", { name: "العودة إلى الفواتير" })).toBeVisible()
    await expect(page.getByText("سجل الحركات")).toBeVisible()

    // 6) The header default was seeded into BOTH lines at the persistence
    //    seam: each entry row carries the default warehouse id (looked up by
    //    name) and no project. The DB seam still verifies the created rows.
    const Database = loadDatabaseConstructor()
    const db = new Database(findE2eDatabase(), { readonly: true })
    try {
      const warehouseId = db
        .prepare("SELECT id FROM warehouse WHERE name = ?")
        .get(warehouseName) as { id: string } | undefined
      expect(warehouseId).toBeDefined()

      const entryRows = db
        .prepare(
          "SELECT e.warehouse_id, e.project_id FROM inventory_entry e JOIN inventory_invoice_group g ON g.id = e.invoice_group_id WHERE g.id = (SELECT id FROM inventory_invoice_group ORDER BY rowid DESC LIMIT 1) ORDER BY e.rowid",
        )
        .all() as Array<{ warehouse_id: string | null; project_id: string | null }>
      // Only this scenario's invoice group (the latest one) — unrelated groups
      // must not influence the assertion.
      expect(entryRows).toHaveLength(2)
      for (const row of entryRows) {
        expect(row.warehouse_id).toBe(warehouseId!.id)
        expect(row.project_id).toBeNull()
      }
    } finally {
      db.close()
    }
  })

  test("the save control explains why it is disabled and rejects an unsupported attachment by name", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await page.goto("/invoices/create")
    await expect(page.getByRole("heading", { name: "إضافة مخزون بالفاتورة" })).toBeVisible()

    // Default single empty row: Save is disabled and the reason names the
    // missing type first (variant C puts the type on the row).
    const save = page.getByRole("button", { name: "حفظ الفاتورة" })
    await expect(save).toBeDisabled()
    await expect(page.getByText("اختر نوع السطر 1.")).toBeVisible()

    // Choosing a type moves the reason to the row's item.
    await page.getByLabel("النوع").first().selectOption("CONSUMABLE")
    await expect(page.getByText("اختر تعريف العنصر في السطر 1.")).toBeVisible()

    // Remove the only line: the reason becomes the no-lines message.
    await page.getByRole("button", { name: "حذف" }).first().click()
    await expect(save).toBeDisabled()
    await expect(page.getByText("أضف سطرًا واحدًا على الأقل قبل الحفظ.")).toBeVisible()

    // An unsupported attachment is rejected client-side with the file named,
    // before any invoice is created.
    await page.getByRole("button", { name: "ملاحظات وملفات" }).click()
    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    })
    const alert = page.getByRole("alert")
    await expect(alert).toContainText("notes.txt")
    await expect(alert).toContainText("غير مدعوم")
  })
})
