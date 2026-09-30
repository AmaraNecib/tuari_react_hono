import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn } from "./helpers/session"

/**
 * Backup status surface (#439) + backup-folder setting (#436).
 *
 * The daily snapshot runs on startup, so the card may be in any of its three
 * states (never run / succeeded / failed) depending on timing. This spec pins
 * that the surface is reachable from Settings → System and that both the
 * status card and the folder setting render — the state-specific rendering is
 * covered by the component tests.
 */
test.describe.configure({ mode: "serial" })

test("settings system tab shows the backup status and folder setting", async ({ page }) => {
  await bootstrapOrSignIn(page)

  await page.getByRole("link", { name: "الإعدادات" }).first().click()
  await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible()
  await page.getByRole("button", { name: "النظام" }).click()

  await expect(page.getByTestId("backup-status")).toBeVisible()
  await expect(page.getByRole("heading", { name: "النسخ الاحتياطي اليومي" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "مجلد النسخ الاحتياطي" })).toBeVisible()
  await expect(page.getByRole("button", { name: "حفظ المسار" })).toBeVisible()
})
