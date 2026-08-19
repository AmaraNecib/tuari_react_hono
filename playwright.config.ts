import { defineConfig, devices } from "@playwright/test"

import { BOOTSTRAP_SETUP_KEY } from "./tests/e2e/helpers/session"
import {
  apiBaseUrl,
  apiPort,
  DEFAULT_WEB_PORT,
  normalizePort,
  resolveWebServer,
} from "./apps/web/src/lib/ports"

// Env-configurable ports so parallel worktrees/lanes can run on distinct
// ports without colliding: API_PORT (api, default 4318), WEB_PORT (web dev,
// default 3000), PLAYWRIGHT_BASE_URL (overrides the web base URL when set).
// Loopback-only — never expose anything to the network. Port normalization
// and web-server/base URL resolution live in apps/web/src/lib/ports.ts so the
// web app, Vite, and the E2E suite share exactly the same precedence rules.

const apiUrl = apiBaseUrl()
const apiPortValue = apiPort()
const defaultWebPort = normalizePort(process.env.WEB_PORT, DEFAULT_WEB_PORT)
const web = resolveWebServer()
const webPort = web.port
const webUrl = web.url
const startOwnWeb = web.startOwn

const e2eDbPath = `./data/tuari.phase1.integration.${Date.now()}.sqlite`

const sharedEnv = {
  ...process.env,
  API_HOST: "127.0.0.1",
  API_PORT: apiPortValue,
  WEB_PORT: webPort,
  ALLOWED_ORIGINS: [
    webUrl,
    `http://localhost:${defaultWebPort}`,
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
  ].join(","),
  BETTER_AUTH_SECRET: "tuari-foundation-secret-1234567890",
  BETTER_AUTH_URL: apiUrl,
  APP_DB_PATH: e2eDbPath,
  BOOTSTRAP_SETUP_KEY,
  // The E2E suite signs in from one IP (127.0.0.1) many times per run; the
  // prod default auth limiter (30 req/15 min/IP) would 429 the last tests.
  API_AUTH_RATE_LIMIT_MAX_REQUESTS: "500",
  VITE_API_URL: apiUrl,
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : [["html", { open: "never" }], ["line"]],
  timeout: 30_000,
  use: {
    baseURL: webUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start our own Vite web server on the aligned port unless the user pointed
  // PLAYWRIGHT_BASE_URL at an externally managed non-loopback server — in that
  // case wait for the external server to be ready instead of starting one.
  webServer: [
    {
      command: "pnpm dev:api",
      env: sharedEnv,
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${apiUrl}/health`,
    },
    startOwnWeb
      ? {
          command: "pnpm dev:web",
          env: sharedEnv,
          reuseExistingServer: false,
          timeout: 120_000,
          url: webUrl,
        }
      : {
          url: webUrl,
          reuseExistingServer: true,
          timeout: 120_000,
        },
  ],
})
