import { expect, type Page } from "@playwright/test"

export const TEST_PHONE = "0612345678"
export const TEST_PASSWORD = "password123"
export const TEST_NAME = "مدير التشغيل"

export async function bootstrapOrSignIn(page: Page) {
  // Dismiss the first-run user-journey tour before the app boots: it overlays
  // the sidebar with a z-50 backdrop and intercepts clicks until skipped.
  // JourneyStateManager keys: `journey-<key>-<type>`.
  await page.addInitScript(() => {
    localStorage.setItem("journey-home-tour-status", "skipped")
  })

  await page.goto("/")

  await expect(page.getByLabel("رقم الهاتف")).toBeVisible()

  const createFirstUserButton = page.getByRole("button", { name: "إنشاء الحساب الأول" })

  if (await createFirstUserButton.isVisible()) {
    await page.getByLabel("الاسم الكامل").fill(TEST_NAME)
    await page.getByLabel("رقم الهاتف").fill(TEST_PHONE)
    // exact: true — the PasswordInput toggle's aria-label ("إظهار كلمة المرور")
    // is a substring superset, so substring matching is ambiguous.
    await page.getByLabel("كلمة المرور", { exact: true }).fill(TEST_PASSWORD)
    await createFirstUserButton.click()
  } else {
    await page.getByLabel("رقم الهاتف").fill(TEST_PHONE)
    await page.getByLabel("كلمة المرور", { exact: true }).fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "دخول إلى مساحة العمل" }).click()
  }

  // The signed-in shell renders the sidebar with the dashboard entry.
  await expect(page.getByRole("link", { name: "لوحة التحكم" }).first()).toBeVisible({
    timeout: 15_000,
  })
}

export function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`
}
