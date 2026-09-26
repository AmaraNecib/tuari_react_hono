import { expect, test, type Page } from "@playwright/test"

import { seedLegacyPasswordUser } from "./helpers/db-seed"
import { dismissUserJourneyTour, signIn } from "./helpers/session"
import { databaseFixturesAvailable } from "./helpers/db-isolation"

test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")

// Serial + no retries: this spec mutates the seeded legacy user's password
// (legacy → recovered), and the shared per-run DB would break the final
// "legacy password fails" assertion on a retry (same rationale as
// admin-account.spec.ts).
test.describe.configure({ mode: "serial", retries: 0 })

/**
 * A pre-#230 user whose stored hash was created from an all-invisible
 * password (8 spaces). Such a user cannot be created through the bootstrap
 * UI (it rejects all-invisible passwords), so the DB is seeded directly with
 * a genuine better-auth hash (see seedLegacyPasswordUser).
 */
const LEGACY_PHONE = "0555000001"
const LEGACY_NAME = "مستخدم قديم"
const LEGACY_PASSWORD = "        "
/** A compliant replacement password the legacy user rotates to. */
const RECOVERED_PASSWORD = "e2e-recovered-123"

const ACCOUNT_UPDATED_TOAST = "تم تحديث بيانات الحساب بنجاح."

/**
 * Current-password input in the account form. Regex on the accessible name
 * because the wrapping label's text grows when a field error is shown.
 */
const currentPasswordInput = (page: Page) =>
  page.getByRole("textbox", { name: /^كلمة المرور الحالية/ })
/** New-password input in the account form (same rationale as above). */
const newPasswordInput = (page: Page) =>
  page.getByRole("textbox", { name: /^كلمة المرور الجديدة/ })

/**
 * Restores the bootstrap-owner handoff performed by the seed. The app shell
 * mounts the owner-gated `workspaceSnapshot` RPC after any sign-in, so the
 * seeded legacy user must BE the bootstrap owner while this spec runs — but
 * in the full suite an earlier spec (admin-account) already bootstrapped the
 * workspace, and the specs that sort after this file sign in as the canonical
 * admin. The seed therefore re-points the singleton owner row at the legacy
 * user and this handle reverts it once the spec is done (also on failure —
 * Playwright runs afterAll even when beforeAll threw, and the handle is a
 * no-op if the seed never completed).
 */
let restoreOwner: (() => void) | null = null

test.beforeAll(async () => {
  const seeded = await seedLegacyPasswordUser({
    phone: LEGACY_PHONE,
    name: LEGACY_NAME,
    legacyPassword: LEGACY_PASSWORD,
  })
  restoreOwner = seeded.restoreOwner
})

test.afterAll(async () => {
  restoreOwner?.()
})

/** Opens Settings → Account (the default tab, so navigation suffices). */
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

test("a pre-#230 whitespace-password user regains access and rotates the password", async ({ page }) => {
  await dismissUserJourneyTour(page)
  await page.goto("/")

  // The seeded legacy user makes hasUsers true, so the sign-in screen shows.
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible()

  // 1. Sign-in with the all-invisible password succeeds: the web client no
  //    longer blocks it (sign-in is verification-only) and the server
  //    verifies the legacy hash — the #321 recovery channel.
  await signIn(page, { phone: LEGACY_PHONE, password: LEGACY_PASSWORD })
  await expect(page.getByRole("link", { name: "لوحة التحكم" }).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator("aside").getByText(LEGACY_NAME, { exact: true })).toBeVisible()

  // 2. Rotate to a compliant password from Settings → Account. The current
  //    password is the legacy whitespace value and must be accepted exactly
  //    as typed (never trimmed).
  await openAccountSettings(page)
  await currentPasswordInput(page).fill(LEGACY_PASSWORD)
  await newPasswordInput(page).fill(RECOVERED_PASSWORD)
  const saveResponse = page.waitForResponse(
    (response) => response.url().includes("/api/auth/change-password"),
  )
  await page.getByRole("button", { name: "حفظ بيانات الحساب" }).click()
  expect((await saveResponse).status()).toBe(200)
  await expect(page.getByText(ACCOUNT_UPDATED_TOAST).first()).toBeVisible()

  // 3. The recovered password signs the user back in…
  await signOut(page)
  await signIn(page, { phone: LEGACY_PHONE, password: RECOVERED_PASSWORD })
  await expect(page.getByRole("link", { name: "لوحة التحكم" }).first()).toBeVisible({ timeout: 15_000 })

  // …and the legacy whitespace password no longer does (the hash was replaced).
  await signOut(page)
  await signIn(page, { phone: LEGACY_PHONE, password: LEGACY_PASSWORD })
  await expect(page.getByText(/رقم الهاتف أو كلمة المرور غير صحيحة/).first()).toBeVisible({ timeout: 15_000 })
})
