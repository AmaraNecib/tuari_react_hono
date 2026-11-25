import { test, expect } from "@playwright/test"
import { bootstrapOrSignIn } from "./helpers/session"
import { installManagedApiLifecycle } from "./helpers/test"

installManagedApiLifecycle()
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"

test("capture employee batch create after state", async ({ page }) => {
  const evidenceRoot = ".scratch/evidence/employee-select"
  mkdirSync(evidenceRoot, { recursive: true })
  let outputDir: string
  if (process.env.E2E_CAPTURE_DIR) {
    outputDir = process.env.E2E_CAPTURE_DIR
    mkdirSync(outputDir)
  } else {
    outputDir = mkdtempSync(join(evidenceRoot, "attempt-"))
  }
  const record = (line: string) => {
    const entry = `${new Date().toISOString()} ${line}`
    console.log(entry)
    appendFileSync(`${outputDir}/browser.log`, `${entry}\n`)
  }
  record(`START url=${page.url()} apiPort=${process.env.API_PORT ?? "unset"} webPort=${process.env.WEB_PORT ?? "unset"} fixtureDb=${process.env.APP_DB_PATH ?? "unset"}`)
  page.on("requestfailed", request => record(`REQUEST_FAILED ${request.method()} ${request.url()} ${request.failure()?.errorText}`))
  page.on("response", response => {
    if (response.url().includes("127.0.0.1") || response.url().includes("localhost") || response.url().includes("auth")) record(`RESPONSE ${response.status()} ${response.url()}`)
  })
  page.on("pageerror", error => record(`PAGE_ERROR ${error.stack ?? error.message}`))
  page.on("console", message => { if (message.type() === "error") record(`CONSOLE_ERROR ${message.text()}`) })
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) record(`NAVIGATED ${frame.url()}`) })
  try {
    const response = await page.request.get(`http://127.0.0.1:${process.env.API_PORT ?? "4318"}/health`, { timeout: 3000 })
    record(`API_HEALTH status=${response.status()} body=${(await response.text()).slice(0, 500)}`)
  } catch (error) { record(`API_HEALTH_ERROR ${String(error)}`) }
  try {
    await bootstrapOrSignIn(page)
  } catch (error) {
    record(`BOOTSTRAP_FAILURE url=${page.url()} error=${String(error)}`)
    writeFileSync(`${outputDir}/failure.html`, await page.content(), { flag: "wx" })
    throw error
  }
  record(`CAPTURE_CONTEXT url=${page.url()} db=${process.env.APP_DB_PATH ?? "unset"}`)
  await page.getByRole("link", { name: "العاملون" }).first().click()
  await page.getByRole("link", { name: "إضافة عامل" }).first().click()
  await expect(page.getByRole("heading", { name: /صفحة إضافة العاملين/ })).toBeVisible()
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  const initialRow = page.getByRole("article").first()
  record(`CAPTURE_INITIAL ${outputDir}`)
  await initialRow.screenshot({ path: `${outputDir}/employee-row.png` })
  await page.screenshot({ path: `${outputDir}/laptop.png` })
  const fixtures = await page.evaluate(async ({ apiPort }) => {
    const api = `http://127.0.0.1:${apiPort}`
    const rpc = async (method: string, input: unknown) => {
      const response = await fetch(`${api}/rpc/${method}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: input }) })
      const body = await response.json()
      if (!response.ok) throw new Error(`${method}: ${response.status} ${JSON.stringify(body)}`)
      return body.json
    }
    const metadata = await rpc("financial/metadata", null) as { roles: Array<{ id: string; key: string }> }
    const managerRole = metadata.roles.find(role => role.key === "project_manager")
    const workerRole = metadata.roles.find(role => role.key === "worker")
    if (!managerRole || !workerRole) throw new Error("Fixture lacks supported worker/project_manager roles")
    const suffix = Date.now() % 1_000_000
    const managers = []
    for (const [index, name] of ["أمين تجريبي", "ليلى تجريبية"].entries()) {
      const created = await rpc("employeesCreate", { firstName: name, lastName: "اختبار", phone: `0555${String(suffix + index).padStart(6, "0")}`, roleId: managerRole.id }) as { success: boolean; item: { id: string } }
      if (!created.success) throw new Error(`Could not create manager fixture ${index}`)
      const project = await rpc("projectsCreate", { name: `مشروع اختبار ${index}`, status: "ACTIVE", managerId: created.item.id }) as { success: boolean; item: { id: string } }
      if (!project.success) throw new Error(`Could not create project fixture ${index}`)
      managers.push({ id: created.item.id, projectId: project.item.id })
    }
    return { managers, workerRoleId: workerRole.id }
  }, { apiPort: process.env.API_PORT ?? "4318" })
  record(`SEEDED_SUPPORTED_FIXTURES ${JSON.stringify(fixtures)}`)
  await page.reload()
  await expect(page.getByRole("link", { name: "لوحة التحكم" }).first()).toBeVisible()
  await page.getByRole("link", { name: "العاملون" }).first().click()
  await page.getByRole("link", { name: "إضافة عامل" }).first().click()
  await expect(page.getByRole("heading", { name: /صفحة إضافة العاملين/ })).toBeVisible()
  const row = page.getByRole("article").first()
  const role = row.locator('select[name="employee-role-0"]')
  await expect(role).toHaveAccessibleName("صلاحية التطبيق")
  await role.selectOption(fixtures.workerRoleId)
  await role.focus()
  await role.press("Alt+ArrowDown")
  await role.press("Escape")
  await expect(role).toBeFocused()
  const manager = row.locator('select[name="employee-manager-0"]')
  const project = row.locator('select[name="employee-project-0"]')
  await expect(manager).toHaveAccessibleName("المدير المباشر")
  await expect(project).toHaveAccessibleName("المشروع الحالي")
  await expect(manager).toBeEnabled()
  await expect(manager).toHaveAttribute("aria-describedby", /employee-manager-hint-0/)
  await manager.focus()
  await manager.press("Home")
  await manager.press("ArrowDown")
  await manager.press("Enter")
  const selectedManagerId = await manager.inputValue()
  const selectedFixture = fixtures.managers.find(fixture => fixture.id === selectedManagerId)
  expect(selectedFixture, "keyboard-selected manager must match a supported fixture").toBeTruthy()
  await expect(project).toBeEnabled()
  await expect(project).toHaveAttribute("aria-describedby", /employee-project-hint-0/)
  await project.focus()
  await project.press("Home")
  await project.press("ArrowDown")
  await project.press("Enter")
  const selectedProjectId = await project.inputValue()
  expect(selectedProjectId).toBe(selectedFixture!.projectId)
  await project.press("Escape")
  await expect(project).toBeFocused()
  const keyboardRole = await role.inputValue()
  record(`KEYBOARD role=${keyboardRole} manager=${selectedManagerId} project=${selectedProjectId} focusReturned=true`)
  record(`SELECTED_STATE ${outputDir}`)
  await row.screenshot({ path: `${outputDir}/selected-employee-row.png` })
  await page.getByRole("button", { name: "إضافة عامل آخر" }).click()
  await expect(page.getByRole("article")).toHaveCount(2)
  await expect(role).toHaveValue(keyboardRole)
  const secondRowRole = page.locator('select[name="employee-role-1"]')
  await secondRowRole.selectOption(fixtures.workerRoleId)
  const secondManager = page.locator('select[name="employee-manager-1"]')
  const secondProject = page.locator('select[name="employee-project-1"]')
  await secondManager.focus()
  await secondManager.press("Home")
  await secondManager.press("ArrowDown")
  await secondManager.press("ArrowDown")
  await secondManager.press("Enter")
  const secondManagerId = await secondManager.inputValue()
  expect(secondManagerId).not.toBe(selectedManagerId)
  const secondFixture = fixtures.managers.find(fixture => fixture.id === secondManagerId)
  expect(secondFixture, "second row manager must match the other fixture").toBeTruthy()
  await secondProject.focus()
  await secondProject.press("Home")
  await secondProject.press("ArrowDown")
  await secondProject.press("Enter")
  const secondProjectId = await secondProject.inputValue()
  expect(secondProjectId).toBe(secondFixture!.projectId)
  await expect(role).toHaveValue(keyboardRole)
  await expect(manager).toHaveValue(selectedManagerId)
  await expect(project).toHaveValue(selectedProjectId)
  record(`MULTIROW firstManager=${await manager.inputValue()} firstProject=${await project.inputValue()} secondManager=${secondManagerId} secondProject=${secondProjectId}`)
  await page.screenshot({ path: `${outputDir}/multirow.png` })

  await page.getByRole("article").nth(1).getByRole("button", { name: "حذف هذا الصف" }).click()
  const employeePhone = `0567${String(Date.now() % 1_000_000).padStart(6, "0")}`
  await row.getByLabel("الاسم الأول").fill("عامل اختبار")
  await row.getByLabel("اللقب").fill("إثبات الاختيار")
  await row.getByLabel("رقم الهاتف").fill(employeePhone)
  await row.getByLabel("دورية الأجر").selectOption("MONTHLY")
  await row.getByLabel(/قيمة الأجر/).fill("10000")
  const saveResponsePromise = page.waitForResponse(response => response.url().endsWith("/rpc/employeesBatchCreate") && response.request().method() === "POST")
  await page.getByRole("button", { name: "حفظ العامل" }).click()
  const saveResponse = await saveResponsePromise
  expect(saveResponse.status()).toBe(200)
  const saveResult = (await saveResponse.json()).json
  expect(saveResult.success).toBe(true)
  const savedEmployeeId = saveResult.item.employees[0].id
  expect(saveResult.item.managerAssignments).toContainEqual(expect.objectContaining({ workerId: savedEmployeeId, managerId: selectedManagerId }))
  expect(saveResult.item.projectAssignments).toContainEqual(expect.objectContaining({ employeeId: savedEmployeeId, projectId: selectedProjectId }))
  record(`PERSISTED employee=${savedEmployeeId} manager=${selectedManagerId} project=${selectedProjectId}`)
  await expect(page.getByRole("heading", { name: "مراجعة الرصيد السابق، خطوة اختيارية", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "إنهاء ومتابعة المراجعة لاحقاً", exact: true }).click()
})
