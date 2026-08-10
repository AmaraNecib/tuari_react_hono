import { expect, test } from "@playwright/test"

/**
 * Web-hygiene regression spec for issue #282.
 *
 * The impeccable dev-livereload block
 * (`<script src="http://localhost:8400/live.js"></script>`) used to ship in
 * the served HTML. The vite dev server serves `index.html` verbatim, so if the
 * markers are ever re-injected (the impeccable tool re-adds them on use), the
 * browser immediately requests `localhost:8400` — caught here behaviorally.
 *
 * Read-only spec: it only loads the page and monitors network + DOM, never
 * clicking through bootstrap/sign-in, so it cannot disturb the serial E2E
 * suite's shared database state.
 */
test.describe.configure({ mode: "serial" })

test("no page load ever requests the dev livereload script (localhost:8400)", async ({ page }) => {
  const devScriptRequests: string[] = []
  page.on("request", (request) => {
    const url = request.url()
    if (url.includes("localhost:8400") || url.includes("live.js")) {
      devScriptRequests.push(url)
    }
  })

  await page.goto("/")

  // The app shell (Arabic RTL) actually booted — this is the served index.html.
  await expect(page.locator("html")).toHaveAttribute("lang", "ar")

  const content = await page.content()
  expect(content).not.toContain("impeccable-live")
  expect(content).not.toContain("localhost:8400")
  expect(content).not.toContain("live.js")

  expect(devScriptRequests).toEqual([])
})
