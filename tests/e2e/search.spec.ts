import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.describe.configure({ mode: "serial" })

test("Ctrl+K search finds a created warehouse after the debounce and opens it", async ({ page }) => {
  await bootstrapOrSignIn(page)

  // Seed a searchable entity: create a warehouse with a unique name.
  await page.getByRole("link", { name: "المستودعات" }).first().click()
  await expect(page.getByRole("heading", { name: "المستودعات" })).toBeVisible()

  await page.getByRole("button", { name: "إضافة مستودع" }).first().click()
  await expect(page.getByRole("heading", { name: /إضافة مستودع/ })).toBeVisible()

  const warehouseName = `مستودع بحث ${uniqueSuffix()}`
  await page.getByLabel(/اسم/).first().fill(warehouseName)
  await page.getByRole("button", { name: "حفظ المستودع" }).click()
  await expect(page.getByText(warehouseName)).toBeVisible({ timeout: 10_000 })

  // Open the global search via the Ctrl+K shortcut.
  await page.keyboard.press("Control+k")
  await expect(page.getByPlaceholder("بحث...")).toBeVisible()

  // Type the name. The 175ms input debounce (issue #280) plus the corpus
  // fetch must settle before the result row appears.
  await page.getByPlaceholder("بحث...").fill(warehouseName)

  // Scope to the dialog overlay so the underlying list row can't satisfy the
  // assertion — the fuzzy result itself must render.
  const dialog = page.locator(".fixed.inset-0")
  await expect(dialog.getByText(warehouseName).first()).toBeVisible({ timeout: 10_000 })

  // Enter activates the highlighted result and navigates to the warehouse
  // detail page (its heading is the warehouse name).
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { name: warehouseName })).toBeVisible({
    timeout: 10_000,
  })
})

test("clearing the search query restores the page categories immediately", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.keyboard.press("Control+k")
  await expect(page.getByPlaceholder("بحث...")).toBeVisible()

  // Page categories are shown for an empty query — the "الصفحات" label only
  // exists inside the search dialog.
  await expect(page.locator(".fixed.inset-0").getByText("الصفحات").first()).toBeVisible()

  // Typing and clearing must not leave stale results: categories come back.
  await page.getByPlaceholder("بحث...").fill("مستودع")
  await page.getByPlaceholder("بحث...").fill("")
  await expect(page.locator(".fixed.inset-0").getByText("الصفحات").first()).toBeVisible()

  // Escape closes the dialog.
  await page.keyboard.press("Escape")
  await expect(page.getByPlaceholder("بحث...")).toBeHidden()
})
