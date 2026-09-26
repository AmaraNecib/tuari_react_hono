import { expect, test, type Locator, type Page } from "@playwright/test"

import { resetE2eDatabase } from "./helpers/db-isolation"
import {
  seedEmployeeByRole,
  seedExternalCounterparties,
} from "./helpers/db-seed"
import { bootstrapOrSignIn, uniqueSuffix } from "./helpers/session"

import { databaseFixturesAvailable } from "./helpers/db-isolation"


test.skip(!databaseFixturesAvailable, "external API: direct-SQLite fixtures are unavailable")
test.describe.configure({ mode: "serial" })

type Fixtures = {
  counterparties: string[]
  counterpartyIds: string[]
  managers: string[]
}

let fixtures: Fixtures

test.beforeEach(async ({ page }) => {
  // Per-TEST isolation: every test seeds its own fresh fixture batch, so
  // option lists stay deterministic (exactly 4 counterparties) even when a
  // retried attempt reruns against the same shared database.
  resetE2eDatabase()
  await bootstrapOrSignIn(page)

  const suffix = uniqueSuffix()
  const phoneSeed = Array.from(suffix).reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) % 100_000_000,
    0,
  )
  const counterparties = ["Alpha", "Bravo", "Charlie", "Delta"].map(
    (label) => `E2E ${label} ${suffix}`,
  )
  const counterpartyIds = seedExternalCounterparties(
    counterparties.map((fullName, index) => ({
      fullName,
      phoneNumber: `07${String((phoneSeed + index * 7919) % 100_000_000).padStart(8, "0")}`,
    })),
  )
  const managerLabels = ["Alpha", "Bravo", "Charlie", "Delta"].map(
    (label) => `E2E ${label} ${suffix}`,
  )
  const managers = managerLabels.map((label) => `مدير ${label}`)
  managerLabels.forEach((lastName, index) => {
    seedEmployeeByRole({
      firstName: "مدير",
      lastName,
      phone: `06${String((phoneSeed + index * 3571 + 1) % 100_000_000).padStart(8, "0")}`,
      roleKey: "warehouse_manager",
    })
  })

  fixtures = { counterparties, counterpartyIds, managers }
})

function invoiceCounterpartyTrigger(page: Page) {
  return page
    .locator("label")
    .filter({ hasText: "الجهة الخارجية" })
    .getByRole("combobox")
}

async function gotoWorkspacePage(page: Page, path: string) {
  const snapshotResponse = page.waitForResponse(
    (response) =>
      response.url().includes("workspaceSnapshot") &&
      response.request().method() === "POST" &&
      response.status() === 200,
  )
  await page.goto(path)
  await snapshotResponse
}

