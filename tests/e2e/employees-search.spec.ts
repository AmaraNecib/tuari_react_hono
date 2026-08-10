import { expect, test } from "@playwright/test"

import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"
import { seedEmployees } from "./helpers/db-seed"

test.describe.configure({ mode: "serial" })

/**
 * Server-side employees search (issue #183).
 *
 * The employees page shows the first cursor page (default limit 50). The
 * spec seeds 55 employees — 54 fillers plus one older target that sorts
 * AFTER the first page — so the target is NOT visible without a search.
 * Typing its name must surface it through the `employeesListPaged` search
 * term (filter applied before pagination), proving the search spans all
 * records, not just the current page.
 *
 * Employee creation via UI/RPC is blocked by a pre-existing role rule
 * (tracked #227), so rows are seeded directly into the E2E sqlite DB —
 * see `helpers/db-seed.ts`.
 */
test("employees search filters server-side across all records", async ({ page }) => {
  await bootstrapOrSignIn(page)

  const suffix = uniqueSuffix()
  const targetName = `نوفل-${suffix}`
  // Distinct, strictly-decreasing createdAt so the paged sort (createdAt DESC,
  // id DESC) is deterministic: filler 0 is newest, the target is oldest.
  const baseTs = Date.now()
  // Phones must be unique per TEST ATTEMPT (Playwright retries share the same
  // API DB), so the 5-digit salt derives from the per-call suffix. Ranges:
  // fillers salt..salt+53, target salt+400000 — all valid `05` + 8 digits.
  const phoneSalt = (Number.parseInt(suffix.replace(/[^0-9]/g, ""), 10) || 12345) % 400000
  const fillers = Array.from({ length: 54 }, (_, i) => {
    const name = `موظف-${i}-${suffix}`
    return {
      firstName: name,
      lastName: "تجريبي",
      phone: `0555${String(phoneSalt + i).padStart(6, "0")}`,
      createdAt: new Date(baseTs - i * 1000).toISOString(),
    }
  })
  // The target sorts AFTER all fillers (oldest createdAt) → 55th row, beyond
  // the 50-row first page.
  seedEmployees([
    ...fillers,
    {
      firstName: targetName,
      lastName: "بن عيسى",
      phone: `0555${String(phoneSalt + 400000).padStart(6, "0")}`,
      createdAt: new Date(baseTs - 60 * 60 * 1000).toISOString(),
    },
  ])

  await page.getByRole("link", { name: "العاملون" }).first().click()
  await expect(page.getByRole("heading", { name: "العاملون" })).toBeVisible()

  // The first page shows the newest 50 rows — the target (55th) and the
  // oldest filler (54th) are beyond it, so neither is visible without a search.
  await expect(page.getByText(`موظف-0-${suffix}`).first()).toBeVisible({ timeout: 15_000 })

  // A filler that is NOT on the first page must also be reachable via search.
  const farFiller = `موظف-53-${suffix}`
  await expect(page.getByText(farFiller)).toHaveCount(0)
  await expect(page.getByText(targetName)).toHaveCount(0)

  const searchInput = page.getByPlaceholder("بحث...")

  // Search for the far-page filler: server finds it across all records.
  await searchInput.fill(farFiller)
  await expect(page.getByText(farFiller).first()).toBeVisible({ timeout: 15_000 })
  // Other employees are filtered out (names unique to the seed).
  await expect(page.getByText(targetName)).toHaveCount(0)
  await expect(page.getByText(`موظف-0-${suffix}`)).toHaveCount(0)

  // The old local-page limitation hint is gone.
  await expect(
    page.getByText("يبحث في الصفحة الحالية فقط. اعمل مسح لرؤية جميع النتائج."),
  ).toHaveCount(0)

  // Search by phone digits also matches.
  await searchInput.fill(`0555${String(phoneSalt + 400000).padStart(6, "0")}`)
  await expect(page.getByText(targetName).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(farFiller)).toHaveCount(0)

  // Clearing restores the default first page.
  await searchInput.fill("")
  await expect(page.getByText(`موظف-0-${suffix}`).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(targetName)).toHaveCount(0)
})
