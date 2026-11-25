import { test, expect } from "@playwright/test"
import { bootstrapOrSignIn } from "./helpers/session"
import { installManagedApiLifecycle } from "./helpers/test"

installManagedApiLifecycle()
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"

test("capture employee batch create after state", async ({ page }) => {
  const outputDir = process.env.E2E_CAPTURE_DIR ?? `.scratch/evidence/employee-select/attempt-${Date.now()}`
  if (existsSync(outputDir)) throw new Error(`Refusing existing capture directory: ${outputDir}`)
  mkdirSync(outputDir, { recursive: true })
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
  const row = page.getByRole("article").first()
  const role = row.locator('select[name="employee-role-0"]')
  const initialRole = await role.inputValue()
  await role.focus()
  await role.press("Alt+ArrowDown")
  await role.press("ArrowDown")
  await role.press("Enter")
  const keyboardRole = await role.inputValue()
  await role.press("Escape")
  await expect(role).toBeFocused()
  record(`KEYBOARD roleBefore=${initialRole} roleAfter=${keyboardRole} focusReturned=true`)
  record(`CAPTURE_OUTPUT ${outputDir}`)
  await row.screenshot({ path: `${outputDir}/employee-row.png` })
  await page.screenshot({ path: `${outputDir}/laptop.png` })
  await page.getByRole("button", { name: "إضافة عامل آخر" }).click()
  await expect(page.getByRole("article")).toHaveCount(2)
  await expect(role).toHaveValue(keyboardRole)
  const secondRowRole = page.locator('select[name="employee-role-1"]')
  await secondRowRole.focus()
  await secondRowRole.press("ArrowDown")
  await secondRowRole.press("Enter")
  const secondRoleValue = await secondRowRole.inputValue()
  await expect(role).toHaveValue(keyboardRole)
  record(`MULTIROW firstRole=${await role.inputValue()} secondRole=${secondRoleValue} distinctControls=${(await role.getAttribute("name")) !== (await secondRowRole.getAttribute("name"))}`)
})
