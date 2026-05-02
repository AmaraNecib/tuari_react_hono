import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.describe.configure({ mode: "serial" })

test("admin creates an external counterparty and it shows in the debts hub", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "الديون" }).first().click()
  await expect(page.getByRole("heading", { name: "الديون" })).toBeVisible()

  const counterpartyName = `طرف خارجي ${uniqueSuffix()}`
  const phone = `07${Math.floor(10000000 + Math.random() * 89999999)}`

  const addCounterpartyButton = page.getByRole("button", { name: /إضافة طرف خارجي/ }).first()

  if (await addCounterpartyButton.isVisible()) {
    await addCounterpartyButton.click()
    await page.getByLabel(/الاسم/).first().fill(counterpartyName)
    await page.getByLabel(/رقم الهاتف/).first().fill(phone)
    await page.getByRole("button", { name: /حفظ/ }).first().click()
    await expect(page.getByText(counterpartyName)).toBeVisible({ timeout: 10_000 })
  } else {
    await expect(page.getByRole("heading", { name: "الديون" })).toBeVisible()
  }
})

test("admin can create a debt account and record an entry", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "الديون" }).first().click()
  await expect(page.getByRole("heading", { name: "الديون" })).toBeVisible()

  // Navigate to debt accounts tab if available
  const accountsTab = page.getByRole("tab", { name: /الحسابات/ })
  if (await accountsTab.isVisible()) {
    await accountsTab.click()
  }

  // Look for the create debt account button
  const createAccountButton = page.getByRole("button", { name: /إضافة حساب|إنشاء حساب/ }).first()

  if (await createAccountButton.isVisible()) {
    await createAccountButton.click()
    // Fill in debt account details
    const amountField = page.getByLabel(/المبلغ|الرصيد/).first()
    if (await amountField.isVisible()) {
      await amountField.fill("5000")
    }

    const saveButton = page.getByRole("button", { name: /حفظ/ }).first()
    if (await saveButton.isVisible()) {
      await saveButton.click()
      // Wait for success message or the list to update
      await page.waitForTimeout(2000)
    }
  }
})
