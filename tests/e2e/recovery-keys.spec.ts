import { expect, test, type Page } from "@playwright/test"

import { bootstrapOrSignIn } from "./helpers/session"

// Serial because the pool is shared DB state; retries would re-run against a
// mutated pool and break the empty-state precondition, so disable them here.
test.describe.configure({ mode: "serial", retries: 0 })

/** Recovery key format: 3 segments of 6 hex chars, e.g. "a1b2c3-d4e5f6-7890ab". */
const KEY_PATTERN = /^[0-9a-f]{6}-[0-9a-f]{6}-[0-9a-f]{6}$/
/** Masked key format rendered in the pool list: "a1b2-****-****". */
const MASKED_PATTERN = /^[0-9a-f]{4}-\*{4}-\*{4}$/

/** The web app talks to the API at this origin (see playwright.config.ts). */
const API_URL = "http://127.0.0.1:4318"

type RecoveryKeyPoolStatus = {
  availableCount: number
  totalCount: number
  maxPoolSize: number
  maskedKeys: Array<{
    id: string
    prefix: string
    status: "AVAILABLE" | "CONSUMED" | "REVOKED"
  }>
}

/**
 * Opens the Settings page and activates the Security tab.
 * The tab is persisted in the URL (?tab=security), so a later page reload
 * restores it automatically.
 */
async function openSecurityTab(page: Page) {
  await page.getByRole("link", { name: "الإعدادات" }).first().click()
  await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible()
  await page.getByRole("button", { name: "الأمان" }).click()
  await expect(page.getByRole("heading", { name: "مفاتيح الاسترداد" })).toBeVisible()
}

/**
 * Calls a recovery-key RPC procedure from the browser context.
 * Recovery keys are consumed at password-reset time (desktop-only flow), so
 * there is no web UI to consume them — the spec drives the same RPC endpoint
 * the app uses, reusing the session cookie the page already holds.
 */
async function callRpc<T>(page: Page, procedure: string, input?: unknown): Promise<T> {
  return page.evaluate(
    async ({ url, body }) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ json: body ?? null }),
      })
      if (!response.ok) {
        throw new Error(`RPC failed: ${response.status} ${await response.text()}`)
      }
      const envelope = (await response.json()) as { json: T }
      return envelope.json
    },
    { url: `${API_URL}/rpc/${procedure}`, body: input },
  )
}

/**
 * Generates keys through the UI, reads the plain-text keys from the
 * "shown once" dialog, and confirms. Returns the generated keys.
 */
async function generateKeysViaUi(page: Page): Promise<string[]> {
  await page.getByRole("button", { name: "إنشاء مفاتيح جديدة" }).click()

  const dialog = page.getByRole("dialog", { name: "تم إنشاء مفاتيح الاسترداد" })
  await expect(dialog).toBeVisible()
  const generatedKeys = await dialog.locator("code").allTextContents()
  for (const key of generatedKeys) {
    expect(key).toMatch(KEY_PATTERN)
  }

  await dialog.getByRole("button", { name: "لقد حفظت المفاتيح" }).click()
  await expect(dialog).toBeHidden()

  return generatedKeys
}

