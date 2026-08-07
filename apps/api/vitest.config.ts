import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the API.
 *
 * - Uses v8 coverage provider (faster, more accurate branch tracking)
 * - Excludes test files, types, and adapters from coverage requirements
 * - Sets thresholds so CI fails if coverage drops below 100%
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        // Coverage thresholds for the workforce deep module foundation (Issue #8).
        // As we add more modules, expand `include` to cover them too.
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
      include: [
        "src/modules/workforce/**/*.ts",
        "src/modules/invoice/**/*.ts",
        "src/modules/auth/**/*.ts",
        "src/modules/account/**/*.ts",
        "src/modules/payment/**/*.ts",
        "src/modules/rbac/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.types.ts",
        "**/adapters/**/*.ts", // Adapters are exercised through module tests
      ],
    },
  },
});
