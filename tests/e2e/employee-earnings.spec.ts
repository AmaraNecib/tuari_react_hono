import { installManagedApiLifecycle } from "./helpers/test"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

import { expect, test, type Locator, type Page } from "./helpers/test"

import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

installManagedApiLifecycle()

const evidenceDir = join(process.cwd(), ".scratch", "reviews", "543-browser")
const suffix = uniqueSuffix()
const employeeLastName = `إثبات ${"الاسم الطويل ".repeat(6)}${suffix}`
const employeeName = `عامل ${employeeLastName}`
const managerName = `مدير إثبات ${suffix}`
const projectA = `مشروع أ ${suffix}`
const projectB = `مشروع ب ${suffix}`

test.use({ timezoneId: "Africa/Algiers" })

async function selectOptionContaining(select: Locator, text: string) {
  const option = select.locator("option").filter({ hasText: text }).first()
  await expect(option).toBeAttached()
  const value = await option.getAttribute("value")
  if (!value) throw new Error(`Could not resolve option value for ${text}`)
  await select.selectOption(value)
}

async function openEmployeeCreate(page: Page) {
  await page.getByRole("link", { name: "العاملون" }).first().click()
  await expect(page.getByRole("heading", { name: "العاملون" })).toBeVisible()
  await page.getByRole("link", { name: "إضافة عامل" }).first().click()
  await expect(page.getByRole("heading", { name: /صفحة إضافة العاملين/ })).toBeVisible()
}