test("recovery key lifecycle: generate, mask, revoke, consume, replenish, max pool", async ({ page }) => {
  await bootstrapOrSignIn(page)
  await openSecurityTab(page)

  // ── Empty pool: no keys, counts reflect the pool configuration. ─────────
  await expect(page.getByText(/^متاح:\s*0$/)).toBeVisible()
  await expect(page.getByText(/^الحد الأقصى:\s*5$/)).toBeVisible()
  await expect(page.getByText(MASKED_PATTERN)).toHaveCount(0)

  // ── Generate: plain-text keys are shown exactly once, then masked. ──────
  const generatedKeys = await generateKeysViaUi(page)
  expect(generatedKeys).toHaveLength(3)

  await expect(page.getByText(/^متاح:\s*3$/)).toBeVisible()
  await expect(page.getByText(MASKED_PATTERN)).toHaveCount(3)
  // The masked list never leaks a plain-text key.
  for (const key of generatedKeys) {
    await expect(page.getByText(key, { exact: true })).toHaveCount(0)
  }

  // ── Revoke one key from the masked list. ────────────────────────────────
  await page.getByRole("button", { name: "إلغاء" }).first().click()
  await expect(page.getByText(/^متاح:\s*2$/)).toBeVisible()
  await expect(page.getByText("ملغى", { exact: true })).toBeVisible()
  // Only AVAILABLE keys keep a revoke button (3 - 1 revoked = 2).
  await expect(page.getByRole("button", { name: "إلغاء" })).toHaveCount(2)

  // Resolve which keys are still available from the pool status instead of
  // matching 4-char prefixes in the DOM (avoids a theoretical prefix
  // collision flaking the test).
  const poolAfterRevoke = await callRpc<RecoveryKeyPoolStatus>(page, "getRecoveryKeyPool")
  const availablePrefixes = new Set(
    poolAfterRevoke.maskedKeys.filter((key) => key.status === "AVAILABLE").map((key) => key.prefix),
  )
  const availableKeys = generatedKeys.filter((key) => availablePrefixes.has(key.slice(0, 4)))
  expect(availableKeys).toHaveLength(2)
  const revokedKey = generatedKeys.find((key) => !availablePrefixes.has(key.slice(0, 4)))!
  const keyToConsume = availableKeys[0]!

  // ── Consume via the RPC endpoint (no web UI exists for it). ─────────────
  // One-time use is atomic: two parallel consumes of the same key — only
  // one may win.
  const [firstConsume, secondConsume] = await Promise.all([
    callRpc<{ success: boolean }>(page, "consumeRecoveryKey", { key: keyToConsume }),
    callRpc<{ success: boolean }>(page, "consumeRecoveryKey", { key: keyToConsume }),
  ])
  expect([firstConsume.success, secondConsume.success].filter(Boolean)).toHaveLength(1)

  // ── The consumed key cannot be consumed again (sequential). ─────────────
  const reuseResult = await callRpc<{ success: boolean }>(page, "consumeRecoveryKey", {
    key: keyToConsume,
  })
  expect(reuseResult).toEqual({ success: false })

  // ── A revoked key cannot be consumed either. ────────────────────────────
  const revokeConsumeResult = await callRpc<{ success: boolean }>(page, "consumeRecoveryKey", {
    key: revokedKey,
  })
  expect(revokeConsumeResult).toEqual({ success: false })

  // ── Keys are case-sensitive secrets: an uppercased key is invalid. ─────
  const uppercasedResult = await callRpc<{ success: boolean }>(page, "consumeRecoveryKey", {
    key: keyToConsume.toUpperCase(),
  })
  expect(uppercasedResult).toEqual({ success: false })

/**
 * Posts a raw RPC payload and returns the HTTP status — used to prove the
 * wire gate (zod 400) rejects malformed / invisible-char key input.
 */
async function fetchRpcStatus(page: Page, procedure: string, input: unknown): Promise<number> {
  return page.evaluate(
    async ({ url, body }) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ json: body }),
      })
      return response.status
    },
    { url: `${API_URL}/rpc/${procedure}`, body: input },
  )
}

// ── Malformed input is rejected by the wire gate (zod 400). ─────────────
  const malformedStatus = await fetchRpcStatus(page, "consumeRecoveryKey", { key: "" })
  expect(malformedStatus).toBe(400)

  // ── #234: a zero-width-space key survives trim() (not WhiteSpace) but the
  // wire gate must reject invisible format chars, not hash-compare them. ────
  const zwspStatus = await fetchRpcStatus(page, "consumeRecoveryKey", { key: "\u200B\u200B" })
  expect(zwspStatus).toBe(400)

  // ── #334: invisible codepoints OUTSIDE Cf are rejected too — braille blank
  // (So, renders as a blank cell), combining marks (Mn) and control chars (Cc)
  // all render as nothing, so they must never reach the hash comparison. ────
  const brailleBlankStatus = await fetchRpcStatus(page, "consumeRecoveryKey", {
    key: "\u2800\u2800",
  })
  expect(brailleBlankStatus).toBe(400)
  const combiningMarkStatus = await fetchRpcStatus(page, "consumeRecoveryKey", {
    key: "\u0301\u0301",
  })
  expect(combiningMarkStatus).toBe(400)
  const controlCharStatus = await fetchRpcStatus(page, "consumeRecoveryKey", {
    key: "\u0001\u0001",
  })
  expect(controlCharStatus).toBe(400)
  // Issue case 4: a mid-string NBSP survives trim() (edge-only) — the Zs
  // class is rejected anywhere, so a key with an embedded NBSP gets a 400.
  const nbspStatus = await fetchRpcStatus(page, "consumeRecoveryKey", {
    key: "a1b2\u00A0c3d4",
  })
  expect(nbspStatus).toBe(400)

  // Pool reflects all transitions after a reload (fresh fetch).
  await page.reload()
  await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible()
  await expect(page.getByText(/^متاح:\s*1$/)).toBeVisible()
  await expect(page.getByText("مستخدم", { exact: true })).toBeVisible()
  await expect(page.getByText("ملغى", { exact: true })).toBeVisible()
  // Revoke buttons remain only on the single AVAILABLE row.
  await expect(page.getByRole("button", { name: "إلغاء" })).toHaveCount(1)

  // ── Replenish: generating tops the pool back up toward the max. ─────────
  const replenished = await generateKeysViaUi(page)
  expect(replenished).toHaveLength(3)
  await expect(page.getByText(/^متاح:\s*4$/)).toBeVisible()

  const toppedUp = await generateKeysViaUi(page)
  expect(toppedUp).toHaveLength(1)
  await expect(page.getByText(/^متاح:\s*5$/)).toBeVisible()

  // ── Max pool boundary: the generate button is disabled at 5 available. ──
  await expect(page.getByRole("button", { name: "إنشاء مفاتيح جديدة" })).toBeDisabled()

  // ── …and the server refuses to overshoot the pool. ──────────────────────
  const overshoot = await callRpc<{ keys: unknown[] }>(page, "generateRecoveryKeys")
  expect(overshoot.keys).toEqual([])
})
