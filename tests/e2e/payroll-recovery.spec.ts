import { installManagedApiLifecycle } from "./helpers/test"
import { expect, test } from "./helpers/test"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

installManagedApiLifecycle()

// Real routes, sessions, localStorage and Web Locks; payroll responses are
// explicit fixtures. This is not normal-root financial persistence proof.
test("payroll fixture UI retains an uncertain advance across native tabs and reload", async ({ page, context }) => {
  test.setTimeout(90_000)
  await bootstrapOrSignIn(page)
  const suffix = uniqueSuffix()
  const name = `سلفة ${suffix}`
  await page.getByRole("link", { name: "العاملون", exact: true }).first().click()
  await page.getByRole("link", { name: "إضافة عامل", exact: true }).first().click()
  const row = page.getByRole("article").first()
  await row.getByLabel("الاسم الأول").fill("سلفة")
  await row.getByLabel("اللقب").fill(suffix)
  await row.getByLabel("رقم الهاتف").fill(`055${Date.now().toString().slice(-7)}`)
  await row.getByLabel("صلاحية التطبيق").selectOption({ label: "مدير مشروع" })
  await page.getByRole("button", { name: "حفظ العامل", exact: true }).click()
  await expect(page.getByRole("heading", { name: "مراجعة الرصيد السابق، خطوة اختيارية", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "إنهاء ومتابعة المراجعة لاحقاً", exact: true }).click()
  await page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: /^عرض$/ }).click()
  const employeeId = new URL(page.url()).pathname.split("/").filter(Boolean).at(-1)!
  const fixture = {
    employeeId, currency: "DZD", earnings: [], advances: [], cash: [], repayments: [], offsets: [],
    opening: { review: "UNREVIEWED", reminder: true, wages: null, advances: null },
    summary: { approvedEarnings: "0.00", wageCashPaid: "0.00", wagesOffset: "0.00", wagesOwed: "0.00", advancesGiven: "0.00", advancesCashRecovered: "0.00", advancesOffset: "0.00", advancesOwed: "0.00", unallocatedEarnings: "0.00", currentAppTotalsExcludeUnknownOpening: true },
  }
  await context.route("**/rpc/employeePayrollGet**", route => route.fulfill({ json: { json: fixture } }))
  const requests: unknown[] = []
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await context.route("**/rpc/employeePayrollCashRecord", async route => {
    requests.push(route.request().postDataJSON())
    if (requests.length === 1) {
      await held
      await route.abort("failed")
    } else {
      await route.fulfill({ json: { json: { id: "fixture-confirmation" } } })
    }
  })
  await page.getByRole("tab", { name: "المالية", exact: true }).click()
  const panel = page.getByRole("region", { name: "حساب الأجور والسلف", exact: true })
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute("dir", "rtl")
  await expect(panel.getByRole("group", { name: "عمليات حساب الأجور" })).toBeVisible()
  await panel.screenshot({ path: test.info().outputPath("payroll-before.png") })
  const second = await context.newPage()
  await second.goto(page.url())
  const secondPanel = second.getByRole("region", { name: "حساب الأجور والسلف", exact: true })
  if (!(await secondPanel.isVisible())) await second.getByRole("tab", { name: "المالية", exact: true }).click()
  await expect(secondPanel).toBeVisible()
  for (const view of [panel, secondPanel]) {
    await view.getByRole("textbox", { name: "سلفة نقدية إضافية، اختيارية", exact: true }).fill("5000")
  }
  // Bypass Playwright's click wait so a storage event cannot turn the second
  // simultaneous submit into an unrelated timeout on a disabled button.
  await Promise.all([panel, secondPanel].map(view => view.locator("form").filter({ has: view.page().getByRole("textbox", { name: "سلفة نقدية إضافية، اختيارية", exact: true }) }).evaluate(form => (form as HTMLFormElement).requestSubmit())))
  await expect.poll(() => requests.length).toBe(1)
  const first = requests[0] as { json: { amount: string; wages: unknown[]; advanceAmount: string } }
  expect(first.json).toMatchObject({ amount: "5000.00", wages: [], advanceAmount: "5000.00" })
  const activeLocks = await page.evaluate(async () => (await navigator.locks.query()).held ?? [])
  expect(activeLocks.some(lock => lock.name?.startsWith("employee-payroll-lock:v1:"))).toBe(true)
  release()
  for (const view of [panel, secondPanel]) {
    await expect(view.getByRole("button", { name: "إعادة العملية نفسها", exact: true })).toBeEnabled()
  }
  expect(requests).toHaveLength(1)
  page.on("dialog", dialog => dialog.accept())
  await page.reload()
  const retry = panel.getByRole("button", { name: "إعادة العملية نفسها", exact: true })
  await expect(retry).toBeEnabled()
  await panel.screenshot({ path: test.info().outputPath("payroll-pending.png") })
  await retry.focus()
  await page.keyboard.press("Enter")
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1]).toEqual(requests[0])
  await expect(panel.getByRole("button", { name: "تسجيل الدفع", exact: true })).toBeEnabled()
  await expect(secondPanel.getByRole("button", { name: "تسجيل الدفع", exact: true })).toBeEnabled()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(panel).toBeVisible()
  await panel.locator("form").filter({ has: page.getByRole("textbox", { name: "سلفة نقدية إضافية، اختيارية", exact: true }) }).screenshot({ path: test.info().outputPath("payroll-mobile-form.png") })
  await panel.getByRole("group", { name: "عمليات حساب الأجور" }).screenshot({ path: test.info().outputPath("payroll-mobile-actions.png") })
  const layout = await panel.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return { width: element.clientWidth, scroll: element.scrollWidth, overflow: [...element.querySelectorAll("*")].filter(child => {
      const rect = child.getBoundingClientRect()
      return rect.left < bounds.left - 1 || rect.right > bounds.right + 1
    }).map(child => ({ tag: child.tagName, classes: child.className, text: child.textContent?.slice(0, 70) })) }
  })
  expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width)
  await second.close()
})
