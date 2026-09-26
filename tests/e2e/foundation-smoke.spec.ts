import { expect, test } from "@playwright/test"

import { BOOTSTRAP_SETUP_KEY } from "./helpers/session"
import { apiBaseUrl } from "./helpers/urls"

test.describe.configure({ mode: "serial" })

async function bootstrapIfNeeded(page: import("@playwright/test").Page) {
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible()

  const createFirstUserButton = page.getByRole("button", { name: "إنشاء الحساب الأول" })

  if (await createFirstUserButton.isVisible()) {
    await page.getByLabel("الاسم الكامل").fill("مدير التشغيل")
    await page.getByLabel("رقم الهاتف").fill("0612345678")
    await page.getByLabel("كلمة المرور", { exact: true }).fill("password123")
    // The API runs with a configured bootstrap setup key (see playwright.config.ts).
    const setupSecretField = page.getByLabel("رمز الإعداد الأول")
    if (await setupSecretField.isVisible()) {
      await setupSecretField.fill(BOOTSTRAP_SETUP_KEY)
    }
    await createFirstUserButton.click()
    return
  }

  await page.getByLabel("رقم الهاتف").fill("0612345678")
  await page.getByLabel("كلمة المرور", { exact: true }).fill("password123")
  await page.getByRole("button", { name: "دخول إلى مساحة العمل" }).click()
}

test("browser shell boots with Arabic RTL defaults", async ({ page }) => {
  await page.goto("/")

  await expect(page.locator("html")).toHaveAttribute("lang", "ar")
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: /إنشاء المستخدم الأول|تسجيل الدخول/ }),
  ).toBeVisible()
  await expect(page.getByText("اللغة")).toHaveCount(0)
})

test("phase 1 shell signs in and keeps a collapsible fixed sidebar", async ({ page }) => {
  // Dismiss the first-run user-journey tour before the app boots: it overlays
  // the sidebar with a z-50 backdrop and intercepts clicks until skipped.
  // Registered BEFORE page.goto (the sign-in transition is client-side, so an
  // init script added after the first load never runs). JourneyStateManager
  // keys: `journey-<key>-<type>` (see helpers/session.ts).
  await page.addInitScript(() => {
    localStorage.setItem("journey-home-tour-status", "skipped")
  })
  await page.goto("/")

  await bootstrapIfNeeded(page)

  await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "القائمة الرئيسية" })).toBeVisible()
  await expect(page.locator("[data-collapsed='false']")).toBeVisible()
  await expect(page.getByText("اللغة")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "تبديل المظهر" })).toBeVisible()

  await page.getByRole("button", { name: "تصغير الشريط الجانبي" }).click()
  await expect(page.locator("[data-collapsed='true']")).toBeVisible()

  await page.getByRole("link", { name: "الإعدادات" }).first().click()
  await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible()
})

test("api health responds for the web shell", async ({ request }) => {
  const response = await request.get(`${apiBaseUrl()}/health`)

  expect(response.ok()).toBe(true)
  await expect(response.json()).resolves.toMatchObject({ status: "ok" })
})
