import { mkdirSync, mkdtempSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig, devices } from "@playwright/test"
import { BOOTSTRAP_SETUP_KEY } from "./tests/e2e/helpers/session"

// Separate opt-in entry. Never imports the legacy SQL reset/seed fixtures.
mkdirSync(resolve(".scratch/reviews/558-connected"), { recursive: true })
const run = process.env.CONNECTED_EXACT_RUN ?? mkdtempSync(resolve(".scratch/reviews/558-connected/run-"))
process.env.CONNECTED_EXACT_RUN = run
process.env.CONNECTED_EXACT_TEST = "1"
const apiPort = process.env.CONNECTED_EXACT_API_PORT ?? "45481"
const webPort = process.env.CONNECTED_EXACT_WEB_PORT ?? "45482"
const api = `http://127.0.0.1:${apiPort}`
const web = `http://127.0.0.1:${webPort}`
process.env.PLAYWRIGHT_API_URL = api
process.env.APP_DB_PATH = resolve(run, "exact.sqlite")
const env = {
  ...process.env, CONNECTED_EXACT_TEST: "1", API_HOST: "127.0.0.1", API_PORT: apiPort, WEB_PORT: webPort,
  APP_DB_PATH: process.env.APP_DB_PATH, TUARI_CONFIG_FILE: resolve(run, "config.json"),
  APP_ATTACHMENTS_ROOT: resolve(run, "attachments"), APP_BACKUPS_ROOT: resolve(run, "backups"),
  ALLOWED_ORIGINS: web, BETTER_AUTH_URL: api, VITE_API_URL: api,
  BETTER_AUTH_SECRET: "connected-exact-test-secret-1234567890", BOOTSTRAP_SETUP_KEY,
  TUARI_LICENSE_STATUS: "trial",
}
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "payroll-connected-exact.spec.ts", workers: 1, retries: 0,
  timeout: 90_000, reporter: [["line"]], outputDir: resolve(run, "artifacts"),
  use: { ...devices["Desktop Chrome"], baseURL: web, trace: "retain-on-failure" },
  webServer: [
    { command: "node apps/api/node_modules/tsx/dist/cli.mjs --tsconfig tests/e2e/connected-exact.tsconfig.json apps/api/tests/connected-exact-server.ts", env, url: api + "/health", reuseExistingServer: false, timeout: 120_000 },
    { command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --config vite.connected-exact.config.ts", cwd: "apps/web", env, url: web, reuseExistingServer: false, timeout: 120_000 },
  ],
})