async function openInvoiceCounterparty(page: Page) {
  await gotoWorkspacePage(page, "/invoices/create")
  await expect(
    page.getByRole("heading", { name: "إضافة مخزون بالفاتورة" }),
  ).toBeVisible()

  const section = page.getByRole("button", { name: "ربط بجهة خارجية" })
  await section.click()
  const trigger = invoiceCounterpartyTrigger(page)
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

test("invoice counterparty opens below its trigger with the selected option fully in-viewport", async ({
  page,
}) => {
  const trigger = await openInvoiceCounterparty(page)
  await trigger.press("Enter")
  const { listbox } = await visiblePopup(page)
  const firstOption = listbox.getByRole("option", {
    name: fixtures.counterparties[0],
    exact: true,
  })
  await firstOption.click()
  await expect(listbox).toBeHidden()
  await expect(trigger).toContainText(fixtures.counterparties[0])

  // Reopen with a selected value. Standard bottom-side placement keeps the
  // popup below the trigger; unlike the old trigger-aligned mode, the selected
  // option is not moved onto the trigger's vertical position.
  await trigger.press("Enter")
  const reopened = await visiblePopup(page)
  await expectFullyInViewport(page, reopened.popup)
  await expectFullyInViewport(page, reopened.listbox.getByRole("option", {
    name: fixtures.counterparties[0],
    exact: true,
  }))

  const triggerBox = await boxOrThrow(trigger)
  const popupBox = await boxOrThrow(reopened.popup)
  const selectedOptionBox = await boxOrThrow(
    reopened.listbox.getByRole("option", {
      name: fixtures.counterparties[0],
      exact: true,
    }),
  )

  expect(popupBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height - 1)
  expect(selectedOptionBox.y).toBeGreaterThanOrEqual(
    triggerBox.y + triggerBox.height - 1,
  )

  // The invoice consumer also uses a native debt select in the same flow.
  await reopened.listbox.getByRole("option", {
    name: fixtures.counterparties[0],
    exact: true,
  }).click()
  const debtSection = page.getByRole("button", { name: "الدين والدفع" })
  await debtSection.click()
  await page.getByLabel("هل هذه دين؟").selectOption("YES")
  await expect(page.getByLabel("طريقة الدفع")).toBeVisible()
})

test("a 900x700 viewport flips the invoice counterparty popup without clipping its target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 })
  const trigger = await openInvoiceCounterparty(page)
  // This create form is shorter than 700px when rendered with an empty line.
  // Add scrollable room above the combobox (without changing the trigger or
  // popup geometry) so the browser exercises collision placement at the real
  // viewport edge.
  const scrolled = await trigger.evaluate((element) => {
    const spacer = document.createElement("div")
    spacer.dataset.e2eScrollSpacer = "true"
    spacer.style.height = "1000px"
    // The field sits in a two-column grid; span all columns so the spacer
    // forms its own full-width row ABOVE the combobox instead of sharing
    // the same row.
    spacer.style.gridColumn = "1 / -1"
    const field = element.closest("label")
    field?.parentElement?.insertBefore(spacer, field)
    if (!field) return { applied: false, bottom: 0, scrollTop: 0 }
    // The shell's main area is the scroll container (overflow-auto); pin the
    // scrollTop explicitly instead of relying on scrollIntoView, which can
    // target a different ancestor in the nested shell layout. Scroll so the
    // trigger's bottom edge sits at the container's visible bottom — the
    // popup then has no room below and must flip up.
    const scroller = element.closest("main") as HTMLElement | null
    if (!scroller) return { applied: false, bottom: 0, scrollTop: 0 }
    const rect = element.getBoundingClientRect()
    const absoluteTop = rect.top + scroller.scrollTop
    scroller.scrollTop = absoluteTop + rect.height - scroller.clientHeight
    return {
      applied: true,
      bottom: element.getBoundingClientRect().bottom,
      scrollTop: scroller.scrollTop,
    }
  })
  expect(scrolled.applied).toBe(true)
  expect(scrolled.scrollTop).toBeGreaterThan(0)
  expect(scrolled.bottom).toBeGreaterThan(600)
  const triggerBox = await boxOrThrow(trigger)
  expect(triggerBox.y + triggerBox.height).toBeGreaterThan(600)

  await trigger.press("Enter")
  const { listbox, popup } = await visiblePopup(page)
  const target = listbox.getByRole("option", {
    name: fixtures.counterparties[0],
    exact: true,
  })
  await expect(target).toBeVisible()
  await expectFullyInViewport(page, popup)
  await expectFullyInViewport(page, target)

  const popupBox = await boxOrThrow(popup)
  expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(700)
  expect(popupBox.y).toBeLessThan(triggerBox.y)
})

test("the warehouse form manager combobox commits a human-readable selection", async ({
  page,
}) => {
  await gotoWorkspacePage(page, "/warehouses/create")
  await expect(page.getByRole("heading", { name: "إضافة مستودع" })).toBeVisible()

  const managerTrigger = page
    .locator("label")
    .filter({ hasText: "المدير المسؤول" })
    .getByRole("combobox")
  await managerTrigger.press("Enter")
  const { listbox } = await visiblePopup(page)
  const target = listbox.getByRole("option", {
    name: new RegExp(`^${fixtures.managers[0]} - `),
  })
  await target.click()
  await expect(listbox).toBeHidden()
  await expect(managerTrigger).toContainText(fixtures.managers[0])
})

test("ArrowDown three times and Enter selects the intended counterparty label", async ({
  page,
}) => {
  const trigger = await openInvoiceCounterparty(page)
  await trigger.press("Enter")
  const { listbox } = await visiblePopup(page)
  await expect(listbox.getByRole("option")).toHaveCount(
    fixtures.counterparties.length + 1,
  )

  // Base UI transfers focus into its popup while it is open; page-level key
  // events exercise that active select without refocusing the trigger.
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")

  await expect(listbox).toBeHidden()
  await expect(trigger).toContainText(fixtures.counterparties[3])
  await expect(trigger).not.toContainText(fixtures.counterpartyIds[3])
})

test("repeated click selection closes the popup and preserves the option label", async ({
  page,
}) => {
  const trigger = await openInvoiceCounterparty(page)

  for (let index = 0; index < 12; index += 1) {
    const expectedName = fixtures.counterparties[index % 2]
    await trigger.press("Enter")
    const { listbox } = await visiblePopup(page)
    await listbox.getByRole("option", { name: expectedName, exact: true }).click()

    await expect(listbox).toBeHidden()
    await expect(trigger).toContainText(expectedName)
    await expect(trigger).not.toContainText(fixtures.counterpartyIds[index % 2])
  }
})
