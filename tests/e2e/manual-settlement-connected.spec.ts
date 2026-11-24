import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { expect, test, type Page } from "@playwright/test"
import type { ExactDebtAccount } from "../../packages/contracts/src"
import { bootstrapOrSignIn } from "./helpers/session"

function fixture<T>(run: string, command: string, value = ""): T {
  return JSON.parse(execFileSync(process.execPath, ["apps/api/node_modules/tsx/dist/cli.mjs", "--tsconfig", "tests/e2e/connected-exact.tsconfig.json", "tests/e2e/manual-settlement-fixture.ts", run, command, value], { encoding: "utf8" })) as T
}
test.skip(process.env.CONNECTED_EXACT_TEST !== "1", "Dedicated disposable native application required")
async function rpc<T>(page: Page, path: string, input: unknown): Promise<T> {
  return page.evaluate(async ({ api, path, input }) => {
    const response = await fetch(`${api}/rpc/${path}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: input }) })
    const body = await response.json()
    if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(body)}`)
    return body.json
  }, { api: process.env.PLAYWRIGHT_API_URL!, path, input }) as Promise<T>
}

test("external manual pair baseline and responsive evidence #613", async ({ page, browser, context }) => {
  await bootstrapOrSignIn(page)
  const party = await rpc<{ success: boolean; item: { id: string } }>(page, "externalCounterpartiesCreate", { fullName: "جهة التسوية اليدوية 613", phoneNumber: "0555123613" })
  expect(party.success).toBe(true)
  const accounts: ExactDebtAccount[] = []
  for (const [direction, openingBalanceDzd] of [["PAYABLE", "100.00"], ["RECEIVABLE", "60.00"]]) {
    accounts.push(await rpc<ExactDebtAccount>(page, "financial/debts/create", { requestId: crypto.randomUUID(), partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party.item.id, direction, openingBalanceDzd, reasonCategory: "OTHER", reasonDetail: "رصيد يدوي للاختبار" }))
  }
  const run = process.env.MANUAL_SETTLEMENT_RUN!
  const phase = process.env.MANUAL_SETTLEMENT_CAPTURE ?? "before"
  // Seed a real excluded producer posting through its trusted ledger capability.
  const produced = fixture<{id:string}>(run, "producer", accounts[0]!.id)
  const storageState = await context.storageState()
  const captures: object[] = []
  for (const [name, width, height] of [["desktop", 1280, 800], ["tablet", 1024, 768], ["mobile", 390, 844]] as const) {
    const dir = join(run, phase, name)
    mkdirSync(dir, { recursive: true })
    const recording = await browser.newContext({ storageState, viewport: { width, height }, baseURL: process.env.MANUAL_SETTLEMENT_WEB_URL!, recordVideo: { dir, size: { width, height } } })
    const view = await recording.newPage()
    await view.goto(`/externals/${party.item.id}`)
    await expect(view.getByRole("heading", { name: "جهة التسوية اليدوية 613", exact: true })).toBeVisible()
    const ledger = view.getByRole("main", { name: "سجل الديون الدقيق", exact: true })
    await expect(ledger.getByRole("navigation", { name: "حسابات الديون" }).getByRole("button")).toHaveCount(2)
    await ledger.getByRole("navigation", { name: "حسابات الديون" }).getByRole("button", { name: /مستحقات علينا/ }).click()
    await expect(ledger.getByRole("table")).toBeVisible()
    if (phase === "after") {
      const panel = view.getByRole("region", { name: "تسوية متبادلة بين دينين يدويين", exact: true })
      await expect(panel.getByRole("combobox", { name: "الدين المستحق علينا", exact: true })).toBeVisible()
      const pOptions = await panel.getByRole("combobox", { name: "الدين المستحق علينا", exact: true }).locator("option").evaluateAll(elements => elements.map(element => (element as HTMLOptionElement).value).filter(Boolean))
      const rOptions = await panel.getByRole("combobox", { name: "الدين المستحق لنا", exact: true }).locator("option").evaluateAll(elements => elements.map(element => (element as HTMLOptionElement).value).filter(Boolean))
      expect(pOptions).toHaveLength(1); expect(rOptions).toHaveLength(1)
      expect(pOptions).not.toContain(produced.id)
      await panel.getByRole("combobox", { name: "الدين المستحق علينا", exact: true }).selectOption(pOptions[0])
      await panel.getByRole("combobox", { name: "الدين المستحق لنا", exact: true }).selectOption(rOptions[0])
      await panel.getByRole("textbox", { name: "مبلغ التسوية المتبادلة", exact: true }).fill("25")
      await panel.getByRole("button", { name: "معاينة التسوية المتبادلة", exact: true }).focus()
      await view.keyboard.press("Enter")
      const preview = panel.getByRole("region", { name: "معاينة التسوية المتبادلة", exact: true })
      await expect(preview).toContainText("75")
      await expect(preview).toContainText("35")
      await preview.screenshot({ path: join(dir, "preview-element.png"), animations: "disabled" })
      const seen: unknown[] = []
      await view.route("**/rpc/financial/manualSettlement/confirm", async route => {
        seen.push(route.request().postDataJSON())
        const response = await route.fetch()
        if (seen.length === 1) await route.abort("failed")
        else await route.fulfill({ response })
      })
      await panel.getByRole("button", { name: "تأكيد التسوية المتبادلة", exact: true }).click()
      await expect(panel.getByRole("button", { name: "إعادة الطلب نفسه", exact: true })).toBeVisible()
      await view.reload()
      const resumed = view.getByRole("region", { name: "تسوية متبادلة بين دينين يدويين", exact: true })
      await expect(resumed.getByRole("button", { name: "إعادة الطلب نفسه", exact: true })).toBeVisible()
      const owner = fixture<{id:string}>(run, "deny")
      await resumed.getByRole("button", { name: "إعادة الطلب نفسه", exact: true }).click()
      await expect.poll(() => seen.length).toBe(2)
      await expect(resumed.getByRole("button", { name: "إعادة الطلب نفسه", exact: true })).toBeEnabled()
      expect(await view.evaluate(() => Object.values(sessionStorage).some(raw => raw.includes('"requestId"')))).toBe(true)
      fixture(run, "restore", owner.id)
      await view.reload()
      await resumed.getByRole("button", { name: "إعادة الطلب نفسه", exact: true }).click()
      await expect(resumed.getByRole("button", { name: "إعادة الطلب نفسه", exact: true })).toHaveCount(0)
      expect(seen).toHaveLength(3); expect(seen[1]).toEqual(seen[0]); expect(seen[2]).toEqual(seen[0])
      await expect(ledger.getByRole("navigation", { name: "حسابات الديون" }).getByRole("button", { name: /مستحقات علينا/ })).toContainText("76")
      await expect(ledger.getByRole("navigation", { name: "حسابات الديون" }).getByRole("button", { name: /مستحقات لنا/ })).toContainText("35")
      await resumed.getByRole("button", { name: "عكس التسوية كاملة", exact: true }).click()
      await resumed.getByRole("textbox", { name: "سبب العكس", exact: true }).fill("إلغاء التسوية التجريبية")
      await resumed.getByRole("button", { name: "تأكيد العكس الكامل", exact: true }).click()
      await expect(resumed.getByText("معكوسة بالكامل", { exact: true })).toHaveCount(captures.length + 1)
      await expect(ledger.getByRole("navigation", { name: "حسابات الديون" }).getByRole("button", { name: /مستحقات علينا/ })).toContainText("101")
      await expect(ledger.getByRole("navigation", { name: "حسابات الديون" }).getByRole("button", { name: /مستحقات لنا/ })).toContainText("60")
      const operations = await rpc<{items: {id:string; reversal:{id:string}}[]}>(view, "financial/manualSettlement/history", { externalCounterpartyId: party.item.id })
      const latest = operations.items.find(item => item.reversal)!
      for (const direction of [/مستحقات علينا/, /مستحقات لنا/]) {
        await ledger.getByRole("navigation", { name: "حسابات الديون" }).getByRole("button", { name: direction }).click()
        await ledger.getByRole("tab", { name: "التسوية وسجلها", exact: true }).click()
        const history = ledger.getByRole("tabpanel", { name: "التسوية وسجلها", exact: true })
        await expect(history.locator(`[data-manual-settlement-id="${latest.id}"]`)).toContainText("معكوسة بالكامل")
        await expect(history.locator(`[data-manual-reversal-id="${latest.reversal.id}"]`)).toContainText("إلغاء التسوية التجريبية")
        await history.screenshot({ path: join(dir, direction.source.includes("علينا") ? "payable-history.png" : "receivable-history.png") })
      }
      if (name === "mobile") {
        await view.getByRole("banner").getByRole("button", { name: "توسيع الشريط الجانبي", exact: true }).click()
        await expect(view.locator('.tauri-shell')).toHaveAttribute('data-sidebar-open', 'true')
        await view.screenshot({ path: join(dir, "mobile-drawer.png"), animations: "disabled" })
        await view.locator(".sb-mobile-backdrop").click({ position: { x: 5, y: 400 } })
      }
      // Expand only the screenshot capture surface, not the functional run.
      // Native viewport width is retained; inner scrolling and sticky occlusion
      // are removed for a complete element/composition image.
      await view.addStyleTag({ content: '[data-capture-root], [data-capture-host] { height:auto!important; max-height:none!important; overflow:visible!important; } [data-capture-sticky] { position:static!important; }' })
      await view.evaluate(() => {
        document.querySelectorAll("*").forEach(node => {
          const el = node as HTMLElement
          const css = getComputedStyle(el)
          if (css.position === "sticky") el.setAttribute("data-capture-sticky", "")
          if (el.scrollHeight > el.clientHeight && ["auto","scroll","hidden"].includes(css.overflowY)) { el.setAttribute("data-capture-host", ""); el.scrollTop = 0 }
          if (css.height === window.innerHeight + "px") el.setAttribute("data-capture-root", "")
        })
        window.scrollTo(0,0)
      })
      const bounds = await resumed.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      writeFileSync(join(dir, "capture-geometry.json"), JSON.stringify({ viewport: { width, height }, bounds, normalization: "expanded internal scroll hosts; static sticky elements; native width" },null,2))
      await resumed.screenshot({ path: join(dir, "manual-settlement-element.png"), animations: "disabled" })
      await ledger.getByRole("navigation", { name: "حسابات الديون" }).getByRole("button", { name: /مستحقات علينا/ }).click()
    }
    await view.evaluate(() => document.fonts.ready)
    await ledger.screenshot({ path: join(dir, "ledger-element.png"), animations: "disabled" })
    await view.screenshot({ path: join(dir, "full-page-sidebar.png"), fullPage: true, animations: "disabled" })
    await ledger.getByRole("tab", { name: "التسوية وسجلها", exact: true }).focus()
    await view.keyboard.press("Enter")
    await expect(ledger.getByRole("tabpanel", { name: "التسوية وسجلها", exact: true })).toBeVisible()
    const video = view.video()!
    await recording.close()
    await video.saveAs(join(dir, "route-clip.webm"))
    captures.push({ name, width, height, directory: dir })
  }
  writeFileSync(join(run, `${phase}-manifest.json`), JSON.stringify({ phase, sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), captures, note: "Committed actual native route. Functional flow at the named viewport. Element/composition captures expand inner scroll hosts and make sticky elements static at the same native width; functional assertions precede this capture-only normalization. Owner signoff pending." }, null, 2))
})
