import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn } from "./helpers/session"

/**
 * #278 — validation failures must surface the zod field message (attached to
 * the ORPC wire-gate BAD_REQUEST as `data.issues`) instead of the generic
 * fallback toast.
 *
 * A 161-char name passes the client-side gates (non-empty name + unit) but
 * exceeds the contract `max(160)`, so ONLY the ORPC wire gate can reject it —
 * exercising the exact path that used to produce a fallback toast.
 */
test("validation failure shows the field message, not the fallback toast", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "دليل العناصر" }).first().click()
  await expect(page.getByRole("heading", { name: "دليل العناصر" })).toBeVisible()

  const tooLongName = "x".repeat(161)
  await page.getByLabel("اسم العنصر").fill(tooLongName)
  // CONSUMABLE items require a unit before the create button enables.
  await page.getByLabel("وحدة القياس").fill("قطعة")

  // Gate the toast assertion on the RPC response (repo pattern): the create
  // RPC must reject with 400 before the toast is trusted.
  const createResponse = page.waitForResponse((r) =>
    r.url().includes("/rpc/inventoryItemDefinitionsCreate"),
  )
  await page.getByRole("button", { name: "إنشاء التعريف" }).first().click()

  expect((await createResponse).status()).toBe(400)

  // The toast carries the zod max-length message, not the fallback string.
  await expect(page.getByText(/160/)).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText("تعذر إنشاء تعريف العنصر.")).toHaveCount(0)
})
