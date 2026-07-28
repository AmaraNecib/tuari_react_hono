import { defineConfig } from "vitest/config"
import path from "path"

/**
 * Root-level Vitest configuration.
 *
 * The monorepo uses per-package vitest.config.ts files for package-specific
 * settings (aliases, environments, coverage). This root config:
 * 1. Delegates to `vitest.workspace.ts` for multi-project orchestration
 * 2. Excludes non-vitest test files (node:test scripts, Playwright e2e specs)
 */
export default defineConfig({
  test: {
    include: [],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/playwright-report/**",
      "tests/**",
      "apps/desktop/**",
    ],
  },
})