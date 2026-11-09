import { expect, test } from "@playwright/test"
import { bootstrapOrSignIn } from "./helpers/session"
import { databaseFixturesAvailable, resetE2eDatabase } from "./helpers/db-isolation"

test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.beforeAll(() => { resetE2eDatabase() })

// Delay a real catalog read, fail it, then let the retry reach the API.
// The empty database is synthetic and belongs to this Playwright run.
test("catalog loading and API failure never claim an empty result, and retry recovers", async ({ page }) => {
  await bootstrapOrSignIn(page)
  let releaseRead!: () => void
  const heldRead = new Promise<void>((resolve) => { releaseRead = resolve })
  let fail = true
  await page.route("**/rpc/inventoryItemDefinitionsList**", async (route) => {
    if (!fail) return route.continue()
    await heldRead
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ json: { defined: false, code: "SERVICE_UNAVAILABLE", status: 503, message: "الخادم غير متاح مؤقتًا" } }),
    })
  })

  await page.getByRole("link", { name: "دليل العناصر", exact: true }).first().click()
  await expect(page.getByRole("status").filter({ hasText: "جارٍ تحميل دليل العناصر" })).toBeVisible()
  await expect(page.getByText("لا توجد تعريفات عناصر حتى الآن.", { exact: true })).toBeHidden()
  const catalog = page.locator("section").filter({ has: page.getByRole("heading", { name: "العناصر الحالية", exact: true }) })
  await catalog.screenshot({ path: test.info().outputPath("catalog-loading.png") })

  releaseRead()
  const error = page.getByRole("alert").filter({ hasText: "تعذر تحميل دليل العناصر." })
  await expect(error).toBeVisible({ timeout: 20_000 })
  await expect(error).toContainText("الخادم غير متاح مؤقتًا")
  await expect(page.getByText("لا توجد تعريفات عناصر حتى الآن.", { exact: true })).toBeHidden()
  await error.screenshot({ path: test.info().outputPath("catalog-error.png") })

  fail = false
  const retry = error.getByRole("button", { name: "إعادة المحاولة", exact: true })
  await retry.focus()
  await page.keyboard.press("Enter")
  await expect(error).toBeHidden()
  await expect(page.getByText("لا توجد تعريفات عناصر حتى الآن.", { exact: true })).toBeVisible()
  await page.getByLabel("اسم العنصر").fill("مطرقة اختبار العرض")
  await page.getByLabel("وحدة القياس").fill("قطعة")
  await page.getByRole("button", { name: "إنشاء التعريف", exact: true }).first().click()
  await expect(page.getByRole("cell", { name: "مطرقة اختبار العرض", exact: true })).toBeVisible()
})
