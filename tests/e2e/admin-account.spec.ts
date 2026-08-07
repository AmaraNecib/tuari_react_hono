import { expect, test, type Page } from "@playwright/test"

import {
  TEST_NAME,
  TEST_PASSWORD,
  TEST_PHONE,
  bootstrapOrSignIn,
  dismissUserJourneyTour,
  signIn,
} from "./helpers/session"

// Serial because this spec mutates the shared admin account (name/phone/password)
// and the whole suite shares one SQLite DB per run; retries would re-run against
// mutated state and break the "old password fails" precondition.
test.describe.configure({ mode: "serial", retries: 0 })

/** A distinct valid Algerian phone (matches `algerianPhoneSchema`). */
const EDIT_PHONE = "0771234567"
/** A distinct valid name (1–120 chars). */
const EDIT_NAME = "مدير التشغيل التجريبي"
/** A valid new password (8–128 chars), distinct from the canonical one. */
const NEW_PASSWORD = "e2e-new-pass-123"
/** The success toast shown by the account-settings mutation. */
const ACCOUNT_UPDATED_TOAST = "تم تحديث بيانات الحساب بنجاح."

/**
 * Current-password input in the account form. Regex on the accessible name
 * because the wrapping label's text grows when a field error is shown
 * (exact label matching would break); the name always starts with the label.
 */
const currentPasswordInput = (page: Page) => page.getByRole("textbox", { name: /^كلمة المرور الحالية/ })
/** New-password input in the account form (same rationale as above). */
const newPasswordInput = (page: Page) => page.getByRole("textbox", { name: /^كلمة المرور الجديدة/ })

/**
 * Opens Settings → Account tab (the default tab, so navigation suffices).
 * The account form is the subject under test for the profile/password steps.
 */
async function openAccountSettings(page: Page) {
  await page.getByRole("link", { name: "الإعدادات" }).first().click()
  await expect(page.getByRole("button", { name: "حفظ بيانات الحساب" })).toBeVisible()
}

/** Signs out via the sidebar button and the confirmation dialog. */
async function signOut(page: Page) {
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click()
  const dialog = page.getByRole("alertdialog", { name: "تأكيد تسجيل الخروج" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "تأكيد" }).click()
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible({ timeout: 15_000 })
}

/**
 * Submits the account form and waits for the save to actually complete.
 *
 * The settings mutation's success toast appears only after the change-password
 * response is received AND the session refetch finishes, so gating on the
 * response (then asserting the toast) proves THIS save settled before the test
 * moves on. Without the gate, a `.first()` toast match could race a delayed
 * save: the next step (e.g. sign-out) would run while the save's late session
 * re-establishment is still in flight, leaving the app signed back in.
 */
async function saveAccountAndExpectSuccess(page: Page) {
  const saveResponse = page.waitForResponse(
    (response) => response.url().includes("/api/auth/change-password"),
  )
  await page.getByRole("button", { name: "حفظ بيانات الحساب" }).click()
  expect((await saveResponse).status()).toBe(200)
  await expect(page.getByText(ACCOUNT_UPDATED_TOAST).first()).toBeVisible()
}

test("first-run bootstrap creates the admin account", async ({ page }) => {
  // This spec sorts before every other spec file, so it sees a fresh DB and
  // the first-run bootstrap screen is guaranteed (see .scratch/implementation/254-design.md).
  await dismissUserJourneyTour(page)
  await page.goto("/")

  await expect(page.getByRole("heading", { name: "إنشاء المستخدم الأول" })).toBeVisible()

  await page.getByLabel("الاسم الكامل").fill(TEST_NAME)
  await page.getByLabel("رقم الهاتف").fill(TEST_PHONE)
  await page.getByLabel("كلمة المرور", { exact: true }).fill(TEST_PASSWORD)
  await page.getByRole("button", { name: "إنشاء الحساب الأول" }).click()

  // The signed-in shell reflects the bootstrapped account.
  await expect(page.getByRole("link", { name: "لوحة التحكم" }).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator("aside").getByText(TEST_NAME, { exact: true })).toBeVisible()
  await expect(page.locator("aside").getByText(TEST_PHONE, { exact: true })).toBeVisible()
})

test("admin signs in with phone and password", async ({ page }) => {
  await dismissUserJourneyTour(page)
  await page.goto("/")

  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible()

  await signIn(page, { phone: TEST_PHONE, password: TEST_PASSWORD })

  await expect(page.getByRole("link", { name: "لوحة التحكم" }).first()).toBeVisible({ timeout: 15_000 })
})

