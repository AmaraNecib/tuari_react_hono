import { expect, type Page } from "@playwright/test"

export const TEST_PHONE = "0612345678"
export const TEST_PASSWORD = "password123"
export const TEST_NAME = "مدير التشغيل"

export async function bootstrapOrSignIn(page: Page) {
  await page.goto("/")

  await expect(page.getByLabel("رقم الهاتف")).toBeVisible()

  const createFirstUserButton = page.getByRole("button", { name: "إنشاء الحساب الأول" })

  if (await createFirstUserButton.isVisible()) {
    await page.getByLabel("الاسم الكامل").fill(TEST_NAME)
    await page.getByLabel("رقم الهاتف").fill(TEST_PHONE)
    await page.getByLabel("كلمة المرور").fill(TEST_PASSWORD)
    await createFirstUserButton.click()
  } else {
    await page.getByLabel("رقم الهاتف").fill(TEST_PHONE)
    await page.getByLabel("كلمة المرور").fill(TEST_PASSWORD)
    await page.getByRole("button", { name: "دخول إلى مساحة العمل" }).click()
  }

  await expect(page.getByText("مساحة العمل")).toBeVisible()
}

export function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`
}
