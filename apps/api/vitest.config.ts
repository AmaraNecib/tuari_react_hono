import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the API.
 *
 * - Uses v8 coverage provider (faster, more accurate branch tracking)
 * - Excludes test files, types, and adapters from coverage requirements
 * - Global coverage thresholds are 99% for statements, functions and lines,
 *   and 98% for branches under the narrow owner decision recorded in the
 *   #629 design note; the original 99% decision remains recorded in #543.
 */
export default defineConfig({
  test: {
    // Worker cap. Vitest defaults to (logical cores - 1) workers, which on a
    // 12-thread laptop starts 11 and starves everything else on the machine —
    // other agent lanes, the editor, the browser. Two workers keeps a suite
    // honest without taking the machine over; set VITEST_MAX_WORKERS when a
    // machine is dedicated to the run (CI sets it higher).
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 2),
    // The unit/integration suites exercise the WRITABLE paths, so they run with
    // the post-install trial status. The production default for a missing
    // status is `unknown` (fail closed, see parseLicenseStatus); that path is
    // pinned explicitly in infrastructure/license.test.ts, and any test that
    // sets its own TUARI_LICENSE_STATUS overrides this.
    env: {
      TUARI_LICENSE_STATUS: "trial",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        // Owner policy: branches 98%; statements, functions and lines remain
        // 99%. Only the branch floor changed; scope and other gates are intact.
        statements: 99,
        branches: 98,
        functions: 99,
        lines: 99,
      },
      include: [
        "src/modules/workforce/**/*.ts",
        "src/modules/invoice/**/*.ts",
        "src/modules/auth/**/*.ts",
        "src/modules/account/**/*.ts",
        "src/modules/payment/**/*.ts",
        "src/modules/expenses/**/*.ts",
        "src/modules/project-cost/**/*.ts",
        "src/modules/rbac/**/*.ts",
        "src/modules/backup/**/*.ts",
        "src/modules/company/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.types.ts",
        "**/adapters/**/*.ts", // Adapters are exercised through module tests
      ],
    },
  },
});
