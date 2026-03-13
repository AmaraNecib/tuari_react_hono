import { expect, test } from "@playwright/test"

test("browser shell boots with Arabic RTL defaults", async ({ page }) => {
  await page.goto("/")

  await expect(page.locator("html")).toHaveAttribute("lang", "ar")
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  await expect(page.getByText("تحديث الواجهة المحلية")).toBeVisible()
})

test("api health responds for the web shell", async ({ request }) => {
  const response = await request.get("http://127.0.0.1:4318/health")

  expect(response.ok()).toBe(true)
  await expect(response.json()).resolves.toEqual({ status: "ok" })
})