test("admin edits their profile (name/phone) and the changes stick", async ({ page }) => {
  await bootstrapOrSignIn(page)

  // The settings form bundles sensitive changes: changing the phone requires
  // the current password AND a new password (handleSave validation), so the
  // edit rotates the password too (TEST_PASSWORD -> NEW_PASSWORD). The restore
  // step below rolls name/phone/password all back to canonical.
  await openAccountSettings(page)

  // Negative path first: a wrong current password is rejected by the API and
  // surfaces as an inline field error — the mutation never runs.
  await page.getByLabel("الاسم", { exact: true }).fill(EDIT_NAME)
  await page.getByLabel("رقم الهاتف").fill(EDIT_PHONE)
  await currentPasswordInput(page).fill("wrong-pass-99")
  await newPasswordInput(page).fill(NEW_PASSWORD)
  await page.getByRole("button", { name: "حفظ بيانات الحساب" }).click()
  // Both the inline field error and the error toast carry the same text.
  await expect(page.getByText("كلمة المرور الحالية غير صحيحة.").first()).toBeVisible()
  // The form keeps the edited values so the user can correct the password.
  await expect(page.getByLabel("الاسم", { exact: true })).toHaveValue(EDIT_NAME)

  // Correct the current password and save for real.
  await currentPasswordInput(page).fill(TEST_PASSWORD)
  await saveAccountAndExpectSuccess(page)

  await expect(page.locator("aside").getByText(EDIT_NAME, { exact: true })).toBeVisible()
  await expect(page.locator("aside").getByText(EDIT_PHONE, { exact: true })).toBeVisible()
  await expect(page.getByLabel("الاسم", { exact: true })).toHaveValue(EDIT_NAME)
  await expect(page.getByLabel("رقم الهاتف")).toHaveValue(EDIT_PHONE)

  // Restore the canonical credentials so downstream specs can sign in.
  await page.getByLabel("الاسم", { exact: true }).fill(TEST_NAME)
  await page.getByLabel("رقم الهاتف").fill(TEST_PHONE)
  await currentPasswordInput(page).fill(NEW_PASSWORD)
  await newPasswordInput(page).fill(TEST_PASSWORD)
  await saveAccountAndExpectSuccess(page)

  await expect(page.locator("aside").getByText(TEST_NAME, { exact: true })).toBeVisible()
  await expect(page.locator("aside").getByText(TEST_PHONE, { exact: true })).toBeVisible()
  await expect(page.getByLabel("الاسم", { exact: true })).toHaveValue(TEST_NAME)
  await expect(page.getByLabel("رقم الهاتف")).toHaveValue(TEST_PHONE)
})

test("admin changes password: old fails, new works, canonical password restored", async ({ page }) => {
  await bootstrapOrSignIn(page)

  // Change password: TEST_PASSWORD -> NEW_PASSWORD.
  await openAccountSettings(page)
  await currentPasswordInput(page).fill(TEST_PASSWORD)
  await newPasswordInput(page).fill(NEW_PASSWORD)
  await saveAccountAndExpectSuccess(page)

  // The old password must no longer sign in. The web sign-in path surfaces
  // the raw better-auth message (untranslated), so accept either form.
  await signOut(page)
  await signIn(page, { phone: TEST_PHONE, password: TEST_PASSWORD })
  await expect(
    page.getByText(/Invalid phone number or password|رقم الهاتف أو كلمة المرور غير صحيحة/).first(),
  ).toBeVisible()

  // The new password signs in.
  await signIn(page, { phone: TEST_PHONE, password: NEW_PASSWORD })
  await expect(page.getByRole("link", { name: "لوحة التحكم" }).first()).toBeVisible({ timeout: 15_000 })

  // Restore the canonical password via the same UI (suite integrity).
  await openAccountSettings(page)
  await currentPasswordInput(page).fill(NEW_PASSWORD)
  await newPasswordInput(page).fill(TEST_PASSWORD)
  await saveAccountAndExpectSuccess(page)

  // Final proof: the canonical password works again.
  await signOut(page)
  await signIn(page, { phone: TEST_PHONE, password: TEST_PASSWORD })
  await expect(page.getByRole("link", { name: "لوحة التحكم" }).first()).toBeVisible({ timeout: 15_000 })
})
