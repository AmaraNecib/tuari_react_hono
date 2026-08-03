import { expect, type Page } from "@playwright/test"

export const TEST_PHONE = "0612345678"
export const TEST_PASSWORD = "password123"
export const TEST_NAME = "مدير التشغيل"

/**
 * The password field's accessible name includes the show/hide button text
 * (e.g. "كلمة المرور إظهار كلمة المرور"), so a plain getByLabel matches both
 * the input and the toggle button. Match the textbox role explicitly.
 */
export const passwordField = (page: Page) => page.getByRole("textbox", { name: /^كلمة المرور/ })

export async function bootstrapOrSignIn(page: Page) {
  await page.goto("/")

  await expect(page.getByLabel("رقم الهاتف")).toBeVisible()

  const createFirstUserButton = page.getByRole("button", { name: "إنشاء الحساب الأول" })

  if (await createFirstUserButton.isVisible()) {
    await page.getByLabel("الاسم الكامل").fill(TEST_NAME)
    await page.getByLabel("رقم الهاتف").fill(TEST_PHONE)
    await passwordField(page).fill(TEST_PASSWORD)
    await createFirstUserButton.click()
  } else {
    await page.getByLabel("رقم الهاتف").fill(TEST_PHONE)
    await passwordField(page).fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "دخول إلى مساحة العمل" }).click()
  }

  await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible()

  // Dismiss the first-visit onboarding tour so it never blocks later interactions.
  const tourSkip = page.getByRole("button", { name: "تخطي", exact: true })
  try {
    await expect(tourSkip).toBeVisible({ timeout: 3000 })
    await tourSkip.click()
    await expect(page.getByRole("dialog", { name: /الشريط الجانبي/ })).toBeHidden()
  } catch {
    // Tour already dismissed or not shown on this visit — proceed.
  }
}

export function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`
}
