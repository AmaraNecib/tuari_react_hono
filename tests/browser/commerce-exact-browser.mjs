import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const root = process.cwd();
const webRequire = createRequire(resolve(root, "apps/web/package.json"));
const apiRequire = createRequire(resolve(root, "apps/api/package.json"));
const { createServer } = await import(pathToFileURL(webRequire.resolve("vite")));
const { chromium, expect } = createRequire(resolve(root, "package.json"))("@playwright/test");
const { createRouterClient } = apiRequire("@orpc/server");
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirtyBefore = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
const out = resolve(root, process.argv[2] ?? `.scratch/reviews/525/browser-${head.slice(0, 8)}`);
await mkdir(out, { recursive: false });
const start = Date.now();
const previousLicense = process.env.TUARI_LICENSE_STATUS;
const previousRequire = globalThis.require;
process.env.TUARI_LICENSE_STATUS = "trial";
globalThis.require = apiRequire;
const errors = [], commands = [];
const allowed = {
  invoices: new Set(["getInvoice", "listInvoices", "createInvoice", "updateInvoice", "receiveInvoice", "voidInvoice", "deleteDraft", "getPayment", "listPayments", "createPayment", "allocatePayment", "voidPayment", "deleteUnallocatedPayment", "splitPayment"]),
  inventory: new Set(["definitions", "getInvoice", "listInvoices", "createInvoice", "recordPayment", "locationContents", "transferAsset", "transferConsumable", "createOutbound", "listOutbounds", "getOutbound", "chargeDefault", "projectCharges", "projectContribution", "updateCharge", "voidCharge"]),
};
let clients;
async function bridge(req, res) {
  res.setHeader("content-type", "application/json");
  try {
    if (req.method !== "POST") throw new Error("Fixture bridge requires POST");
    const origin = req.headers.origin;
    if (origin && origin !== "http://127.0.0.1:15435") throw new Error("Cross-origin fixture request refused");
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 200000) throw new Error("Fixture request too large"); }
    const { domain, action, input } = JSON.parse(body);
    if (!Object.hasOwn(allowed, domain) || !allowed[domain].has(action)) throw new Error("Unknown fixture action");
    const result = await clients[domain][action](input);
    commands.push({ domain, action, input });
    res.end(JSON.stringify(result));
  } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ message: error.message })); }
}
const server = await createServer({ root, configFile: resolve(root, "apps/web/vite.config.ts"), plugins: [{ name: "exact-commerce-isolated-fixture", configureServer(vite) { vite.middlewares.use("/__exact-commerce-fixture", bridge); } }], resolve: { alias: [
  { find: "@tanstack/react-query", replacement: resolve(root, "apps/web/node_modules/@tanstack/react-query") },
  { find: /^react-dom(.*)$/, replacement: resolve(root, "apps/web/node_modules/react-dom") + "$1" },
  { find: /^react(.*)$/, replacement: resolve(root, "apps/web/node_modules/react") + "$1" },
] }, server: { host: "127.0.0.1", port: 15435, strictPort: true }, optimizeDeps: { entries: [resolve(root, "tests/browser/commerce-exact-fixture.html")] } });
let browser, db, page, context;
try {
  const load = path => server.ssrLoadModule(`/apps/api/src/${path}.ts`);
  const { createDatabaseConnection } = await load("infrastructure/database/factory");
  const { createFifoLock } = await load("infrastructure/database/fifo-lock");
  const { exactDebtSchemaStatements } = await load("modules/company/adapters/exact-finance-schema");
  const { exactInvoiceSchemaStatements } = await load("modules/invoice/adapters/exact-invoice-schema");
  const { exactInventorySchemaStatements } = await load("modules/inventory/adapters/exact-inventory-schema");
  const { createExactCommerceComposition } = await load("rpc/exact-commerce-composition");
  const { createRpcMiddleware } = await load("rpc/rpc-middleware");
  db = createDatabaseConnection(resolve(out, "fixture.sqlite"), "525-526-browser-public-synthetic-key");
  db.pragma("foreign_keys=ON");
  db.exec("CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE warehouse(id TEXT PRIMARY KEY,name TEXT NOT NULL); CREATE TABLE project(id TEXT PRIMARY KEY,name TEXT NOT NULL); INSERT INTO external_counterparty VALUES ('party'); INSERT INTO warehouse VALUES ('warehouse','Synthetic warehouse'); INSERT INTO project VALUES ('project','Synthetic project')");
  for (const sql of [...exactInvoiceSchemaStatements, ...exactDebtSchemaStatements, ...exactInventorySchemaStatements]) db.exec(sql);
  const date = "2026-11-10T10:00:00.000Z";
  for (const [id, name, type, unit] of [["material", "المادة التجريبية", "CONSUMABLE", "m"], ["asset", "المضخة التجريبية", "ASSET", null]]) db.prepare("INSERT INTO inventory_item_definition(id,name,item_type,unit,is_active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)").run(id, name, type, unit, date, date);
  const composition = createExactCommerceComposition(db, createFifoLock(), createRpcMiddleware({ authBootstrapService: { isBootstrapOwner: async id => id === "fixture-owner" } }), { id: randomUUID, now: () => date });
  const rpcContext = { headers: new Headers(), resolveCurrentUser: async () => ({ id: "fixture-owner", name: "Fixture owner", phone: "0612345678", version: "0.0.0", permissions: [] }) };
  clients = { invoices: createRouterClient(composition.router.invoices, { context: rpcContext }), inventory: createRouterClient(composition.router.inventory, { context: rpcContext }) };
  const invoice = await clients.invoices.createInvoice({ requestId: "seed-invoice", supplierName: "المورد التجريبي", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: "party", invoiceNumber: "EXACT-001", lineItems: [{ description: "Exact large cents", source: { mode: "agreed-total", total: "90071992547409.93", quantity: "1" } }] });
  await clients.invoices.receiveInvoice({ requestId: "seed-receive", id: invoice.id });
  const stock = await clients.inventory.createInvoice({ requestId: "seed-stock", warehouseId: "warehouse", entries: [
    { kind: "CONSUMABLE", itemDefinitionId: "material", quantity: 300, priceSource: { mode: "agreed-total", total: "10000.00", quantity: "300" } },
    { kind: "ASSET", itemDefinitionId: "asset", assets: [{ assetName: "المضخة التجريبية", purchasePriceDzd: "71.29" }] },
  ] });
  await server.listen();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  context = await browser.newContext({ viewport: { width: 1120, height: 900 }, recordVideo: { dir: resolve(out, "video"), size: { width: 1120, height: 900 } } });
  page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const url = "http://127.0.0.1:15435/tests/browser/commerce-exact-fixture.html";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  const invoiceTable = page.getByRole("region", { name: "جدول الفواتير", exact: true });
  await expect(invoiceTable).toContainText("90,071,992,547,409.93");
  await page.waitForLoadState("networkidle");
  const warmupErrors = errors.splice(0);
  if (warmupErrors.some(message => !message.includes("504 (Outdated Optimize Dep)"))) throw new Error(warmupErrors.join("\n"));
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await invoiceTable.screenshot({ path: resolve(out, "invoice-before.png"), animations: "disabled" });
  await page.getByRole("button", { name: "تسجيل دفعة", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "مبلغ الدفعة", exact: true }).fill("٠٫٣٠");
  await dialog.getByRole("textbox", { name: "توزيع EXACT-001", exact: true }).fill("٠٫٣٠");
  await dialog.screenshot({ path: resolve(out, "payment-localized.png"), animations: "disabled" });
  await dialog.getByRole("button", { name: "حفظ الدفعة والتوزيع", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(invoiceTable).toContainText("90,071,992,547,409.63");
  expect(composition.services.invoices.getInvoice(invoice.id).remainingAmount).toBe("90071992547409.63");
  await invoiceTable.screenshot({ path: resolve(out, "invoice-after.png"), animations: "disabled" });
  await page.getByRole("button", { name: "المخزون والمشتريات", exact: true }).click();
  await page.getByRole("button", { name: `تفاصيل ${stock.group.invoiceNumber}`, exact: true }).click();
  await expect(page.getByText("10,000", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "فاتورة مخزون جديدة", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "العنصر", exact: true }).selectOption("material");
  await dialog.getByRole("textbox", { name: "كمية المخزون", exact: true }).fill("0.25");
  await dialog.getByRole("textbox", { name: "سعر الوحدة", exact: true }).fill("١٫٥٠٠٠");
  await expect(dialog.getByText("0.38", { exact: true })).toBeVisible();
  await dialog.screenshot({ path: resolve(out, "purchase-price4.png"), animations: "disabled" });
  await dialog.getByRole("button", { name: "حفظ الفاتورة والمخزون", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(composition.services.inventory.listInvoiceGroups()).toHaveLength(2);
  await page.getByRole("button", { name: "تحويل مخزون أو بيع", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "المخزون المختار", exact: true }).selectOption(stock.entries.find(row => row.itemType === "ASSET").assets[0].id);
  await dialog.getByRole("combobox", { name: "الوجهة", exact: true }).selectOption("PROJECT:project");
  await expect(dialog.getByText("71.29", { exact: true })).toBeVisible();
  await dialog.getByRole("checkbox", { name: "تحديد احتساب مختلف على المشروع", exact: true }).check();
  await dialog.getByRole("textbox", { name: "احتساب المشروع، صفر يعني مجانًا", exact: true }).fill("٠");
  await dialog.screenshot({ path: resolve(out, "free-placement.png"), animations: "disabled" });
  await dialog.getByRole("button", { name: "تأكيد التحويل", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(composition.services.inventory.getProjectContribution("project").totalDzd).toBe("0.00");
  await page.getByRole("button", { name: "تصحيح الاحتساب", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "المبلغ المصحح", exact: true }).fill("٠٫٣٠");
  await dialog.getByRole("textbox", { name: "السبب", exact: true }).fill("تصحيح تجريبي موثق");
  await dialog.getByRole("button", { name: "تأكيد الحفظ", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(composition.services.inventory.getProjectContribution("project")).toMatchObject({ equipmentChargesDzd: "0.30", totalDzd: "0.30", parkedAssetValueDzd: "71.29" });
  const chargeSection = page.getByRole("heading", { name: "احتسابات العتاد على المشروع", exact: true }).locator("..").locator("..");
  await chargeSection.screenshot({ path: resolve(out, "charge-history.png"), animations: "disabled" });
  for (const width of [390, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    if (await page.evaluate(() => document.body.scrollWidth > innerWidth)) throw new Error(`Document overflow at ${width}`);
    await page.getByRole("button", { name: "تصحيح الاحتساب", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "المبلغ المصحح", exact: true }).fill("0.001");
    await dialog.getByRole("textbox", { name: "المبلغ المصحح", exact: true }).blur();
    await expect(dialog.getByRole("button", { name: "تأكيد الحفظ", exact: true })).toBeDisabled();
    await dialog.screenshot({ path: resolve(out, `charge-validation-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const dirtyAfter = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  if (dirtyBefore !== dirtyAfter) throw new Error("Source changed while browser proof was running");
  await writeFile(resolve(out, "result.json"), JSON.stringify({ head, dirtyBefore, durationMs: Date.now() - start, exit: 0, commands, errors, warmupErrors, browser: await browser.version(), boundary: "Actual React workspace navigation and forms through a synthetic JSON bridge to validated combined oRPC composition and keyed native SQLite. No production route activation or owner approval implied." }, null, 2));
  console.log(out);
} catch (error) {
  if (page) { await page.screenshot({ path: resolve(out, "failure.png") }); await writeFile(resolve(out, "failure-dom.html"), await page.content()); }
  await writeFile(resolve(out, "failure.json"), JSON.stringify({ head, error: String(error), errors, durationMs: Date.now() - start }, null, 2));
  throw error;
} finally {
  await context?.close();
  await browser?.close();
  await server.close();
  db?.close();
  globalThis.require = previousRequire;
  if (previousLicense === undefined) delete process.env.TUARI_LICENSE_STATUS; else process.env.TUARI_LICENSE_STATUS = previousLicense;
}
