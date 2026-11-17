import { expect, type Page } from "@playwright/test"
import type { appContract } from "../../../packages/contracts/src/app-contract"
import type { applicationContract } from "../../../packages/contracts/src/application-contract"
import { apiBaseUrl } from "./urls"
const API_URL = apiBaseUrl()
import { bootstrapOrSignIn } from "./session"

// A typo or a supported operation cannot masquerade as a rejected legacy write.
export type RetiredProcedure = Exclude<keyof typeof appContract, keyof typeof applicationContract>
type DeferredCapability = "invoices" | "inventoryMoney" | "expenses" | "monetaryReports" | "fullProjectCost" | "cashPayments"

export async function assertCapabilityBoundary(page: Page, input: {
  path: string
  capability: DeferredCapability
  procedure: RetiredProcedure
}) {
  await bootstrapOrSignIn(page)
  const capabilities = await page.evaluate(async url => {
    const response = await fetch(url, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: null }) })
    return { status: response.status, body: await response.json() }
  }, `${API_URL}/rpc/applicationCapabilities`)
  expect(capabilities.status).toBe(200)
  expect(capabilities.body.json).toMatchObject({ employees: "exact", approvedEarnings: "available", [input.capability]: "unavailable" })

  const unexpectedRequests: string[] = []
  const track = (request: import("@playwright/test").Request) => {
    if (new URL(request.url()).pathname === `/rpc/${input.procedure}`) unexpectedRequests.push(request.url())
  }
  page.on("request", track)
  await page.goto(input.path)
  const main = page.getByRole("main")
  await expect(main.getByText("هذا القسم غير متاح في هذه النسخة.", { exact: true })).toBeVisible()
  await expect(main.locator("form")).toHaveCount(0)
  expect(unexpectedRequests).toEqual([])
  page.off("request", track)

  const refused = await page.evaluate(async url => {
    const response = await fetch(url, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: {} }) })
    return { status: response.status, body: await response.json() }
  }, `${API_URL}/rpc/${input.procedure}`)
  expect(refused).toEqual({ status: 503, body: { code: "SERVICE_UNAVAILABLE", message: "This financial operation is unavailable in the normal application." } })
  await main.getByRole("link", { name: "العاملون" }).click()
  await expect(page.getByRole("heading", { name: "العاملون", exact: true })).toBeVisible()
}
