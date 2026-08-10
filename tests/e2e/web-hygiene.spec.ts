import { expect, test } from "@playwright/test"

/**
 * Web-hygiene regression spec for issue #282.
 *
 * The impeccable dev-livereload block
 * (`<script src="http://localhost:8400/live.js"></script>`) used to ship in
 * the served HTML. The vite dev server serves `index.html` verbatim, so if the
 * markers are ever re-injected (the impeccable tool re-adds them on use), the
 * browser immediately requests `localhost:8400` — caught here behaviorally,
 * both as a network request and as a WebSocket reconnect attempt.
 *
 * Read-only spec: it only loads the page and monitors network + DOM, never
 * clicking through bootstrap/sign-in, so it cannot disturb the serial E2E
 * suite's shared database state.
 */
test.describe.configure({ mode: "serial" })

test("no page load ever requests the dev livereload script (localhost:8400)", async ({ page }) => {
  const devScriptRequests: string[] = []
  const isDevScriptUrl = (url: string) => {
    const lower = url.toLowerCase()
    return lower.includes("localhost:8400") || lower.includes("live.js")
  }
  page.on("request", (request) => {
    if (isDevScriptUrl(request.url())) {
      devScriptRequests.push(request.url())
    }
  })
  page.on("websocket", (ws) => {
    if (isDevScriptUrl(ws.url())) {
      devScriptRequests.push(ws.url())
    }
  })

  await page.goto("/")

  // The React app actually mounted (the #root div stays empty otherwise) —
  // this proves the served index.html booted the real shell.
  await expect(page.locator("#root")).not.toBeEmpty()

  const content = (await page.content()).toLowerCase()
  expect(content).not.toContain("impeccable-live")
  expect(content).not.toContain("localhost:8400")
  expect(content).not.toContain("live.js")

  expect(devScriptRequests).toEqual([])
})
