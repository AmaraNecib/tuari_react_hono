import { expect, test } from "@playwright/test"
import { databaseFixturesAvailable, resetE2eDatabase } from "./helpers/db-isolation"
import { bootstrapOrSignIn } from "./helpers/session"

test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.beforeAll(() => { resetE2eDatabase() })

for (const resource of [
  { path: "/projects", procedure: "projectsList", title: "المشاريع" },
  { path: "/warehouses", procedure: "warehousesList", title: "المستودعات" },
]) {
  test(`${resource.procedure} loading and refusal never claim an empty list, and retry recovers`, async ({ page }) => {
    await bootstrapOrSignIn(page)
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    let refuse = true
    await page.route(`**/rpc/${resource.procedure}**`, async route => {
      if (refuse) {
        await held
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ json: { defined: false, code: "SERVICE_UNAVAILABLE", status: 503, message: "الخادم غير متاح مؤقتًا" } }) })
      } else {
        await route.continue()
      }
    })
    await page.goto(resource.path)
    const main = page.getByRole("main")
    await expect(main.getByRole("status")).toBeVisible()
    await expect(main.getByText("لا توجد بيانات في هذا القسم حاليًا.", { exact: true })).toHaveCount(0)
    release()
    await expect(main.getByRole("alert")).toBeVisible({ timeout: 15_000 })
    await expect(main.getByText("لا توجد بيانات في هذا القسم حاليًا.", { exact: true })).toHaveCount(0)
    refuse = false
    await main.getByRole("button", { name: "إعادة المحاولة" }).click()
    await expect(main.getByRole("heading", { name: resource.title, exact: true })).toBeVisible()
    await expect(main.getByText("لا توجد بيانات في هذا القسم حاليًا.", { exact: true })).toBeVisible()
  })
}
