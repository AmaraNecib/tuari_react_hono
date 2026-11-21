import { createRequire } from "node:module"
import { resolve } from "node:path"
import { writeFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import type { AppClient } from "../../packages/contracts/src"
import { bootstrapOrSignIn } from "./helpers/session"

test.skip(process.env.CONNECTED_EXACT_TEST !== "1", "Requires the dedicated selected-exact config and fresh native database")

type Procedure = "employeePayrollOpeningGet" | "employeesCreate" | "projectsCreate" | "employeeEarningsApprove" | "employeePayrollGet" | "employeePayrollCashRecord" | "employeePayrollAdvanceOffset" | "employeePayrollAdvanceRepay" | "systemLogList"
async function rpc<K extends Procedure>(page: Page, path: K, input: Parameters<AppClient[K]>[0]): Promise<Awaited<ReturnType<AppClient[K]>>> {
  return page.evaluate(async ({ api, path, input }) => {
    const response = await fetch(`${api}/rpc/${path}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: input }) })
    const body = await response.json()
    if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(body)}`)
    return body.json
  }, { api: process.env.PLAYWRIGHT_API_URL!, path, input })
}

// No financial fixtures or legacy SQL seed/reset. The only interception forwards
// the real cash request, waits for its committed response, then drops delivery.
test("selected exact payroll persists UI cash, offset and repayment across reload and replay", async ({ page, context }) => {
  await bootstrapOrSignIn(page)
  const metadata = await page.evaluate(async api => {
    const response = await fetch(`${api}/rpc/financial/metadata`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: '{"json":null}' })
    if (!response.ok) throw new Error(`metadata ${response.status}`)
    return (await response.json()).json
  }, process.env.PLAYWRIGHT_API_URL!)
  const role = metadata.roles.find((role: { key: string }) => role.key === "worker")
  expect(role).toBeTruthy()
  const employee = await rpc(page, "employeesCreate", { firstName: "Connected", lastName: "Payroll", phone: "0555123987", roleId: role.id })
  if (!employee.success) throw new Error(JSON.stringify(employee))
  const employeeId = employee.item.id
  const project = await rpc(page, "projectsCreate", { name: "Connected payroll project", status: "ACTIVE" })
  if (!project.success) throw new Error(JSON.stringify(project))
  const earning = await rpc(page, "employeeEarningsApprove", { requestId: crypto.randomUUID(), employeeId, currencyCode: "DZD", periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z", totalAmount: "35000.00", unallocatedAmount: "0.00", segments: [{ id: crypto.randomUUID(), projectId: project.item.id, days: 30, amount: "35000.00" }] })
  if (!earning.success) throw new Error(JSON.stringify(earning))
  await page.goto(`/employees/${employeeId}?tab=financial`)
  await page.getByRole("tab", { name: "المالية", exact: true }).click()
  const panel = page.getByRole("region", { name: "حساب الأجور والسلف", exact: true })
  await expect(panel).toBeVisible()
  await expect(panel.getByText("توجد أرصدة افتتاحية غير مراجعة.", { exact: false })).toBeVisible()
  const owner = await page.evaluate(async api => (await (await fetch(`${api}/api/auth/get-session`, { credentials: "include" })).json()).user, process.env.PLAYWRIGHT_API_URL!)
  expect(owner.id).toBeTruthy()
  const requests: unknown[] = []
  const receipts: unknown[] = []
  await context.route("**/rpc/employeePayrollCashRecord", async route => {
    requests.push(route.request().postDataJSON())
    const response = await route.fetch()
    expect(response.ok()).toBe(true)
    receipts.push(await response.json())
    if (requests.length === 1) await route.abort("failed")
    else await route.fulfill({ response })
  })
  await panel.getByRole("textbox", { name: "المبلغ المدفوع من الأجر", exact: true }).fill("25000")
  await panel.getByRole("textbox", { name: "سلفة نقدية إضافية، اختيارية", exact: true }).fill("5000")
  await panel.getByRole("button", { name: "تسجيل الدفع", exact: true }).click()
  await expect(panel.getByRole("button", { name: "إعادة العملية نفسها", exact: true })).toBeEnabled()
  const committed = await rpc(page, "employeePayrollGet", { employeeId })
  expect(committed.summary).toMatchObject({ wageCashPaid: "25000.00", advancesGiven: "5000.00" })
  expect(committed.cash).toHaveLength(1)
  page.on("dialog", dialog => dialog.accept())
  await page.reload()
  await expect(panel.getByRole("button", { name: "إعادة العملية نفسها", exact: true })).toBeEnabled()
  await panel.getByRole("button", { name: "إعادة العملية نفسها", exact: true }).click()
  await expect(panel.getByRole("button", { name: "تسجيل الدفع", exact: true })).toBeEnabled()
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  expect(receipts[1]).toEqual(receipts[0])
  expect(receipts[0]).toMatchObject({ json: { amount: "30000.00", actorUserId: owner.id } })
  expect(requests[0]).toMatchObject({ json: { wages: [{ earningId: earning.item.id, amount: "25000.00" }], advanceAmount: "5000.00" } })
  const offsetResponse = page.waitForResponse(response => response.url().endsWith("/rpc/employeePayrollAdvanceOffset") && response.request().method() === "POST")
  await panel.getByRole("button", { name: "تسوية سلفة", exact: true }).click()
  await panel.getByRole("textbox", { name: "مبلغ التسوية من الأجر", exact: true }).fill("2000")
  await panel.getByRole("button", { name: "تسجيل التسوية", exact: true }).click()
  const offset = await offsetResponse
  expect(offset.ok()).toBe(true)
  const offsetInput = offset.request().postDataJSON().json
  const offsetReceipt = (await offset.json()).json
  await expect(panel.getByRole("button", { name: "سداد سلفة", exact: true })).toBeEnabled()
  const repayResponse = page.waitForResponse(response => response.url().endsWith("/rpc/employeePayrollAdvanceRepay") && response.request().method() === "POST")
  await panel.getByRole("button", { name: "سداد سلفة", exact: true }).click()
  await panel.getByRole("textbox", { name: "مبلغ السداد النقدي", exact: true }).fill("1000")
  await panel.getByRole("button", { name: "تسجيل السداد", exact: true }).click()
  const repayment = await repayResponse
  expect(repayment.ok()).toBe(true)
  const repayInput = repayment.request().postDataJSON().json
  const repayReceipt = (await repayment.json()).json
  await expect(panel.getByRole("button", { name: "تسجيل السداد", exact: true })).toBeEnabled()
  await page.reload()
  expect(await rpc(page, "employeePayrollAdvanceOffset", offsetInput)).toEqual(offsetReceipt)
  expect(await rpc(page, "employeePayrollAdvanceRepay", repayInput)).toEqual(repayReceipt)
  const final = await rpc(page, "employeePayrollGet", { employeeId })
  expect(final.summary).toMatchObject({ approvedEarnings: "35000.00", wageCashPaid: "25000.00", wagesOffset: "2000.00", wagesOwed: "8000.00", advancesGiven: "5000.00", advancesCashRecovered: "1000.00", advancesOffset: "2000.00", advancesOwed: "2000.00", currentAppTotalsExcludeUnknownOpening: true })
  expect(final.opening).toMatchObject({ reminder: true, wages: null, advances: null })
  expect(final.cash).toHaveLength(1)
  expect(final.offsets).toHaveLength(1)
  expect(final.repayments).toHaveLength(1)
  for (const [label, value] of [["الأجر المتبقي", "8,000"], ["السلف المتبقية", "2,000"]]) {
    const total = panel.locator("dl > div").filter({ has: page.locator("dt", { hasText: label }) })
    await expect(total.locator("dd")).toContainText(value)
  }
  await panel.locator("summary").click()
  await expect(panel.locator("ol > li")).toHaveCount(3)
  await panel.screenshot({ path: test.info().outputPath("payroll-connected.png") })
  const require = createRequire(resolve("apps/api/package.json"))
  const Database = require("better-sqlite3")
  const db = new Database(process.env.APP_DB_PATH!, { readonly: true })
  let persisted
  try {
    persisted = {
      database: process.env.APP_DB_PATH,
      cash: db.prepare("SELECT amount_minor FROM employee_salary_cash").all(),
      offsets: db.prepare("SELECT amount_minor FROM employee_salary_advance_offset").all(),
      repayments: db.prepare("SELECT amount_minor FROM employee_salary_settlement").all(),
      labor: db.prepare("SELECT amount_minor FROM employee_earning_segment WHERE project_id=?").all(project.item.id),
    }
    expect(persisted.cash).toEqual([{ amount_minor: 3000000 }])
    expect(persisted.offsets).toEqual([{ amount_minor: 200000 }])
    expect(persisted.repayments).toEqual([{ amount_minor: 100000 }])
    expect(persisted.labor).toEqual([{ amount_minor: 3500000 }])
  } finally { db.close() }
  const log = await rpc(page, "systemLogList", {})
  expect(log.items.some(item => item.transactionId === offsetReceipt.transactionId)).toBe(true)
  writeFileSync(test.info().outputPath("receipts.json"), JSON.stringify({ ownerId: owner.id, employeeId, projectId: project.item.id, requests, receipts, offsetInput, offsetReceipt, repayInput, repayReceipt, final, persisted, log }, null, 2))
})

test("opening review is optional at creation and corrections retain confirmed history through response loss", async ({ page, context }) => {
  await bootstrapOrSignIn(page)
  await page.goto("/employees/create")
  await page.getByLabel("الاسم الأول", { exact: true }).fill("Opening")
  await page.getByLabel("اللقب", { exact: true }).fill("Browser")
  await page.getByLabel("رقم الهاتف", { exact: true }).fill("0555123990")
  await page.getByLabel("صلاحية التطبيق").selectOption({ label: "مدير مشروع" })
  await page.getByLabel("دورية الأجر").selectOption({ label: "شهري" })
  await page.getByLabel(/قيمة الأجر/).fill("30000")
  const createdResponse = page.waitForResponse(response => response.url().endsWith("/rpc/employeesBatchCreate") && response.request().method() === "POST")
  await page.getByRole("button", { name: "حفظ العامل", exact: true }).click()
  const created = (await (await createdResponse).json()).json
  expect(created.success).toBe(true)
  const employeeId = created.item.employees[0].id
  await expect(page.getByRole("heading", { name: "مراجعة الرصيد السابق، خطوة اختيارية", exact: true })).toBeVisible()
  expect((await rpc(page, "employeePayrollOpeningGet", { employeeId })).review).toBe("UNREVIEWED")
  await page.getByRole("button", { name: "إنهاء ومتابعة المراجعة لاحقاً", exact: true }).click()
  await page.goto(`/employees/${employeeId}?tab=financial`)
  await page.getByRole("tab", { name: "المالية", exact: true }).click()
  const payroll = page.getByRole("region", { name: "حساب الأجور والسلف", exact: true })
  const opening = payroll.getByRole("region", { name: "الرصيد السابق للموظف", exact: true })
  await expect(opening).toBeVisible()
  await opening.getByRole("textbox", { name: "أجور سابقة مستحقة للموظف", exact: true }).fill("2000")
  await opening.getByRole("textbox", { name: "سلف سابقة مستحقة للشركة", exact: true }).fill("300")
  await opening.getByRole("button", { name: "مراجعة الرصيد السابق", exact: true }).click()
  await opening.getByRole("button", { name: "تأكيد حفظ الرصيد السابق", exact: true }).click()
  await expect(opening.getByRole("textbox", { name: "المبلغ المصحح", exact: true })).toBeVisible()
  await opening.screenshot({ path: test.info().outputPath("opening-before-correction.png") })
  const requests: unknown[] = []
  await context.route("**/rpc/employeePayrollOpeningCorrect", async route => {
    requests.push(route.request().postDataJSON())
    const response = await route.fetch()
    expect(response.ok()).toBe(true)
    if (requests.length === 1) await route.abort("failed")
    else await route.fulfill({ response })
  })
  await opening.getByRole("textbox", { name: "المبلغ المصحح", exact: true }).fill("1900")
  await opening.getByRole("textbox", { name: "سبب التصحيح", exact: true }).fill("راجعت المستند الأصلي")
  await opening.getByRole("button", { name: "مراجعة التصحيح", exact: true }).click()
  expect(requests).toHaveLength(0)
  await expect(opening.getByText("2000.00", { exact: true })).toBeVisible()
  await expect(opening.getByText("1900.00", { exact: true })).toBeVisible()
  await opening.getByRole("button", { name: "تأكيد حفظ التصحيح", exact: true }).click()
  await expect(opening.getByRole("button", { name: "إعادة إرسال الطلب نفسه", exact: true })).toBeEnabled()
  await page.reload()
  await opening.getByRole("button", { name: "إعادة إرسال الطلب نفسه", exact: true }).click()
  await expect(opening.getByRole("textbox", { name: "المبلغ المصحح", exact: true })).toBeEnabled()
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  await opening.getByRole("textbox", { name: "المبلغ المصحح", exact: true }).fill("200")
  await opening.getByRole("textbox", { name: "سبب التصحيح", exact: true }).fill("تأكدت من القيمة النهائية")
  await opening.getByRole("button", { name: "مراجعة التصحيح", exact: true }).click()
  await opening.getByRole("button", { name: "تأكيد حفظ التصحيح", exact: true }).click()
  await expect(opening.getByRole("listitem")).toHaveCount(2)
  const saved = await rpc(page, "employeePayrollOpeningGet", { employeeId })
  expect(saved).toMatchObject({ wages: "200.00", advances: "300.00", reviewAudit: { wages: "2000.00", advances: "300.00" } })
  expect(saved.history.map(event => [event.oldAmount, event.newAmount])).toEqual([["2000.00", "1900.00"], ["1900.00", "200.00"]])
  expect(saved.history.every(event => Boolean(event.actorUserId && event.createdAt && event.reason))).toBe(true)
  await page.reload()
  await expect(opening.getByRole("listitem")).toHaveCount(2)
  await opening.screenshot({ path: test.info().outputPath("opening-after-correction.png") })
  await payroll.getByRole("combobox", { name: "الأجر المعتمد", exact: true }).selectOption(`opening:${saved.sources.find(source => source.kind === "WAGE")!.sourceId}`)
  await payroll.getByRole("textbox", { name: "المبلغ المدفوع من الأجر", exact: true }).fill("100")
  await payroll.getByRole("button", { name: "تسجيل الدفع", exact: true }).click()
  await expect(payroll.getByRole("button", { name: "تسجيل الدفع", exact: true })).toBeEnabled()
  expect((await rpc(page, "employeePayrollGet", { employeeId })).summary).toMatchObject({ wagesOwed: "100.00", advancesOwed: "300.00" })
  await opening.getByRole("textbox", { name: "المبلغ المصحح", exact: true }).fill("50")
  await opening.getByRole("textbox", { name: "سبب التصحيح", exact: true }).fill("المستند النهائي أقل من النقد المدفوع")
  await opening.getByRole("button", { name: "مراجعة التصحيح", exact: true }).click()
  await opening.getByRole("button", { name: "تأكيد حفظ التصحيح", exact: true }).click()
  await expect(opening.getByText("حُفظ التصحيح المطلوب دون تطبيقه.", { exact: false })).toBeVisible()
  const proposed = await rpc(page, "employeePayrollOpeningGet", { employeeId })
  expect(proposed.wages).toBe("200.00")
  expect(proposed.proposals[0]).toMatchObject({ newAmount: "50.00", requiredRefund: "50.00", status: "PENDING" })
  await expect(opening.getByRole("button", { name: "مراجعة رد النقد وتطبيق التصحيح", exact: true })).toBeDisabled()
  await opening.getByRole("checkbox", { name: "أؤكد أن النقد الموضح قد رُد فعلياً", exact: true }).check()
  await opening.getByRole("button", { name: "مراجعة رد النقد وتطبيق التصحيح", exact: true }).click()
  const refundRequests: unknown[] = []
  await context.route("**/rpc/employeePayrollOpeningReconcile", async route => {
    refundRequests.push(route.request().postDataJSON())
    const response = await route.fetch()
    expect(response.ok()).toBe(true)
    if (refundRequests.length === 1) await route.abort("failed")
    else await route.fulfill({ response })
  })
  await opening.getByRole("button", { name: "تأكيد رد النقد وتطبيق التصحيح", exact: true }).click()
  await expect(opening.getByRole("button", { name: "إعادة إرسال الطلب نفسه", exact: true })).toBeEnabled()
  await page.reload()
  await opening.getByRole("button", { name: "إعادة إرسال الطلب نفسه", exact: true }).click()
  await expect(opening.getByText("طُبق التصحيح بعد رد النقد", { exact: false })).toBeVisible()
  expect(refundRequests).toHaveLength(2)
  expect(refundRequests[1]).toEqual(refundRequests[0])
  await page.reload()
  const reconciled = await rpc(page, "employeePayrollOpeningGet", { employeeId })
  expect(reconciled.wages).toBe("50.00")
  expect(reconciled.refunds).toMatchObject([{ amount: "50.00", direction: "IN" }])
  expect(reconciled.proposals[0]?.status).toBe("APPLIED")
  expect((await rpc(page, "employeePayrollGet", { employeeId })).summary).toMatchObject({ wagesOwed: "0.00", advancesOwed: "300.00" })
  await opening.screenshot({ path: test.info().outputPath("opening-after-reconciliation.png") })
  writeFileSync(test.info().outputPath("opening-receipts.json"), JSON.stringify({ employeeId, saved, requests, proposed, reconciled, refundRequests }, null, 2))
})
