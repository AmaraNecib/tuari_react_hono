import { expect, test } from "@playwright/test"

// The desktop shell shows a static splashscreen.html window while the API
// sidecar boots and React mounts behind the hidden main window. The page
// itself is served by the same Vite dev server (public/ -> /splashscreen.html)
// and must stay dependency-free and CSP-safe: no scripts, no external
// resources. The window-switch itself is Tauri-only (see lib.rs app_ready),
// so the browser-testable surface is the static page's contract.
test.describe("splashscreen static page", () => {
  test("serves a dependency-free loading page with the brand", async ({ page }) => {
    const response = await page.goto("/splashscreen.html")

    expect(response?.status()).toBe(200)
    await expect(page.locator("body")).toContainText("Tuari")
    await expect(page.locator("body")).toContainText("نظام إدارة")
    // CSP forbids inline scripts — the splashscreen must stay script-free
    // (an inline script would be blocked and the spinner never spins).
    await expect(page.locator("script")).toHaveCount(0)
  })
})
