import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { mkdir, writeFile, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { chromium, expect } from "@playwright/test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const web = path.join(root, "apps/web")
const require = createRequire(path.join(web, "package.json"))
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href)
const baseline = process.argv.includes("--baseline")
const pickerOnly = process.argv.includes("--picker-only")
const base = "b2d37386aa3aa7bca1d98a4f7171f7a459859201"
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
const initialStatus = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })
if (!baseline) assert.equal(initialStatus, "", "Commit complete source before final browser proof")
const outputArg = process.argv.indexOf("--out")
assert(outputArg !== -1, "Provide a fresh --out directory; existing results are never overwritten")
const output = path.resolve(root, process.argv[outputArg + 1])
await mkdir(output, { recursive: false })
const started = Date.now()
const records = []
const errors = []
const fixturePath = path.join(root, "tests/browser/date-format-fixture.tsx").replaceAll("\\", "/")
const srcPrefix = path.join(web, "src").replaceAll("\\", "/") + "/"
const baseFiles = new Set(execFileSync("git", ["ls-tree", "-r", "--name-only", base, "apps/web/src"], { cwd: root, encoding: "utf8" }).trim().split("\n"))
const sourceCache = new Map()
const queryFixture = `
const item = { id: "synthetic-expense", amount: 1234, expenseDate: "2026-11-10T12:00:00Z", whatFor: "مصروف تجريبي", responsibleWorkerId: null, sellerId: null, projectId: null, stockItemId: null, note: null, status: "LIVE", voidedAt: null, voidedBy: null, voidReason: null, actorUserId: "synthetic", actorLabel: "تجريبي", transactionId: null, createdAt: "2026-11-10T12:00:00Z", updatedAt: "2026-11-10T12:00:00Z" };
const mutation = () => ({ isPending: false, mutateAsync: async () => ({ id: item.id }) });
export const useExpensesListQuery = () => ({ isPending: false, isError: false, refetch: async () => undefined, data: { items: [item], totals: { total: 1234, count: 1, taggedToProject: 0, notTaggedToProject: 1234, heldByWorkers: 0, workerCount: 0 }, groupsByProject: [{ projectId: null, total: 1234, count: 1 }] } });
export const useCreateExpenseMutation = mutation; export const useUpdateExpenseMutation = mutation; export const useVoidExpenseMutation = mutation;
`
const server = await createServer({
  configFile: path.join(web, "vite.config.ts"), root: web,
  cacheDir: path.join(output, "vite-cache"),
  server: { host: "127.0.0.1", port: 0, strictPort: false, fs: { allow: [root] } },
  plugins: [{
    name: "synthetic-date-component-proof", enforce: "pre",
    resolveId(source, importer) {
      if (source === "./expenses-queries" && importer?.includes("/features/expenses/")) return "\0synthetic-expense-query"
      if (source === "@/features/inventory/inventory-hooks") return "\0synthetic-inventory-query"
    },
    async load(id) {
      if (id === "\0synthetic-expense-query") return queryFixture
      if (id === "\0synthetic-inventory-query") return "export const useItemDefinitionOptionsQuery = () => ({ options: [], hasNextPage: false, isFetchingNextPage: false }); export const useInventoryItemDefinitionQuery = () => ({ data: undefined });"
      const normalized = id.split("?")[0].replaceAll("\\", "/")
      if (baseline && normalized === fixturePath) {
        const fixture = await readFile(fixturePath, "utf8")
        return fixture.replace(/^import .*DateFormatSetting.*\n/m, "").replace(/^import .*AppDate.*\n/m, "").replace(/^import .*formatDateRange.*\n/m, "").replace(/^.*<section data-testid="(?:setting|prose|range)".*\n/gm, "")
      }
      if (baseline && normalized.startsWith(srcPrefix)) {
        const relative = "apps/web/src/" + normalized.slice(srcPrefix.length)
        if (baseFiles.has(relative) && /\.(tsx?|css)$/.test(relative)) {
          if (!sourceCache.has(relative)) sourceCache.set(relative, execFileSync("git", ["show", `${base}:${relative}`], { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }))
          return sourceCache.get(relative)
        }
      }
    },
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        if (request.url !== "/") return next()
        response.setHeader("Content-Type", "text/html")
        response.end(await vite.transformIndexHtml("/", `<!doctype html><html lang="ar-DZ" dir="rtl"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic date proof</title><div id="root"></div><script type="module" src="/@vite/client"></script><script type="module" src="/@fs/${fixturePath}"></script></html>`))
      })
    },
  }],
})
let browser
try {
  await server.listen()
  const address = server.httpServer.address()
  const url = `http://127.0.0.1:${address.port}/`
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ar-DZ", timezoneId: "America/Los_Angeles", deviceScaleFactor: 1, recordVideo: baseline ? undefined : { dir: path.join(output, "video"), size: { width: 1280, height: 900 } } })
  const page = await context.newPage()
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(url)
  const expense = page.getByTestId("expenses")
  await expect(expense.getByText("مصروف تجريبي")).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const dateCell = expense.getByRole("row").filter({ hasText: "مصروف تجريبي" }).getByRole("cell").nth(0)
  const geometry = async (locator) => locator.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const tokens = []
    while (walker.nextNode()) {
      const node = walker.currentNode
      for (const match of node.textContent.matchAll(/\d+/g)) {
        const range = document.createRange()
        range.setStart(node, match.index)
        range.setEnd(node, match.index + match[0].length)
        const rect = range.getBoundingClientRect()
        tokens.push({ value: match[0], x: rect.x, y: rect.y, width: rect.width })
      }
    }
    return { logical: element.textContent, tokens, physical: [...tokens].sort((a, b) => a.x - b.x).map((token) => token.value) }
  })
  if (baseline) {
    const probe = await geometry(dateCell)
    records.push({ surface: "expense-before", ...probe })
    assert.match(probe.logical, /10\u200f\/11\u200f\/2026/)
    assert.deepEqual(probe.physical, ["2026", "11", "10"], "The baseline must reproduce the reported physical reversal")
    await dateCell.screenshot({ path: path.join(output, "expense-before.png") })
    await page.getByTestId("audit").getByRole("row").last().screenshot({ path: path.join(output, "audit-before.png") })
    console.log("Expected-red baseline reproduced: logical day/month/year, physical year/month/day")
  } else if (pickerOnly) {
    const select = page.getByRole("combobox", { name: "تنسيق التاريخ", exact: true })
    const picker = page.getByTestId("empty-picker").getByRole("button")
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 900 })
      for (const direction of ["rtl", "ltr"]) {
        await page.getByRole("combobox", { name: "اتجاه الاختبار" }).selectOption(direction)
        for (const order of ["YYYY/MM/DD", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY/DD/MM"]) {
          await select.selectOption(order)
          await expect(picker).toHaveText(order.toLowerCase())
          await expect(picker.locator('bdi[dir="ltr"]')).toHaveText(order.toLowerCase())
          await expect(page.locator('input[name="syntheticDay"]')).toHaveValue("")
          records.push({ width, direction, order, emptyCue: await picker.textContent() })
        }
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole("combobox", { name: "اتجاه الاختبار" }).selectOption("rtl")
    await select.selectOption("DD/MM/YYYY")
    await page.getByTestId("setting").screenshot({ path: path.join(output, "settings-after.png") })
    await dateCell.screenshot({ path: path.join(output, "expense-after.png") })
    await page.getByTestId("audit").getByRole("row").last().screenshot({ path: path.join(output, "audit-after.png") })
    await page.getByTestId("empty-picker").screenshot({ path: path.join(output, "empty-picker-after.png") })
    await page.setViewportSize({ width: 320, height: 844 })
    const settingBox = await page.getByTestId("setting").boundingBox()
    const selectBox = await select.boundingBox()
    assert(selectBox.width <= settingBox.width && selectBox.x >= 0 && selectBox.x + selectBox.width <= 320)
    await page.getByTestId("setting").screenshot({ path: path.join(output, "settings-mobile.png") })
    assert.deepEqual(errors, [])
    console.log(`Passed ${records.length} empty-picker order/direction/viewport cases; unchanged core geometry conclusions carry from prior exact-head run`)
  } else {
    const select = page.getByRole("combobox", { name: "تنسيق التاريخ", exact: true })
    await expect(select).toHaveValue("DD/MM/YYYY")
    await select.focus()
    await expect(select).toBeFocused()
    await select.press("ArrowDown")
    await select.press("Enter")
    await expect(select).toHaveValue("MM/DD/YYYY")
    const formats = [
      ["DD/MM/YYYY", "23/04/2026", "10/11/2026"], ["MM/DD/YYYY", "04/23/2026", "11/10/2026"],
      ["YYYY/MM/DD", "2026/04/23", "2026/11/10"], ["YYYY/DD/MM", "2026/23/04", "2026/10/11"],
    ]
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const direction of ["rtl", "ltr"]) {
        await page.getByRole("combobox", { name: "اتجاه الاختبار" }).selectOption(direction)
        for (const [order, expectedProse, expectedExpense] of formats) {
          await select.selectOption(order)
          const prose = page.getByTestId("prose").locator("bdi")
          await expect(prose).toHaveText(expectedProse)
          const probe = await geometry(prose)
          assert.deepEqual(probe.physical, expectedProse.split("/"))
          assert(!/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(probe.logical), "Numeric run must copy without control marks")
          const actualExpense = await geometry(dateCell)
          assert.deepEqual(actualExpense.physical, expectedExpense.split("/"))
          await expect(dateCell.locator("bdi")).toHaveText(expectedExpense)
          const audit = page.getByTestId("audit").getByRole("row").last()
          await expect(audit).toContainText("1:04 م")
          await expect(audit.locator("bdi").first()).toHaveText(expectedExpense)
          const rangeDates = page.getByTestId("range").locator("bdi")
          await expect(rangeDates.first()).toHaveText(expectedProse)
          records.push({ width, direction, order, prose: probe, expense: actualExpense })
        }
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole("combobox", { name: "اتجاه الاختبار" }).selectOption("rtl")
    await select.selectOption("DD/MM/YYYY")
    await page.getByTestId("setting").screenshot({ path: path.join(output, "settings-after.png") })
    await dateCell.screenshot({ path: path.join(output, "expense-after.png") })
    await page.getByTestId("audit").getByRole("row").last().screenshot({ path: path.join(output, "audit-after.png") })
    await expense.getByRole("button", { name: /تجميع حسب المشروع/ }).click()
    await expect(expense.getByText("مصروف تجريبي")).toBeVisible()
    await expect(expense.locator("bdi").filter({ hasText: "10/11/2026" })).toHaveCount(1)
    await select.selectOption("YYYY/DD/MM")
    await expect(expense.locator("bdi").filter({ hasText: "2026/10/11" })).toHaveCount(1)
    const second = await context.newPage()
    await second.goto(url)
    await expect(second.getByRole("combobox", { name: "تنسيق التاريخ", exact: true })).toHaveValue("YYYY/DD/MM")
    await second.getByRole("combobox", { name: "تنسيق التاريخ", exact: true }).selectOption("MM/DD/YYYY")
    await expect(select).toHaveValue("MM/DD/YYYY")
    await expect(expense.locator("bdi").filter({ hasText: "11/10/2026" })).toHaveCount(1)
    await second.close()
    await page.reload()
    await expect(select).toHaveValue("MM/DD/YYYY")
    await page.setViewportSize({ width: 390, height: 844 })
    const settingBox = await page.getByTestId("setting").boundingBox()
    const selectBox = await select.boundingBox()
    assert(selectBox.width <= settingBox.width && selectBox.x >= 0 && selectBox.x + selectBox.width <= 390)
    await page.getByTestId("setting").screenshot({ path: path.join(output, "settings-mobile.png") })
    assert.deepEqual(errors, [])
    console.log(`Passed ${records.length} physical-order combinations, keyboard, grouped dates, persistence and cross-tab refresh`)
  }
  await context.close()
} finally {
  if (browser) await browser.close()
  await server.close()
  const finalStatus = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })
  assert.equal(finalStatus, initialStatus, "Source changed while browser proof was running")
  await writeFile(path.join(output, "manifest.json"), JSON.stringify({ base, head, baseline, pickerOnly, source: baseline ? "Tracked baseline source loaded verbatim with git show; new setting fixture is not baseline evidence" : "Clean committed source, unchanged during execution", synthetic: true, timezone: "America/Los_Angeles", started, durationMs: Date.now() - started, records, errors }, null, 2), { flag: "wx" })
}
