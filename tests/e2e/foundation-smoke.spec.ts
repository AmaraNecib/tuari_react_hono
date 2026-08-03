import { expect, test } from "@playwright/test"

import { passwordField } from "./helpers/session"

test.describe.configure({ mode: "serial" })

async function bootstrapIfNeeded(page: import("@playwright/test").Page) {
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible()

  const createFirstUserButton = page.getByRole("button", { name: "إنشاء الحساب الأول" })

  if (await createFirstUserButton.isVisible()) {
    await page.getByLabel("الاسم الكامل").fill("مدير التشغيل")
    await page.getByLabel("رقم الهاتف").fill("0612345678")
    await passwordField(page).fill("password123")
    await createFirstUserButton.click()
    return
  }

  await page.getByLabel("رقم الهاتف").fill("0612345678")
  await passwordField(page).fill("password123")
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
  const response = await request.get("http://127.0.0.1:4318/health")

  expect(response.ok()).toBe(true)
  await expect(response.json()).resolves.toMatchObject({ status: "ok" })
})
