import { mkdirSync } from "node:fs"
import { join } from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

const evidenceDir = join(process.cwd(), ".scratch", "reviews", "543-browser")
const suffix = uniqueSuffix()
const employeeName = `عامل إثبات ${suffix}`
const managerName = `مدير إثبات ${suffix}`
const projectA = `مشروع أ ${suffix}`
const projectB = `مشروع ب ${suffix}`

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
    await row.getByLabel("المدير المباشر").selectOption({ label: input.manager })
    await row.getByLabel("المشروع").selectOption({ label: input.project })
  }
  await page.getByRole("button", { name: "حفظ العامل", exact: true }).click()
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
  await page.getByRole("option", { name: manager, exact: true }).click()
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
    lastName: `إثبات ${suffix}`,
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
  await page.getByRole("button", { name: "حفظ كل التغييرات" }).click()
  await expect(page.getByRole("heading", { name: employeeName, level: 1 })).toBeVisible({ timeout: 15_000 })

  await page.getByRole("tab", { name: "المالية" }).click()
  await expect(page.getByText("12,345.67")).toBeVisible()
  await page.getByRole("button", { name: "اعتماد الأجر" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("بداية فترة العمل").fill("2026-01-01")
  await dialog.getByLabel("نهاية فترة العمل").fill("2026-01-31")
  await dialog.getByLabel("إجمالي الأجر المعتمد بالدينار الجزائري").fill("62500")
  await dialog.getByLabel("المبلغ غير الموزع بالدينار الجزائري").fill("0")
  await dialog.getByRole("button", { name: "إضافة بند مشروع" }).click()
  await dialog.getByRole("button", { name: "إضافة بند مشروع" }).click()

  const setSegment = async (index: number, project: string, days: string, amount: string) => {
    await dialog.getByLabel(`المشروع ${index}`).selectOption({ label: project })
    await dialog.getByLabel(`أيام العمل ${index}`).fill(days)
    await dialog.getByLabel(`المبلغ بالدينار الجزائري ${index}`).fill(amount)
  }
  await setSegment(1, projectA, "5", "10000")
  await setSegment(2, projectB, "15", "37500")
  await setSegment(3, projectA, "5", "15000")

  // Editing B leaves both A rows and the declared total intact.
  await dialog.getByLabel("المبلغ بالدينار الجزائري 2").fill("37000")
  await dialog.getByLabel("المبلغ بالدينار الجزائري 2").fill("37500")
  await expect(dialog.getByLabel("المبلغ بالدينار الجزائري 1")).toHaveValue("10000")
  await expect(dialog.getByLabel("المبلغ بالدينار الجزائري 3")).toHaveValue("15000")
  await expect(dialog.getByLabel("إجمالي الأجر المعتمد بالدينار الجزائري")).toHaveValue("62500")

  // Invalid decimal precision must stay on the dialog and create no history row.
  await dialog.getByLabel("المبلغ بالدينار الجزائري 1").fill("10000.001")
  await dialog.getByRole("button", { name: "اعتماد الأجر" }).click()
  await expect(dialog.getByText("يجب أن يكون المبلغ قيمة عشرية دقيقة لا تتجاوز منزلتين.")).toBeVisible()
  await expect(page.getByText("لا توجد أجور معتمدة بعد")).toBeVisible()
  await dialog.getByLabel("المبلغ بالدينار الجزائري 1").fill("10000")

  const dialogShot = join(evidenceDir, `approval-${suffix}.png`)
  await dialog.screenshot({ path: dialogShot })

  // The first response is dropped only after route.fetch has received the real
  // authenticated API response. The exact frozen request is then retried.
  const requests: string[] = []
  let firstCommittedStatus: number | null = null
  let droppedResponse = false
  await page.route("**/rpc/employeeEarningsApprove", async route => {
    const request = route.request()
    requests.push(request.postData() ?? "")
    if (!droppedResponse) {
      droppedResponse = true
      const response = await route.fetch()
      firstCommittedStatus = response.status()
      await route.abort("failed")
      return
    }
    await route.continue()
  })
  await dialog.getByRole("button", { name: "اعتماد الأجر" }).click()
  await expect(dialog.getByRole("status")).toBeVisible()
  await expect(dialog.getByRole("button", { name: "إعادة محاولة الاعتماد نفسه" })).toBeEnabled()
  await dialog.getByRole("button", { name: "إعادة محاولة الاعتماد نفسه" }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
  expect(firstCommittedStatus).toBe(200)
  expect(requests).toHaveLength(2)
  expect(requests[1]).toBe(requests[0])
  await page.unroute("**/rpc/employeeEarningsApprove")

  await openEmployeeFinance(page)
  const history = page.getByRole("region", { name: "سجل الأجور المعتمدة" })
  await expect(history).toContainText("62,500")
  await expect(history).toContainText("0")
  const historyText = await history.innerText()
  expect(historyText.indexOf(projectA)).toBeLessThan(historyText.indexOf(projectB))
  expect(historyText.match(new RegExp(projectA, "g"))).toHaveLength(2)
  await expect(history.getByRole("row")).toHaveCount(2)
  await history.screenshot({ path: join(evidenceDir, `history-${suffix}.png`) })
  await page.reload()
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

  const fingerprint = await testInfo.attach("source-fingerprint", {
    body: Buffer.from(`${process.env.GIT_HEAD_BEFORE ?? "unset"}\n${process.env.GIT_HEAD_AFTER ?? "unset"}\n`),
    contentType: "text/plain",
  })
  expect(fingerprint.name).toBe("source-fingerprint")
  await import("node:fs/promises").then(fs => fs.writeFile(fingerprintFile, `${requests.length} real approval requests; first committed response ${firstCommittedStatus}; screenshots: ${dialogShot}\n`))
})
