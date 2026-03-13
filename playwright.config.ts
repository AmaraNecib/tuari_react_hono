import { defineConfig, devices } from "@playwright/test"

const appClientKey = "tuari-desktop-client-key-v1"
const apiUrl = "http://127.0.0.1:4318"
const webUrl = "http://127.0.0.1:3000"

const sharedEnv = {
  ...process.env,
  API_HOST: "127.0.0.1",
  API_PORT: "4318",
  APP_CLIENT_KEY: appClientKey,
  ALLOWED_ORIGINS: `${webUrl},http://localhost:3000,http://localhost:1420,http://127.0.0.1:1420,https://tauri.localhost,tauri://localhost`,
  BETTER_AUTH_SECRET: "tuari-foundation-secret-1234567890",
  BETTER_AUTH_URL: apiUrl,
  APP_DB_PATH: "./data/tuari.playwright.sqlite",
  VITE_API_URL: apiUrl,
  VITE_APP_CLIENT_KEY: appClientKey,
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
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
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: `${apiUrl}/health`,
    },
    {
      command: "pnpm dev:web",
      env: sharedEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: webUrl,
    },
  ],
})
