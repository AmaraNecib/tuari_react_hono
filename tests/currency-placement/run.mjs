// Bounded actual-component browser proof. Run through heavy_run, never the full E2E suite.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"
import fs from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { chromium } from "@playwright/test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
process.chdir(root)
const webRequire = createRequire(path.join(root, "apps/web/package.json"))
const baseline = "7a56b245740d6d2ef836181cd150011657be0303"
const sources = process.env.CURRENCY_BASELINE_ONLY === "1" ? ["before"] : process.env.CURRENCY_AFTER_ONLY === "1" ? ["after"] : ["before", "after"]
const baselineParent = path.join(root, ".scratch/reviews/535/baselines")
let baselineRoot
if (sources.includes("before")) {
  await fs.mkdir(baselineParent, { recursive: true })
  baselineRoot = await fs.mkdtemp(path.join(baselineParent, `${baseline}-`))
  const archive = execFileSync("git", ["archive", baseline, "apps/web/src"], { cwd: root, maxBuffer: 64 * 1024 * 1024 })
  execFileSync("tar", ["-xf", "-", "-C", baselineRoot], { cwd: root, input: archive })
}
const dependencyLocations = [path.join(root, "tests/currency-placement/node_modules")]
if (baselineRoot) dependencyLocations.push(path.join(baselineRoot, "apps/web/node_modules"))
for (const location of dependencyLocations) {
  await fs.mkdir(path.dirname(location), { recursive: true })
  try { await fs.lstat(location) } catch {
    await fs.symlink(path.join(root, "apps/web/node_modules"), location, "junction")
  }
}
const { createServer } = await import(pathToFileURL(webRequire.resolve("vite")))
const { default: tailwind } = await import(pathToFileURL(webRequire.resolve("@tailwindcss/vite")))
const output = path.resolve(process.env.CURRENCY_OUTPUT ?? ".scratch/reviews/535/browser-draft")
await fs.mkdir(path.dirname(output), { recursive: true })
await fs.mkdir(output, { recursive: false })
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
const surfaces = ["dashboard", "reports", "project", "ledger", "party", "external", "history", "invoice", "transfers", "audit"]
const expectedValues = {
  dashboard: ["1.500"], reports: ["1.234,567", "0", "-50,125"],
  project: ["8,500.25", "10,000.5", "0", "0", "-1,500.25", "10,000.5", "583.58", "−1,750.75", "125.25", "+250.5", "12,000", "12,000"],
  ledger: ["1,234.5", "1,234.5", "-12500.25", "1,234.5"], party: ["1,234.5"], external: ["1,234.5"],
  history: ["1234.5678", "0"], invoice: ["1234.50", "0.00", "1234.50", "1234.50"],
  transfers: ["1.234,567", "1.234,567", "10,125", "1.224,442"], audit: ["-12500.25", "0"],
}
const crops = {
  dashboard: 'main > div > div.grid > div:nth-child(6)',
  reports: 'main .grid.md\\:grid-cols-3 > div:first-child',
  project: 'main section:first-child', ledger: 'main .grid > section:first-child',
  party: 'main > section', external: 'main tbody tr:first-child td:nth-child(3)',
  history: 'main tbody tr:first-child td:nth-child(2)', invoice: 'main section:first-of-type .grid > div:nth-child(2)',
  transfers: 'main .rounded-xl.space-y-3 .border-t', audit: 'main tbody tr:first-child td:last-child',
}
const expectedCounts = { dashboard: 1, reports: 3, project: 12, ledger: 4, party: 1, external: 1, history: 2, invoice: 4, transfers: 4, audit: 2 }
const hookFiles = ["features/inventory/inventory-hooks.ts", "features/debts/debts-queries.ts", "features/app-shell/mock-dashboard.ts", "features/projects/project-cost-queries.ts", "features/inventory/transfer-history-hooks.ts", "hooks/use-report-queries.ts"]
const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim()
const sourceStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" })
const startedAt = new Date().toISOString()
const report = { head, tree, sourceStatus, startedAt, baseline, baselineRoot, fixture: "tests/currency-placement/fixture.tsx", records: [], errors: [] }
let browser
try {
  browser = await chromium.launch({ headless: true })
  for (const source of sources) {
    const sourceRoot = source === "before" ? path.join(baselineRoot, "apps/web/src") : path.join(root, "apps/web/src")
    const modules = new Map()
    for (const file of hookFiles) {
      const content = await fs.readFile(path.join(root, "apps/web/src", file), "utf8")
      const names = [...new Set(content.match(/\buse[A-Z]\w+/g))].filter(n => !["useState", "useMemo", "useEffect", "useCallback", "useQuery", "useMutation", "useQueryClient"].includes(n))
      modules.set(path.basename(file, ".ts"), names.map(name => `export const ${name} = () => window.__currencyData?.[${JSON.stringify(name)}] ?? { data: { items: [] }, isPending:false, isLoading:false, isError:false, isFetching:false, error:null, refetch(){}, mutate(){}, async mutateAsync(){} };`).join("\n") + (file.includes("use-report-queries") ? '\nexport const formatReportAsCSV = () => "synthetic";' : ""))
    }
    const server = await createServer({
      configFile: false, root: path.join(root, "apps/web"),
      optimizeDeps: { entries: [path.join(root, "tests/currency-placement/fixture.tsx")] },
      server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
      esbuild: { jsx: "automatic" }, resolve: { alias: { "@": sourceRoot }, dedupe: ["react", "react-dom"] },
      plugins: [{ name: "synthetic-query-boundaries", enforce: "pre", resolveId(id) {
        const name = path.basename(id).replace(/\.tsx?$/, "")
        if (modules.has(name)) return `\0currency:${name}`
        if (id === "@tanstack/react-router") return "\0currency:router"
        if (id === "@/router/navigation") return "\0currency:navigation"
      }, load(id) {
        if (id === "\0currency:router") return 'export const useNavigate=()=>()=>{}; export const Link=({children})=>children; export const useRouterState=()=>({location:{pathname:"/"}});'
        if (id === "\0currency:navigation") return 'export const navigateToWorkspaceRoute=()=>{}; export const workspaceRoutes=new Proxy({}, {get:()=>()=>"/"}); export const workspaceRouteHref=()=>"/";'
        if (id.startsWith("\0currency:")) return modules.get(id.slice(10))
      }, configureServer(server) {
        server.middlewares.use("/currency-fixture", async (_req, res) => {
          const html = await server.transformIndexHtml("/currency-fixture", '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/' + path.join(root, "tests/currency-placement/fixture.tsx").replaceAll("\\", "/") + '"></script></body></html>')
          res.setHeader("Content-Type", "text/html"); res.end(html)
        })
      } }, tailwind()],
    })
    try {
      await server.listen()
      const origin = server.resolvedUrls.local[0]
      for (const width of [1280, 390, 360]) {
        const page = await browser.newPage({ viewport: { width, height: 960 }, deviceScaleFactor: 1, reducedMotion: "reduce" })
        page.on("pageerror", e => report.errors.push({ source, width, message: e.message }))
        for (const direction of ["rtl", "ltr"]) for (const surface of surfaces) {
          await page.goto(`${origin}currency-fixture?surface=${surface}&dir=${direction}`)
          await page.locator(`[data-currency-surface="${surface}"]`).waitFor()
          await page.evaluate(() => document.fonts.ready)
          await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" })
          const main = page.locator("main")
          if (direction === "rtl") {
            await main.screenshot({ path: path.join(output, `${source}-${surface}-${width}-context.png`), animations: "disabled" })
            await page.locator(crops[surface]).first().screenshot({ path: path.join(output, `${source}-${surface}-${width}-crop.png`), animations: "disabled" })
          }
          const baselineGeometry = source === "before" ? await main.evaluate(root => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), result = []
            while (walker.nextNode()) {
              const node = walker.currentNode, text = node.textContent
              for (const m of text.matchAll(/([+−-]?[0-9]+(?:[.,][0-9]+)*) (د\\.ج|دج)/g)) {
                const range = document.createRange()
                range.setStart(node,m.index); range.setEnd(node,m.index+m[1].length); const number=range.getBoundingClientRect()
                range.setStart(node,m.index+m[1].length+1); range.setEnd(node,m.index+m[0].length); const label=range.getBoundingClientRect()
                result.push({text:m[1],labelRight:label.right,numberLeft:number.left})
              }
            }
            return result
          }) : []
          const geometry = await main.locator('bdi[dir="ltr"]').evaluateAll(elements => elements.filter(el => el.previousElementSibling?.getAttribute("dir") === "rtl").map(el => {
            const label = el.previousElementSibling.getBoundingClientRect(), number = el.getBoundingClientRect(), run = el.parentElement.getBoundingClientRect()
            const text = el.textContent
            let sign = null
            const signIndex = text.search(/[+−-]/), digitIndex = text.search(/[0-9٠-٩]/)
            if (signIndex >= 0 && digitIndex >= 0 && signIndex < digitIndex) {
              const range = document.createRange(); range.setStart(el.firstChild, signIndex); range.setEnd(el.firstChild, signIndex+1); const s = range.getBoundingClientRect()
              range.setStart(el.firstChild, digitIndex); range.setEnd(el.firstChild, digitIndex+1); const d = range.getBoundingClientRect()
              sign = { right: s.right, digitLeft: d.left }
            }
            let scrollContainer = el.parentElement
            while (scrollContainer.parentElement && !["auto", "scroll"].includes(getComputedStyle(scrollContainer).overflowX)) scrollContainer = scrollContainer.parentElement
            const scrollRect = scrollContainer.getBoundingClientRect()
            const overflow = scrollContainer === document.documentElement ? run.left < -0.5 || run.right > innerWidth+0.5 : run.width > scrollRect.width
            return { text, labelRight: label.right, numberLeft: number.left, sign, overflow, clipped: el.scrollWidth > el.clientWidth+1, runWidth:run.width, viewport: innerWidth }
          }))
          report.records.push({ source, surface, width, direction, geometry, baselineGeometry })
          if (source === "before" && surface === "project") assert.ok(baselineGeometry.some(run => run.labelRight > run.numberLeft+1), "baseline must expose wrong physical-right currency")
          if (source === "after") {
            if (surface === "project") {
              const rows = main.locator("section").first().locator("li").filter({ has: page.locator("bdi") })
              assert.equal(await rows.count(), 4)
              for (const row of await rows.all()) {
                assert.ok(await row.evaluate(el => el.scrollWidth <= el.clientWidth + 1), "project contribution row must fit real MainContent/card width")
              }
            }
            if (surface === "audit") {
              for (const run of await main.locator('bdi[dir="ltr"]').all()) {
                const spacing = await run.evaluate(el => {
                  const wrapper = el.parentElement.parentElement
                  const prefix = [...wrapper.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
                  const end = prefix.textContent.trimEnd().length
                  const range = document.createRange()
                  range.setStart(prefix, end - 1); range.setEnd(prefix, end)
                  const word = range.getBoundingClientRect(), amount = el.parentElement.getBoundingClientRect()
                  return { display: getComputedStyle(wrapper).display, sameLine: Math.min(word.bottom, amount.bottom) > Math.max(word.top, amount.top), gap: Math.max(word.left - amount.right, amount.left - word.right) }
                })
                assert.ok(!["flex", "inline-flex", "grid", "inline-grid"].includes(spacing.display), "audit prefix and currency must share normal text flow")
                assert.ok(!spacing.sameLine || spacing.gap >= 1, "audit prose must retain visible space before amount")
              }
            }
            assert.equal(geometry.length, expectedCounts[surface], `${surface}/${width}: currency callsite count`)
            assert.deepEqual(geometry.map(run => run.text.replace(/[\u061c\u200e\u200f]/g, "")), expectedValues[surface], `${surface}: preserve original formatter output`)
            for (const run of geometry) {
              assert.ok(run.labelRight <= run.numberLeft + 0.5, `${surface}: currency must be physically left of ${run.text}`)
              if (run.sign) assert.ok(run.sign.right <= run.sign.digitLeft + 0.5, `${surface}: sign precedes first digit`)
              assert.ok(!run.clipped && !run.overflow && run.runWidth <= width, `${surface}: numeric run must not clip/overflow viewport`)
            }
          }
        }
        await page.close()
      }
      for (const width of [1280, 390]) {
        const journey = await browser.newPage({ viewport: { width, height: 960 }, deviceScaleFactor: 1, reducedMotion: "reduce", recordVideo: { dir: path.join(output, "journey"), size: { width, height: 960 } } })
        try {
          await journey.goto(`${origin}currency-fixture?surface=invoice`)
          await journey.getByRole("button", { name: "تسجيل دفعة", exact: true }).click()
          const dialog = journey.getByRole("dialog")
          await dialog.waitFor()
          await dialog.screenshot({ path: path.join(output, `${source}-invoice-payment-${width}-crop.png`), animations: "disabled" })
          if (source === "after") {
            const run = dialog.locator('bdi[dir="ltr"]')
            assert.equal(await run.count(), 1, "invoice payment summary callsite")
            assert.equal(await run.textContent(), "1234.50", "invoice payment preserves fixed cents")
            const position = await run.evaluate(el => ({ labelRight: el.previousElementSibling.getBoundingClientRect().right, numberLeft: el.getBoundingClientRect().left }))
            assert.ok(position.labelRight <= position.numberLeft + 0.5, "payment dialog currency is physically left")
          }
          await dialog.getByRole("button", { name: "دفع المبلغ الكامل", exact: true }).click()
          assert.equal(await dialog.getByRole("textbox").first().inputValue(), "1234.5", "existing Pay Full input behavior")
        } finally {
          const video = journey.video()
          await journey.close()
          if (video) await video.saveAs(path.join(output, `${source}-invoice-payment-${width}.webm`))
        }
      }
    } finally { await server.close() }
  }
  assert.deepEqual(report.errors, [], "browser page errors")
} finally {
  if (browser) await browser.close()
  report.finishedAt = new Date().toISOString()
  report.elapsedSeconds = (Date.parse(report.finishedAt) - Date.parse(startedAt)) / 1000
  report.finalHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
  report.finalSourceStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" })
  assert.equal(report.finalHead, head, "source HEAD must stay frozen during browser execution")
  assert.equal(report.finalSourceStatus, sourceStatus, "source status must stay frozen during browser execution")
  await fs.writeFile(path.join(output, "geometry.json"), JSON.stringify(report, null, 2), { flag: "wx" })
}
console.log(`Currency browser proof: ${report.records.length} actual-component render cases, ${report.records.reduce((n,r)=>n+r.geometry.length,0)} measured runs. HEAD ${head}.`)
