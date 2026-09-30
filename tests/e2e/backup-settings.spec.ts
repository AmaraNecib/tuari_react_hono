import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn } from "./helpers/session"

/**
 * Backup status surface (#439) + backup-folder setting (#436).
 *
 * The daily snapshot runs on startup, so the card may be in any of its four
 * states (never run / succeeded / failed / overdue) depending on timing. This
 * spec pins that the surface is reachable from Settings → System, and that a
 * chosen folder is actually written where the next sidecar start reads it.
 * The state-specific rendering is covered by the component tests.
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

test("the chosen folder is persisted for the next start", async ({ page }) => {
  // The managed API writes into a throwaway config file (playwright.config.ts).
  // An externally managed API has no such file, so this durability assertion
  // cannot be made against it.
  test.skip(process.env.E2E_API_MANAGED !== "1", "managed E2E API required")
  const configFile = process.env.TUARI_CONFIG_FILE
  expect(configFile).toBeTruthy()

  const target = mkdtempSync(join(tmpdir(), "tuari-e2e-backups-"))
  try {
    await bootstrapOrSignIn(page)
    await page.getByRole("link", { name: "الإعدادات" }).first().click()
    await page.getByRole("button", { name: "النظام" }).click()

    await page.getByLabel("مسار المجلد").fill(target)
    await page.getByRole("button", { name: "حفظ المسار" }).click()

    await expect(page.getByText("تم حفظ مجلد النسخ الاحتياطي.")).toBeVisible()
    // A durable save, not a session-only one.
    await expect(page.getByText(/هذه الجلسة فقط/)).toHaveCount(0)

    // The write reached the file the next sidecar start reads. This is the
    // actual durability proof; a page reload alone only re-reads the running
    // process's in-memory root.
    const saved = JSON.parse(readFileSync(configFile!, "utf8")) as {
      backups_root?: string
    }
    expect(saved.backups_root).toBe(target)

    // The status still surfaces the saved root after a reload.
    await page.reload()
    await expect(page.getByTestId("backup-status")).toBeVisible()
    await expect(page.getByLabel("مسار المجلد")).toHaveValue(target)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})
