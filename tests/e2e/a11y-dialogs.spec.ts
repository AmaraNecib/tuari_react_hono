import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn } from "./helpers/session"

test.describe.configure({ mode: "serial" })

/**
 * A11y coverage for the four live custom modals converted to the Base UI
 * Dialog primitive (issue #275): modal semantics, focus management, ESC.
 */

test("search dialog labels its input, traps focus, and closes on Escape", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.keyboard.press("Control+k")
  const dialog = page.getByRole("dialog", { name: "البحث" })
  await expect(dialog).toBeVisible()

  // The search input has an accessible name via aria-label (not just a
  // placeholder) and receives initial focus.
  const combobox = dialog.getByRole("combobox", { name: "بحث..." })
  await expect(combobox).toBeFocused()

  // Tab repeatedly — focus must never leave the dialog (focus trap). Tab
  // may expand a parent result (the documented gesture) or move focus to
  // the close button; either way it stays inside the dialog. expect.poll
  // retries because Base UI's focus manager settles focus asynchronously.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab")
    await expect
      .poll(() =>
        page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
      )
      .toBe(true)
  }

  // Escape closes the dialog.
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
})

test("keyboard shortcuts help is a labelled modal dialog and closes on Escape", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("button", { name: "فتح المساعدة" }).click()
  const dialog = page.getByRole("dialog", { name: "اختصارات لوحة المفاتيح" })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole("heading", { name: "اختصارات لوحة المفاتيح" })
  ).toBeVisible()
  // Focus moves inside the dialog (first tabbable = the labelled close button).
  await expect(dialog.getByRole("button", { name: "إغلاق" })).toBeFocused()

  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
})

test("first-run tour is a modal dialog and Escape skips it", async ({ page }) => {
  // Sign in WITHOUT dismissing the tour so it auto-starts on the shell.
  await bootstrapOrSignIn(page, { dismissTour: false })

  // First step is the sidebar tour card ("الشريط الجانبي").
  const dialog = page.getByRole("dialog", { name: "الشريط الجانبي" })
  await expect(dialog).toBeVisible({ timeout: 15_000 })

  // Escape skips the tour (same as the Skip button) and persists the status.
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()

  const status = await page.evaluate(() =>
    localStorage.getItem("journey-home-tour-status")
  )
  expect(status).toBe("skipped")
})

test("mobile filters drawer traps focus and closes on Escape", async ({ page }) => {
  await bootstrapOrSignIn(page)

  // Navigate to the employees page in the desktop layout first (the sidebar
  // is off-canvas on mobile), then shrink the viewport so the search bar
  // switches to the drawer layout.
  await page.getByRole("link", { name: "العاملون" }).first().click()
  await page.setViewportSize({ width: 390, height: 844 })

  const openButton = page.getByRole("button", { name: "الفلاتر" })
  await expect(openButton).toBeVisible()
  await openButton.click()

  const drawer = page.getByRole("dialog", { name: "الفلاتر" })
  await expect(drawer).toBeVisible()

  // Focus lands on the close button (first tabbable in the drawer).
  await expect(drawer.getByRole("button", { name: "إغلاق" })).toBeFocused()

  // Tab repeatedly — focus must never leave the drawer (focus trap).
  // expect.poll retries because Base UI's focus manager settles focus
  // asynchronously.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab")
    await expect
      .poll(() =>
        page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
      )
      .toBe(true)
  }

  // Escape closes the drawer.
  await page.keyboard.press("Escape")
  await expect(drawer).toBeHidden()

  // Focus returns to the trigger button (Base UI finalFocus).
  await expect(openButton).toBeFocused()
})
