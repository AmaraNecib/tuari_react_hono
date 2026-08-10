import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn } from "./helpers/session"

/**
 * Issue #284 item 5 — the mobile sidebar drawer must open as an overlay,
 * dismiss on backdrop tap, and close when a nav link is followed.
 *
 * Regression guard: the drawer's CSS selectors (`.tauri-shell > aside`) were
 * broken by a wrapper div, so the drawer never overlaid — the old ::after
 * backdrop trapped the user. These tests pin the fixed behavior.
 */
test.describe("mobile sidebar drawer", () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test("opens as an overlay and closes on backdrop tap", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible()

    const shell = page.locator(".tauri-shell")
    const aside = shell.locator("aside")
    await expect(shell).toHaveAttribute("data-sidebar-open", "false")

    // Open the drawer via the mobile header toggle.
    const toggle = page.locator(".tauri-shell header button").first()
    await toggle.click()

    await expect(shell).toHaveAttribute("data-sidebar-open", "true")
    // Drawer is an overlay: fixed position and actually on-screen (RTL drawer
    // anchors at the right edge, so its right edge equals the viewport width).
    await expect
      .poll(() =>
        aside.evaluate((el) => getComputedStyle(el).position),
      )
      .toBe("fixed")
    await expect
      .poll(() =>
        aside.evaluate((el) => el.getBoundingClientRect().right),
      )
      .toBe(375)
    await expect(page.locator(".sb-mobile-backdrop")).toHaveAttribute("data-open", "true")

    // Tap the backdrop → drawer closes.
    await page.locator(".sb-mobile-backdrop").click({ position: { x: 5, y: 5 } })
    await expect(shell).toHaveAttribute("data-sidebar-open", "false")
    await expect(page.locator(".sb-mobile-backdrop")).toHaveAttribute("data-open", "false")
  })

  test("closes the drawer when a nav link is followed", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible()

    const shell = page.locator(".tauri-shell")
    await page.locator(".tauri-shell header button").first().click()
    await expect(shell).toHaveAttribute("data-sidebar-open", "true")

    // Follow a sidebar nav link (RTL: the settings link sits inside the drawer).
    await page.getByRole("link", { name: "الإعدادات" }).first().click()

    // Navigation happened AND the drawer closed afterwards.
    await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible()
    await expect(shell).toHaveAttribute("data-sidebar-open", "false")
  })

  test("keyboard users can skip the sidebar to the content landmark", async ({ page }) => {
    await bootstrapOrSignIn(page)

    await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible()

    // First Tab lands on the skip link (it precedes the shell grid in the DOM).
    await page.keyboard.press("Tab")
    await expect(page.getByRole("link", { name: "تخطي إلى المحتوى" })).toBeFocused()

    // Activating it moves focus to the main-content landmark.
    await page.keyboard.press("Enter")
    await expect(page.locator("#main-content")).toBeFocused()
  })
})
