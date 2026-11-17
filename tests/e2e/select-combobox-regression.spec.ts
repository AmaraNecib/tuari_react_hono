import { expect, test, type Locator, type Page } from "@playwright/test"
import { databaseFixturesAvailable, resetE2eDatabase } from "./helpers/db-isolation"
import { seedEmployeeByRole } from "./helpers/db-seed"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })
let managers: Array<{ id: string; name: string }>

test.beforeEach(async ({ page }) => {
  resetE2eDatabase()
  await bootstrapOrSignIn(page)
  const suffix = uniqueSuffix()
  const phoneSeed = Array.from(suffix).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 100_000_000, 0)
  managers = ["Alpha", "Bravo", "Charlie", "Delta"].map((label, index) => {
    const lastName = `E2E ${label} ${suffix}`
    const id = seedEmployeeByRole({ firstName: "مدير", lastName, phone: `06${String((phoneSeed + index * 3571 + 1) % 100_000_000).padStart(8, "0")}`, roleKey: "warehouse_manager" })
    return { id, name: `مدير ${lastName}` }
  })
})

async function openManager(page: Page) {
  // Invoice forms are deferred; this is the same production Select primitive on a supported consumer.
  await page.goto("/warehouses/create")
  await expect(page.getByRole("heading", { name: "إضافة مستودع" })).toBeVisible()
  const trigger = page.locator("label").filter({ hasText: "المدير المسؤول" }).getByRole("combobox")
  await expect(trigger).toBeVisible()
  return trigger
}

async function visiblePopup(page: Page) {
  const listbox = page.getByRole("listbox").last()
  await expect(listbox).toBeVisible()
  const popup = page.locator('[data-slot="select-content"]:visible').last()
  await expect(popup).toBeVisible()
  return { listbox, popup }
}
async function boxOrThrow(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error("Expected a visible element to have a bounding box")
  return box
}
async function expectFullyInViewport(page: Page, locator: Locator) {
  const box = await boxOrThrow(locator)
  const viewport = page.viewportSize()
  if (!viewport) throw new Error("Expected a browser viewport")
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
}

test("manager select reopens below its trigger with the selected option fully in viewport", async ({ page }) => {
  const trigger = await openManager(page)
  await trigger.press("Enter")
  const { listbox } = await visiblePopup(page)
  await listbox.getByRole("option", { name: managers[0]!.name, exact: true }).click()
  await expect(listbox).toBeHidden()
  await expect(trigger).toContainText(managers[0]!.name)
  await expect(trigger).not.toContainText(managers[0]!.id)
  await trigger.press("Enter")
  const reopened = await visiblePopup(page)
  const selected = reopened.listbox.getByRole("option", { name: managers[0]!.name, exact: true })
  await expectFullyInViewport(page, reopened.popup)
  await expectFullyInViewport(page, selected)
  const triggerBox = await boxOrThrow(trigger)
  expect((await boxOrThrow(reopened.popup)).y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height - 1)
  expect((await boxOrThrow(selected)).y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height - 1)
  await selected.click()
  await page.getByRole("combobox", { name: /^الحالة/ }).selectOption("INACTIVE")
  await expect(page.getByRole("combobox", { name: /^الحالة/ })).toHaveValue("INACTIVE")
})

test("a 900x700 viewport flips the manager popup without clipping its target", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 })
  const trigger = await openManager(page)
  const scrolled = await trigger.evaluate(element => {
    const spacer = document.createElement("div")
    spacer.dataset.e2eScrollSpacer = "true"
    spacer.style.height = "1000px"
    spacer.style.gridColumn = "1 / -1"
    const field = element.closest("label")
    field?.parentElement?.insertBefore(spacer, field)
    const scroller = element.closest("main") as HTMLElement | null
    if (!field || !scroller) return { applied: false, bottom: 0, scrollTop: 0 }
    const rect = element.getBoundingClientRect()
    scroller.scrollTop = rect.top + scroller.scrollTop + rect.height - scroller.clientHeight
    return { applied: true, bottom: element.getBoundingClientRect().bottom, scrollTop: scroller.scrollTop }
  })
  expect(scrolled.applied).toBe(true)
  expect(scrolled.scrollTop).toBeGreaterThan(0)
  expect(scrolled.bottom).toBeGreaterThan(600)
  const triggerBox = await boxOrThrow(trigger)
  expect(triggerBox.y + triggerBox.height).toBeGreaterThan(600)
  await trigger.press("Enter")
  const { listbox, popup } = await visiblePopup(page)
  const target = listbox.getByRole("option", { name: managers[0]!.name, exact: true })
  await expect(target).toBeVisible()
  await expectFullyInViewport(page, popup)
  await expectFullyInViewport(page, target)
  const popupBox = await boxOrThrow(popup)
  expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(700)
  expect(popupBox.y).toBeLessThan(triggerBox.y)
})

test("ArrowDown from the empty option and Enter selects the intended manager label", async ({ page }) => {
  const trigger = await openManager(page)
  await trigger.press("Enter")
  const { listbox } = await visiblePopup(page)
  await expect(listbox.getByRole("option")).toHaveCount(managers.length + 1)
  // Empty is initially selected; four moves traverse Alpha through Delta.
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(listbox).toBeHidden()
  await expect(trigger).toContainText(managers[3]!.name)
  await expect(trigger).not.toContainText(managers[3]!.id)
})

test("repeated click selection closes the popup and preserves its label", async ({ page }) => {
  const trigger = await openManager(page)
  for (let index = 0; index < 12; index += 1) {
    const manager = managers[index % 2]!
    await trigger.press("Enter")
    const { listbox } = await visiblePopup(page)
    await listbox.getByRole("option", { name: manager.name, exact: true }).click()
    await expect(listbox).toBeHidden()
    await expect(trigger).toContainText(manager.name)
    await expect(trigger).not.toContainText(manager.id)
  }
})
