import { expect, type Page } from "@playwright/test"

export const TEST_PHONE = "0612345678"
export const TEST_PASSWORD = "password123"
export const TEST_NAME = "مدير التشغيل"

/**
 * The bootstrap setup key the Playwright API web server runs with (see
 * playwright.config.ts). Filled into the bootstrap form so the first-run
 * flow passes the setup-key gate.
 */
export const BOOTSTRAP_SETUP_KEY = "e2e-bootstrap-setup-key-9f2c1a7d-4b6e"

/**
 * Fills the setup-secret field when the bootstrap form exposes it (the
 * field is hidden when no setup key is configured).
 */
async function fillSetupSecretIfVisible(page: Page) {
  const setupSecretField = page.getByLabel("رمز الإعداد الأول")
  if (await setupSecretField.isVisible()) {
    await setupSecretField.fill(BOOTSTRAP_SETUP_KEY)
  }
}

/**
 * Dismiss the first-run user-journey tour before the app boots: it overlays
 * the sidebar with a z-50 backdrop and intercepts clicks until skipped.
 * JourneyStateManager keys: `journey-<key>-<type>`.
 *
 * Must run via addInitScript so the dismissal lands before the app reads
 * localStorage on first navigation.
 */
export async function dismissUserJourneyTour(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("journey-home-tour-status", "skipped")
  })
}

/**
 * Fills the auth screen and submits a phone + password sign-in.
 * Assumes the sign-in (not bootstrap) screen is already shown.
 */
export async function signIn(page: Page, input: { phone: string; password: string }) {
  await page.getByLabel("رقم الهاتف").fill(input.phone)
  await page.getByLabel("كلمة المرور", { exact: true }).fill(input.password)
  await page.getByRole("button", { name: "دخول إلى مساحة العمل" }).click()
}

/**
 * Bootstraps (first run) or signs in, WITHOUT waiting for the workspace
 * shell to render. The tour test needs this variant: once the shell mounts
 * the first-run tour is a real modal (issue #275) that marks the rest of
 * the page aria-hidden, so the dashboard link is not queryable until the
 * tour is skipped.
 */
async function signInCore(page: Page) {
  await page.goto("/")

  await expect(page.getByLabel("رقم الهاتف")).toBeVisible()

  const createFirstUserButton = page.getByRole("button", { name: "إنشاء الحساب الأول" })

  if (await createFirstUserButton.isVisible()) {
    await page.getByLabel("الاسم الكامل").fill(TEST_NAME)
    await page.getByLabel("رقم الهاتف").fill(TEST_PHONE)
    // exact: true — the PasswordInput toggle's aria-label ("إظهار كلمة المرور")
    // is a substring superset, so substring matching is ambiguous.
    await page.getByLabel("كلمة المرور", { exact: true }).fill(TEST_PASSWORD)
    await fillSetupSecretIfVisible(page)
    await createFirstUserButton.click()
  } else {
    await signIn(page, { phone: TEST_PHONE, password: TEST_PASSWORD })
  }
}

export async function bootstrapOrSignIn(page: Page, options?: { dismissTour?: boolean }) {
  const dismissTour = options?.dismissTour ?? true
  if (dismissTour) await dismissUserJourneyTour(page)

  await signInCore(page)

  // The signed-in shell renders the sidebar with the dashboard entry.
  await expect(page.getByRole("link", { name: "لوحة التحكم" }).first()).toBeVisible({
    timeout: 15_000,
  })
}

export function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`
}
