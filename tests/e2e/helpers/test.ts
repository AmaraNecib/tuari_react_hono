import { test } from "@playwright/test"
import { restartManagedApi, stopManagedApi } from "./managed-api"

/** Register in each file, not at import time: helpers are cached across specs. */
export function installManagedApiLifecycle() {
  test.beforeAll(async () => {
    if (process.env.E2E_API_MANAGED === "1") await restartManagedApi()
  })
  test.afterAll(async () => { await stopManagedApi() })
}
export { test }
export { expect, type Page, type Locator, type BrowserContext } from "@playwright/test"
