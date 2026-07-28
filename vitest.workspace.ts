import { defineWorkspace } from "vitest/config"

/**
 * Vitest workspace configuration.
 *
 * Each workspace member is referenced by its package-level vitest.config.ts
 * which provides the correct environment (jsdom for web), path aliases,
 * and coverage settings.
 *
 * The root project explicitly excludes non-vitest test files:
 * - tests/ directory: contains node:test scripts (.mjs) and Playwright e2e specs
 * - Desktop .mjs tests: use node:test runner, not vitest
 */
export default defineWorkspace([
  "apps/api/vitest.config.ts",
  "apps/web/vitest.config.ts",
  "packages/contracts",
  {
    test: {
      name: "root",
      include: [],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/playwright-report/**",
      ],
    },
  },
])