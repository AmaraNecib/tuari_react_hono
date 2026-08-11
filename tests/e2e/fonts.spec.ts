import { expect, test } from "@playwright/test"

/**
 * Issue #281 — fonts are self-hosted.
 *
 * The web shell must never touch Google Fonts: no render-blocking stylesheet
 * request, no preconnects, no font fetches from third-party origins. Every
 * family the design tokens reference is served from this origin.
 *
 * The Arabic woff2 preload is asserted at BUILD level (prod-html.test.ts — a
 * static <link rel="preload"> in the served HTML, scanner-discoverable before
 * any JS runs), not here: the dev server does not run the build-time HTML
 * transform, so no preload link exists in dev.
 */
test.describe("self-hosted fonts (issue #281)", () => {
  test("boots without Google Fonts and serves every family from this origin", async ({ page, baseURL }) => {
    const thirdPartyFontRequests: string[] = []
    const crossOriginFontRequests: string[] = []
    page.on("request", (request) => {
      const url = request.url()
      if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) {
        thirdPartyFontRequests.push(url)
      }
      if (request.resourceType() === "font" && !url.startsWith(baseURL ?? "")) {
        crossOriginFontRequests.push(url)
      }
    })

    await page.goto("/")

    // The shell boots to the Arabic RTL login screen.
    await expect(page.getByLabel("رقم الهاتف")).toBeVisible()

    // Zero requests to Google Fonts (the old render-blocking <link> + preconnects are gone).
    expect(thirdPartyFontRequests).toEqual([])
    // Every font fetch comes from this origin (self-hosted @fontsource files).
    expect(crossOriginFontRequests).toEqual([])

    // The primary Arabic body font preload is build-time (prod-html.test.ts) —
    // the dev server serves index.html without the build transform.

    // All families the design tokens reference are registered via @font-face.
    const expectedFamilies = [
      "Instrument Serif",
      "Inter Tight Variable",
      "JetBrains Mono Variable",
      "IBM Plex Sans Arabic",
      "Amiri",
      "Noto Naskh Arabic",
      "Noto Sans Arabic Variable",
    ]
    await expect
      .poll(async () =>
        page.evaluate((families) => {
          const registered = new Set(
            Array.from(document.fonts).map((face) => face.family.replace(/["']/g, "")),
          )
          return families.map((family) => registered.has(family))
        }, expectedFamilies),
      )
      .toEqual([true, true, true, true, true, true, true])

    // Fonts actually used by the login screen are loaded from the self-hosted
    // files (no font-swap wait on first paint). Instrument Serif etc. are not
    // asserted here: their glyph sets are Latin-only, so Arabic-first UI text
    // renders through IBM Plex Sans Arabic (the arabic + latin subsets).
    await expect
      .poll(async () =>
        page.evaluate((families) => {
          const faces = Array.from(document.fonts)
          return families.map((family) =>
            faces.some(
              (face) => face.family.replace(/["']/g, "") === family && face.status === "loaded",
            ),
          )
        }, ["IBM Plex Sans Arabic"]),
      )
      .toEqual([true])
  })
})
