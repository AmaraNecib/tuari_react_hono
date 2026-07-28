import { defineConfig } from "vitest/config"
import path from "path"

/**
 * Root-level Vitest configuration.
 *
 * Web tests need jsdom environment and @ alias for imports.
 * API/Contracts tests use node environment (which is vitest default,
 * so we only set jsdom when the test file is under apps/web).
 *
 * Tests from tests/ (node:test) and apps/desktop (node:test) are excluded.
 * Playwright e2e specs under tests/e2e/ are also excluded.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web/src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "apps/api/src/**/*.test.ts",
      "apps/web/src/**/*.test.{ts,tsx}",
      "packages/contracts/src/**/*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/playwright-report/**",
      "tests/**",
      "apps/desktop/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
})