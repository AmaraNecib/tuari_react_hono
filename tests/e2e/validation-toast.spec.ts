import { expect, test } from "@playwright/test"
import { bootstrapOrSignIn } from "./helpers/session"

// A project name above the wire limit passes the nonempty client gate. The
// supported operation must still expose the field refusal, not a generic toast.
test("supported project validation displays the wire field error and retains the draft", async ({ page }) => {
  await bootstrapOrSignIn(page)
  await page.goto("/projects/create")
  const tooLongName = "x".repeat(161)
  await page.getByLabel("اسم المشروع").fill(tooLongName)
  const response = page.waitForResponse(r => r.url().includes("/rpc/projectsCreate") && r.request().method() === "POST")
  await page.getByRole("button", { name: "حفظ المشروع" }).click()
  expect((await response).status()).toBe(400)
  await expect(page.getByText(/160/).first()).toBeVisible()
  await expect(page.getByLabel("اسم المشروع")).toHaveValue(tooLongName)
  await expect(page.getByText("تعذر إنشاء المشروع.", { exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/\/projects\/create$/)
})
