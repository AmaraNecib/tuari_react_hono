import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const root = process.cwd();
const require = createRequire(resolve(root, "apps/web/package.json"));
// Vite SSR evaluates this CommonJS-compatible factory in an ESM fixture.
// Resolve its native optional require from the real API package, as Vitest does.
const previousLicenseStatus = process.env.TUARI_LICENSE_STATUS;
// Synthetic desktop license context, scoped to this disposable fixture process.
process.env.TUARI_LICENSE_STATUS = "trial";
const previousRequire = globalThis.require;
globalThis.require = createRequire(resolve(root, "apps/api/package.json"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")));
const { chromium, expect } = createRequire(resolve(root, "package.json"))("@playwright/test");
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const out = resolve(root, process.argv[2] ?? `.scratch/reviews/524/browser-${head.slice(0,8)}`);
await mkdir(out, { recursive: false });
const errors = [], commands = [];
let fixtureClient;
async function fixtureBridge(req, res) {
  try {
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 20000) throw new Error("Fixture request too large"); }
    const { action, input } = JSON.parse(body);
    if (!["summary", "detail", "create", "post", "pay", "correct", "void", "settle"].includes(action)) throw new Error("Unknown fixture action");
    const result = await fixtureClient[action](input);
    commands.push({ action, input });
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify(result));
  } catch (error) { res.statusCode = 400; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ message: error.message })); }
}
const start = Date.now();
const port = 15434;
const server = await createServer({ root, configFile: resolve(root, "apps/web/vite.config.ts"), plugins: [{ name: "exact-debt-fixture-bridge", configureServer(vite) { vite.middlewares.use("/__exact-debt-fixture", fixtureBridge); } }], resolve: { alias: [
  { find: "@tanstack/react-query", replacement: resolve(root, "apps/web/node_modules/@tanstack/react-query") },
  { find: /^react-dom(.*)$/, replacement: resolve(root, "apps/web/node_modules/react-dom") + "$1" },
  { find: /^react(.*)$/, replacement: resolve(root, "apps/web/node_modules/react") + "$1" },
] }, server: { host: "127.0.0.1", port, strictPort: true }, optimizeDeps: { entries: [resolve(root,"tests/browser/debts-exact-fixture.html")] } });
let browser, db, page;
try {
  const { createDatabaseConnection } = await server.ssrLoadModule("/apps/api/src/infrastructure/database/factory.ts");
  const { createFifoLock } = await server.ssrLoadModule("/apps/api/src/infrastructure/database/fifo-lock.ts");
  const { exactDebtSchemaStatements } = await server.ssrLoadModule("/apps/api/src/modules/company/adapters/exact-finance-schema.ts");
  const { SqliteExactFinanceRepository } = await server.ssrLoadModule("/apps/api/src/modules/company/adapters/sqlite-exact-finance.repository.ts");
  const { ExactFinanceService } = await server.ssrLoadModule("/apps/api/src/modules/company/exact-finance.service.ts");
  const { createExactDebtsRouter } = await server.ssrLoadModule("/apps/api/src/rpc/debts-exact-router.ts");
  const { createRpcMiddleware } = await server.ssrLoadModule("/apps/api/src/rpc/rpc-middleware.ts");
  const { createRouterClient } = createRequire(resolve(root,"apps/api/package.json"))("@orpc/server");
  const { randomUUID } = await import("node:crypto");
  const key = "524-browser-synthetic-public-key";
  db = createDatabaseConnection(resolve(out, "fixture.sqlite"), key);
  db.pragma("foreign_keys=ON");
  const party = "00000000-0000-4000-8000-000000000999", worker = "00000000-0000-4000-8000-000000000998";
  db.exec(`CREATE TABLE employee(id TEXT PRIMARY KEY); CREATE TABLE external_counterparty(id TEXT PRIMARY KEY); CREATE TABLE invoice(id TEXT PRIMARY KEY); INSERT INTO external_counterparty VALUES ('${party}'); INSERT INTO employee VALUES ('${worker}')`);
  for (const sql of exactDebtSchemaStatements) db.exec(sql);
  const service = new ExactFinanceService(new SqliteExactFinanceRepository(db, createFifoLock()), { id: randomUUID, now: () => "2026-11-10T10:00:00.000Z" });
  const client = createRouterClient(createExactDebtsRouter(service, createRpcMiddleware({ authBootstrapService: { isBootstrapOwner: async id => id === "fixture-owner" } })), { context: { headers: new Headers(), resolveCurrentUser: async () => ({ id: "fixture-owner", name: "Fixture owner", phone: "0612345678", version: "0.0.0", permissions: [] }) } });
  const account = await client.create({ requestId:"seed-payable", partyType:"EXTERNAL_COUNTERPARTY", externalCounterpartyId:party, direction:"PAYABLE", openingBalanceDzd:"90071992547409.93" });
  await client.create({ requestId:"seed-receivable", partyType:"EXTERNAL_COUNTERPARTY", externalCounterpartyId:party, direction:"RECEIVABLE", openingBalanceDzd:"100.20" });
  process.env.TUARI_LICENSE_STATUS = "unknown";
  await expect(client.create({ requestId: "license-must-refuse", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party, direction: "PAYABLE" })).rejects.toMatchObject({ code: "UPGRADE_REQUIRED" });
  process.env.TUARI_LICENSE_STATUS = "trial";
  fixtureClient = client;
  await server.listen();
  browser = await chromium.launch({channel:"msedge",headless:true});
  function observe(p) { p.on("pageerror",e=>errors.push(e.message));p.on("console",m=>{if(m.type()==="error")errors.push(m.text())}); }
  page=await browser.newPage({viewport:{width:1120,height:900}});observe(page);
  const url=`http://127.0.0.1:${port}/tests/browser/debts-exact-fixture.html`;
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
  const accountButton=page.getByRole("button",{name:/المورد أحمد · مستحقات علينا/});
  await expect(accountButton).toBeVisible();
  await page.waitForLoadState("networkidle");
  const warmupErrors = errors.splice(0);
  if (warmupErrors.some(message => !message.includes("504 (Outdated Optimize Dep)"))) throw new Error(warmupErrors.join("\n"));
  // Cold Vite optimization can invalidate its own module URLs. Preserve those
  // diagnostics separately, then start interaction proof on a fresh stable load.
  await page.reload({ waitUntil: "networkidle" });
  await accountButton.click();
  const ledger=page.getByRole("region",{name:"جدول حركات الدين"});await expect(ledger).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  await page.locator("main").screenshot({path:resolve(out,"desktop-initial.png"),animations:"disabled"});
  await page.locator("main > div.border-y > div").nth(0).screenshot({path:resolve(out,"gross-payable.png"),animations:"disabled"});
  await page.locator("main > div.border-y > div").nth(1).screenshot({path:resolve(out,"gross-receivable.png"),animations:"disabled"});
  await expect(ledger).toContainText("90,071,992,547,409.93");
  await ledger.getByRole("button",{name:"تسجيل دفعة"}).click();
  let dialog=page.getByRole("dialog");
  await dialog.getByRole("textbox",{name:"مبلغ الدفعة"}).fill("٠٫١٠");
  await dialog.screenshot({path:resolve(out,"payment-localized.png"),animations:"disabled"});
  await dialog.getByRole("button",{name:"تأكيد الحفظ"}).click();await expect(dialog).toBeHidden();
  expect(service.getAccount(account.id).currentBalance).toBe("90071992547409.83");
  await ledger.getByRole("button",{name:"تصحيح المبلغ"}).click();dialog=page.getByRole("dialog");
  await dialog.getByRole("textbox",{name:"المبلغ المتفق عليه بعد التصحيح"}).fill("90071992547409.92");
  await dialog.getByRole("textbox",{name:"السبب، مطلوب"}).fill("تصحيح الاتفاق بفارق سنتيم");
  await dialog.getByRole("button",{name:"تأكيد الحفظ"}).click();await expect(dialog).toBeHidden();
  expect(service.getAccount(account.id).currentBalance).toBe("90071992547409.82");
  await page.getByRole("button",{name:"إضافة حركة",exact:true}).click();dialog=page.getByRole("dialog");
  await dialog.getByRole("textbox",{name:"مبلغ الحركة، موجب أو سالب"}).fill("20.00");
  await dialog.getByRole("textbox",{name:"السبب، مطلوب"}).fill("التزام مستقل");
  await dialog.getByRole("button",{name:"تأكيد الحفظ"}).click();await expect(dialog).toBeHidden();
  const other=service.listEntries(account.id).find(row=>row.note==="التزام مستقل");
  await page.locator(`[data-entry-id="${other.id}"]`).getByRole("button",{name:"تسجيل دفعة"}).click();dialog=page.getByRole("dialog");
  await dialog.getByRole("textbox",{name:"مبلغ الدفعة"}).fill("4.00");
  await dialog.getByRole("button",{name:"تأكيد الحفظ"}).click();await expect(dialog).toBeHidden();
  const original=service.listEntries(account.id)[0];
  await page.locator(`[data-entry-id="${original.id}"]`).getByRole("button",{name:"إلغاء الحركة"}).click();dialog=page.getByRole("dialog");
  await dialog.getByRole("textbox",{name:"السبب، مطلوب"}).fill("إلغاء الالتزام الأصلي وآثاره فقط");
  await dialog.screenshot({path:resolve(out,"void-confirmation.png"),animations:"disabled"});
  await dialog.getByRole("button",{name:"تأكيد الحفظ"}).click();await expect(dialog).toBeHidden();
  expect(service.getAccount(account.id).currentBalance).toBe("16.00");
  expect(service.remaining(other.id)).toBe("16.00");
  await ledger.screenshot({path:resolve(out,"attributed-void-ledger.png"),animations:"disabled"});
  await page.getByRole("button",{name:"تسوية الحساب بالكامل",exact:true}).click();dialog=page.getByRole("dialog");
  await dialog.getByRole("button",{name:"تأكيد الحفظ"}).click();await expect(dialog).toBeHidden();
  expect(service.getAccount(account.id).currentBalance).toBe("0.00");
  await page.getByRole("combobox",{name:"الطرف",exact:true}).selectOption(worker);
  await page.getByRole("combobox",{name:"اتجاه الحساب"}).selectOption("RECEIVABLE");
  await page.getByRole("textbox",{name:"الرصيد الافتتاحي، اختياري"}).fill("٠٫٣٠");
  await page.getByRole("textbox",{name:"سبب الدين",exact:true}).fill("سلفة عامل مع رصيد افتتاحي موثق");
  await page.getByRole("button",{name:"حفظ الحساب",exact:true}).click();
  const workerButton=page.getByRole("button",{name:/العامل يوسف · مستحقات لنا/});await expect(workerButton).toBeVisible();await workerButton.click();
  await expect(ledger).toContainText("0.3");
  await ledger.getByRole("button",{name:"تسجيل دفعة"}).click();dialog=page.getByRole("dialog");
  const field=dialog.getByRole("textbox",{name:"مبلغ الدفعة"});await field.fill("0.001");await field.blur();
  await expect(dialog.getByRole("alert")).toBeVisible();await expect(dialog.getByRole("button",{name:"تأكيد الحفظ"})).toBeDisabled();
  await dialog.screenshot({path:resolve(out,"precision-error.png"),animations:"disabled"});
  await field.fill("0.31");await expect(dialog.getByRole("button",{name:"تأكيد الحفظ"})).toBeDisabled();
  await dialog.getByRole("button",{name:"كامل المبلغ"}).click();await expect(field).toHaveValue("0.30");
  await page.keyboard.press("Escape");await expect(dialog).toBeHidden();
  await page.evaluate(()=>window.fixtureMoneyGrouping(false));
  if(await page.evaluate(()=>document.body.scrollWidth>innerWidth))throw new Error("Desktop document overflow");
  for(const width of [390,1000]) {
    const context=await browser.newContext({viewport:{width,height:900},hasTouch:true,isMobile:true});
    const touch=await context.newPage();observe(touch);await touch.goto(url);
    await touch.getByRole("button",{name:/العامل يوسف · مستحقات لنا/}).click();
    const table=touch.getByRole("region",{name:"جدول حركات الدين"});await expect(table).toBeVisible();
    if(await touch.evaluate(()=>document.body.scrollWidth>innerWidth))throw new Error(`Touch${width} document overflow`);
    await touch.locator("main").screenshot({path:resolve(out,`touch-${width}.png`),animations:"disabled"});
    await table.getByRole("button",{name:"تسجيل دفعة"}).click();const modal=touch.getByRole("dialog");
    await expect(modal.getByText("المتبقي:")).toBeVisible();
    await modal.getByRole("button",{name:"كامل المبلغ"}).tap();
    await expect(modal.getByRole("textbox",{name:"مبلغ الدفعة"})).toHaveValue("0.30");
    const inputGeometry=await modal.getByRole("textbox",{name:"مبلغ الدفعة"}).evaluate(e=>({align:getComputedStyle(e).textAlign,dir:getComputedStyle(e).direction,unitLeft:e.previousElementSibling.getBoundingClientRect().right<e.getBoundingClientRect().left}));
    expect(inputGeometry).toEqual({align:"right",dir:"ltr",unitLeft:true});
    await modal.screenshot({path:resolve(out,`touch-payment-${width}.png`),animations:"disabled"});
    await context.close();
  }
  if(errors.length)throw new Error(errors.join("\n"));
  await writeFile(resolve(out,"result.json"),JSON.stringify({head,exit:0,durationMs:Date.now()-start,browser:await browser.version(),errors,warmupErrors,commands,final:await client.summary(),boundary:"Synthetic keyed native database; actual React/hooks -> JSON bridge -> validated oRPC admin/audit middleware -> exact service/repository. Not production activation. No database, trace or logs published."},null,2));
  console.log(out);
} catch(error) {
  if(page){await page.screenshot({path:resolve(out,"failure.png")});await writeFile(resolve(out,"failure-dom.html"),await page.content());}
  await writeFile(resolve(out,"failure.json"),JSON.stringify({head,error:String(error),errors,durationMs:Date.now()-start},null,2));throw error;
} finally { await browser?.close();await server.close();db?.close();globalThis.require=previousRequire;if(previousLicenseStatus===undefined)delete process.env.TUARI_LICENSE_STATUS;else process.env.TUARI_LICENSE_STATUS=previousLicenseStatus; }
