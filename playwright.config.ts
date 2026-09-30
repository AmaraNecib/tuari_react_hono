import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

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

// The suite resets and seeds the database through the API's own DB file, so an
// externally managed web server must be paired with an explicitly named API.
// Without one, browser actions would read a different database than the specs
// mutate and the tests would pass or fail against the wrong environment.
if (!startOwnWeb && !process.env.PLAYWRIGHT_API_URL) {
  throw new Error(
    "PLAYWRIGHT_BASE_URL points at an externally managed server; set PLAYWRIGHT_API_URL to that environment's API so the suite and the browser read the same data.",
  )
}
// The direct-SQLite fixtures can only work against our own API: an externally
// managed environment has no local file for them to reset or seed, and quietly
// touching a stale local file would corrupt the wrong database.
process.env.E2E_API_MANAGED = startOwnWeb ? "1" : "0"

// Playwright evaluates this config in the runner AND in every worker process,
// so the path must be derived once and inherited — otherwise each process
// invents its own timestamp and the workers look for a database the API was
// never told to create.
const e2eDbPath =
  process.env.APP_DB_PATH ?? `./data/tuari.phase1.integration.${Date.now()}.sqlite`
// Share this run's database path with the workers. Two concurrent runs in one
// checkout would otherwise race to find "the newest" matching file and reset
// each other's fixtures (Greptile finding on this slice). Only a managed local
// API consumes this, so an external run never advertises a local file.
if (startOwnWeb) process.env.APP_DB_PATH = e2eDbPath

// #436: the backup-folder setting writes the user-editable config.json. Point
// the E2E API at a throwaway file so the durability assertion has a real
// config to write, and keep it out of the repo (apps/api/data is gitignored).
// Playwright re-evaluates this config in every worker, so the path is derived
// once and propagated through E2E_TUARI_CONFIG_FILE; a developer's own
// TUARI_CONFIG_FILE is never written.
const e2eConfigPath =
  process.env.E2E_TUARI_CONFIG_FILE ??
  resolve(process.cwd(), "apps/api/data", `tuari.e2e.${Date.now()}.config.json`)
if (startOwnWeb) {
  mkdirSync(dirname(e2eConfigPath), { recursive: true })
  process.env.E2E_TUARI_CONFIG_FILE = e2eConfigPath
  process.env.TUARI_CONFIG_FILE = e2eConfigPath
}

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
  TUARI_CONFIG_FILE: e2eConfigPath,
  BOOTSTRAP_SETUP_KEY,
  // The E2E suite drives the API without the desktop shell, so it must opt in
  // to a writable license explicitly: the API fails CLOSED (status `unknown`)
  // when TUARI_LICENSE_STATUS is absent.
  TUARI_LICENSE_STATUS: "trial",
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
    // An externally managed API is already running; only our own API needs
    // starting (and only when we start our own web server).
    ...(startOwnWeb
      ? [
          {
            command: "pnpm dev:api",
            env: sharedEnv,
            reuseExistingServer: false,
            timeout: 120_000,
            url: `${apiUrl}/health`,
          },
        ]
      : []),
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