async function createEmployee(page: Page, input: {
  firstName: string
  lastName: string
  phone: string
  role: "مدير مشروع" | "عامل"
  salary?: string
  manager?: string
  project?: string
}) {
  await openEmployeeCreate(page)
  const row = page.getByRole("article").first()
  await row.getByLabel("الاسم الأول").fill(input.firstName)
  await row.getByLabel("اللقب").fill(input.lastName)
  await row.getByLabel("رقم الهاتف").fill(input.phone)
  await row.getByLabel("صلاحية التطبيق").selectOption({ label: input.role })
  if (input.salary) {
    await row.getByLabel("قيمة الأجر").fill(input.salary)
    await row.getByLabel("دورية الأجر").selectOption({ label: "شهري" })
  }
  if (input.manager && input.project) {
    await selectOptionContaining(row.getByLabel("المدير المباشر"), input.manager)
    await selectOptionContaining(row.getByLabel("المشروع"), input.project)
  }
  await page.getByRole("button", { name: "حفظ العامل", exact: true }).click()
  await expect(page.getByRole("heading", { name: "مراجعة الرصيد السابق، خطوة اختيارية", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "إنهاء ومتابعة المراجعة لاحقاً", exact: true }).click()
  await expect(page.getByRole("heading", { name: "العاملون" })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(`${input.firstName} ${input.lastName}`)).toBeVisible()
}

async function createProject(page: Page, name: string, manager: string) {
  await page.getByRole("link", { name: "المشاريع" }).first().click()
  await expect(page.getByRole("heading", { name: "المشاريع" })).toBeVisible()
  await page.getByRole("button", { name: "إضافة مشروع" }).first().click()
  await expect(page.getByRole("heading", { name: "إضافة مشروع" })).toBeVisible()
  await page.getByLabel("اسم المشروع").fill(name)
  const managerSelect = page.getByLabel("المدير المسؤول")
  await managerSelect.click()
  const managerOption = page.getByRole("option").filter({ hasText: manager }).first()
  await expect(managerOption).toBeVisible()
  await managerOption.click()
  await page.getByRole("button", { name: "حفظ المشروع" }).click()
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible({ timeout: 15_000 })
}

async function openEmployeeFinance(page: Page) {
  await page.getByRole("link", { name: "العاملون" }).first().click()
  const row = page.getByRole("row").filter({ hasText: employeeName }).first()
  await expect(row).toBeVisible()
  await row.getByRole("button", { name: /^عرض$/ }).click()
  await expect(page.getByRole("heading", { name: employeeName, level: 1 })).toBeVisible()
  await page.getByRole("tab", { name: "المالية" }).click()
  await expect(page.getByRole("heading", { name: "سجل الأجور المعتمدة" })).toBeVisible()
}

test("employee earnings approval keeps exact references, retries one committed request, and feeds project costs", async ({ page }) => {
  mkdirSync(evidenceDir, { recursive: true })
  await page.clock.install({ time: new Date("2026-06-15T11:00:00.000Z") })
  await bootstrapOrSignIn(page)

  const digits = `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 1000)}`
  await createEmployee(page, {
    firstName: "مدير",
    lastName: `إثبات ${suffix}`,
    phone: `053${digits.slice(0, 7)}`,
    role: "مدير مشروع",
  })
  await createProject(page, projectA, managerName)
  await createProject(page, projectB, managerName)
  await createEmployee(page, {
    firstName: "عامل",
    lastName: employeeLastName,
    phone: `054${digits.slice(0, 7)}`,
    role: "عامل",
    salary: "12345.67",
    manager: managerName,
    project: projectA,
  })

  // Editing through the original employee page must preserve exact money.
  await page.getByRole("link", { name: "العاملون" }).first().click()
  const employeeRow = page.getByRole("row").filter({ hasText: employeeName }).first()
  await employeeRow.getByRole("button", { name: /^عرض$/ }).click()
  await page.getByRole("link", { name: /^تعديل$/ }).first().click()
  await expect(page.getByLabel("قيمة الأجر")).toHaveValue("12345.67")
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    const breadcrumb = page.getByRole("navigation", { name: "breadcrumb" })
    const current = breadcrumb.locator('[data-slot="breadcrumb-page"]')
    await expect(current).toBeVisible()
    const geometry = await breadcrumb.evaluate(nav => {
      const current = nav.querySelector('[data-slot="breadcrumb-page"]')!
      const box = current.getBoundingClientRect()
      const bounds = nav.getBoundingClientRect()
      return { width: box.width, left: box.left, right: box.right, start: bounds.left, end: bounds.right }
    })
    expect(geometry.width).toBeGreaterThan(20)
    expect(geometry.left).toBeGreaterThanOrEqual(geometry.start - 1)
    expect(geometry.right).toBeLessThanOrEqual(geometry.end + 1)
    const parent = breadcrumb.getByRole("link", { name: employeeName, exact: true })
    if (width >= 768) {
      await expect(parent).toHaveAttribute("title", employeeName)
      expect(await parent.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
    } else {
      await expect(parent).toBeHidden()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await breadcrumb.screenshot({ path: join(evidenceDir, `breadcrumb-${width}-${suffix}.png`) })
  }
  await page.setViewportSize({ width: 1280, height: 1000 })
  await expect(page.getByRole("heading", { name: employeeName, level: 1, exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "حفظ كل التغييرات" }).click()
  await expect(page).toHaveURL(/\/employees\/[^/?]+(?:\?[^#]*)?$/)
  await expect(page.getByRole("heading", { name: employeeName, level: 1, exact: true })).toBeVisible({ timeout: 15_000 })
  const detailBreadcrumb = page.getByRole("navigation", { name: "breadcrumb" })
  await expect(detailBreadcrumb.locator('[data-slot="breadcrumb-page"]')).toHaveText(employeeName)
  expect(await detailBreadcrumb.evaluate(nav => {
    const label = nav.querySelector('[data-slot="breadcrumb-page"]')!.getBoundingClientRect()
    const bounds = nav.getBoundingClientRect()
    return label.width > 20 && label.left >= bounds.left - 1 && label.right <= bounds.right + 1
  })).toBe(true)

  await page.getByRole("tab", { name: "المالية" }).click()
  await expect(page.getByText("12,345.67")).toBeVisible()
  await page.getByRole("tabpanel").getByRole("button", { name: "اعتماد الأجر" }).first().click()
  await expect(page).toHaveURL(/\/employees\/[^/]+\/earnings\/new\?returnTo=employee-finance/)
  await expect(page.getByRole("heading", { name: "اعتماد الأجر المكتسب" })).toBeVisible()
  const approvalForm = page.getByRole("main").locator("form")
  await expect(approvalForm).toBeVisible()
  const periodStart = "2026-06-01"
  const periodEnd = "2026-06-25"
  // The browser clock is fixed in Africa/Algiers. These API boundaries are
  // independently specified in UTC, with the period end inclusive.
  const expectedPeriodStart = "2026-05-31T23:00:00.000Z"
  const expectedPeriodEnd = "2026-06-25T22:59:59.999Z"
  const selectPeriodDay = async (label: string, day: string) => {
    const trigger = approvalForm.getByLabel(label)
    await trigger.click()
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    const calendarId = await trigger.getAttribute("aria-controls")
    if (!calendarId) throw new Error(`Date picker ${label} has no controlled calendar`)
    const calendar = page.locator(`[id="${calendarId}"]`)
    await expect(calendar).toBeVisible()
    await calendar.locator(`[data-day="${day}"] button`).click()
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
  }
  await selectPeriodDay("بداية فترة العمل", periodStart)
  await selectPeriodDay("نهاية فترة العمل", periodEnd)
  await approvalForm.getByLabel("إجمالي الأجر المعتمد").fill("62500")
  await approvalForm.getByRole("button", { name: "إضافة بند مشروع" }).click()
  await approvalForm.getByRole("button", { name: "إضافة بند مشروع" }).click()
  await approvalForm.getByRole("button", { name: "إضافة بند مشروع" }).click()

  const setSegment = async (index: number, project: string, days: string, amount: string) => {
    await approvalForm.getByLabel(`المشروع ${index}`).selectOption({ label: project })
    await approvalForm.getByLabel(`أيام العمل ${index}`).fill(days)
    await approvalForm.getByLabel(`المبلغ ${index}`).fill(amount)
  }
  await setSegment(1, projectA, "5", "10000")
  await setSegment(2, projectB, "15", "37500")
  await setSegment(3, projectA, "5", "15000")

  // Editing B leaves both A rows and the declared total intact.
  await approvalForm.getByLabel("المبلغ 2").fill("37000")
  await expect(approvalForm.getByLabel("دون مشروع")).toContainText("500")
  await approvalForm.getByLabel("المبلغ 2").fill("37500")
  await expect(approvalForm.getByLabel("المبلغ 1")).toHaveValue("10000")
  await expect(approvalForm.getByLabel("المبلغ 3")).toHaveValue("15000")
  await expect(approvalForm.getByLabel("إجمالي الأجر المعتمد")).toHaveValue("62500")
  await expect(approvalForm.getByLabel("دون مشروع")).toContainText("0")

  // Invalid decimal precision must stay on the approval page and send no approval request.
  const requests: string[] = []
  let shouldDropResponse = false
  let droppedResponse = false
  let firstCommittedStatus: number | null = null
  await page.route("**/rpc/employeeEarningsApprove", async route => {
    const request = route.request()
    requests.push(request.postData() ?? "")
    if (shouldDropResponse && !droppedResponse) {
      droppedResponse = true
      const response = await route.fetch()
      firstCommittedStatus = response.status()
      await route.abort("failed")
      return
    }
    await route.continue()
  })
  const invalidAmount = approvalForm.getByLabel("المبلغ 1")
  await invalidAmount.fill("10000.001")
  await approvalForm.getByRole("button", { name: "اعتماد الأجر" }).click()
  await expect(invalidAmount).toHaveAttribute("aria-invalid", "true")
  await expect(approvalForm.getByText("يجب أن يكون المبلغ قيمة عشرية دقيقة لا تتجاوز منزلتين.")).toBeVisible()
  expect(requests).toHaveLength(0)
  await invalidAmount.fill("10000")
  await expect(approvalForm.getByText("يجب أن يساوي مجموع الموزع وغير الموزع إجمالي الأجر المعتمد.")).toHaveCount(0)

  const approvalFormShot = join(evidenceDir, `approval-${suffix}.png`)
  await approvalForm.screenshot({ path: approvalFormShot })

  // The first response is dropped only after route.fetch has received the real
  // authenticated API response. The exact frozen request is then retried.
  shouldDropResponse = true
  await approvalForm.getByRole("button", { name: "اعتماد الأجر" }).click()
  await expect(page.getByRole("status").filter({ hasText: "هناك اعتماد معلّق محفوظ." })).toBeVisible()
  await expect(approvalForm.getByRole("button", { name: "إعادة محاولة الاعتماد نفسه" })).toBeEnabled()
  await approvalForm.getByRole("button", { name: "إعادة محاولة الاعتماد نفسه" }).click()
  await expect(page.getByRole("heading", { name: "سجل الأجور المعتمدة" })).toBeVisible({ timeout: 15_000 })
  expect(firstCommittedStatus).toBe(200)
  expect(requests).toHaveLength(2)
  const approvalRequest = JSON.parse(requests[0]) as { json: { periodStart: string; periodEnd: string } }
  expect(approvalRequest.json.periodStart).toBe(expectedPeriodStart)
  expect(approvalRequest.json.periodEnd).toBe(expectedPeriodEnd)
  expect(requests[1]).toBe(requests[0])
  await page.unroute("**/rpc/employeeEarningsApprove")

  await openEmployeeFinance(page)
  await page.locator("summary").filter({ hasText: /^سجل الأجور المعتمدة$/ }).click()
  const history = page.getByRole("region", { name: "سجل الأجور المعتمدة" })
  await expect(history).toContainText("62,500")
  await expect(history).toContainText("0")
  const historyText = await history.innerText()
  expect(historyText.indexOf(projectA)).toBeLessThan(historyText.indexOf(projectB))
  expect(historyText.match(new RegExp(projectA, "g"))).toHaveLength(2)
  await expect(history.getByRole("row")).toHaveCount(2)
  await history.screenshot({ path: join(evidenceDir, `history-${suffix}.png`) })
  await page.reload()
  await page.locator("summary").filter({ hasText: /^سجل الأجور المعتمدة$/ }).click()
  await expect(page.getByRole("region", { name: "سجل الأجور المعتمدة" })).toContainText("62,500")

  for (const [name, expectedAmounts] of [[projectA, ["10,000", "15,000"]], [projectB, ["37,500"]]] as const) {
    await page.getByRole("link", { name: "المشاريع" }).first().click()
    const projectRow = page.getByRole("row").filter({ hasText: name }).first()
    await projectRow.getByRole("button", { name: /^عرض$/ }).click()
    await page.getByRole("tab", { name: "التكلفة" }).click()
    const costPanel = page.getByRole("tabpanel").filter({ hasText: "أجور هذا المشروع" })
    await expect(costPanel).toContainText(employeeName)
    const costRows = costPanel.getByRole("listitem").filter({ hasText: employeeName })
    await expect(costRows).toHaveCount(expectedAmounts.length)
    for (const amount of expectedAmounts) await expect(costPanel).toContainText(amount)
    await costPanel.getByRole("heading", { name: "أجور هذا المشروع" }).locator("xpath=../../..").screenshot({ path: join(evidenceDir, `cost-${expectedAmounts[0]}-${suffix}.png`) })
    await page.reload()
    await expect(page.getByRole("tabpanel").filter({ hasText: "أجور هذا المشروع" })).toContainText(employeeName)
  }

})
