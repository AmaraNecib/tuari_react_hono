import { mkdirSync, mkdtempSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig, devices } from "@playwright/test"
import { BOOTSTRAP_SETUP_KEY } from "./tests/e2e/helpers/session"
mkdirSync(resolve(".scratch/evidence/613-ui"), { recursive: true })
const run = mkdtempSync(resolve(".scratch/evidence/613-ui/run-"))
process.env.MANUAL_SETTLEMENT_RUN = run
process.env.MANUAL_SETTLEMENT_CAPTURE ??= "after"
process.env.CONNECTED_EXACT_RUN = run
process.env.CONNECTED_EXACT_TEST = "1"
const api = "http://127.0.0.1:45531"
const web = "http://127.0.0.1:45532"
process.env.PLAYWRIGHT_API_URL = api
process.env.MANUAL_SETTLEMENT_WEB_URL = web
const env = { ...process.env, CONNECTED_EXACT_TEST: "1", MANUAL_SETTLEMENT_BROWSER: "1", API_HOST: "127.0.0.1", API_PORT: "45531", WEB_PORT: "45532", APP_DB_PATH: resolve(run, "exact.sqlite"), TUARI_CONFIG_FILE: resolve(run, "config.json"), APP_ATTACHMENTS_ROOT: resolve(run, "attachments"), APP_BACKUPS_ROOT: resolve(run, "backups"), ALLOWED_ORIGINS: web, BETTER_AUTH_URL: api, VITE_API_URL: api, BETTER_AUTH_SECRET: "manual-settlement-browser-public-test-secret-123456789", BOOTSTRAP_SETUP_KEY, TUARI_LICENSE_STATUS: "trial" }
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "manual-settlement-connected.spec.ts", workers: 1, retries: 0, timeout: 90000, reporter: [["line"]], outputDir: resolve(run, "artifacts"),
  use: { ...devices["Desktop Chrome"], baseURL: web, trace: "retain-on-failure" },
  webServer: [
    { command: "node apps/api/node_modules/tsx/dist/cli.mjs --tsconfig tests/e2e/connected-exact.tsconfig.json apps/api/tests/connected-exact-server.ts", env, url: api + "/health", reuseExistingServer: false, timeout: 120000 },
    { command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --config vite.connected-exact.config.ts", cwd: "apps/web", env, url: web, reuseExistingServer: false, timeout: 120000 },
  ],
})
