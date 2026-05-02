import { defineConfig, devices } from "@playwright/test"

const apiUrl = "http://127.0.0.1:4318"
const webUrl = "http://127.0.0.1:3000"
const e2eDbPath = `./data/tuari.phase1.integration.${Date.now()}.sqlite`

const sharedEnv = {
  ...process.env,
  API_HOST: "127.0.0.1",
  API_PORT: "4318",
  ALLOWED_ORIGINS: `${webUrl},http://localhost:3000,http://localhost:1420,http://127.0.0.1:1420,https://tauri.localhost,tauri://localhost`,
  BETTER_AUTH_SECRET: "tuari-foundation-secret-1234567890",
  BETTER_AUTH_URL: apiUrl,
  APP_DB_PATH: e2eDbPath,
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
  webServer: [
    {
      command: "pnpm dev:api",
      env: sharedEnv,
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${apiUrl}/health`,
    },
    {
      command: "pnpm dev:web",
      env: sharedEnv,
      reuseExistingServer: false,
      timeout: 120_000,
      url: webUrl,
    },
  ],
})
