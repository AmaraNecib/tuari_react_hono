import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the API.
 *
 * - Uses v8 to report statement, branch, function and line coverage
 * - Treats coverage as diagnostic; reachable scenarios and named failures decide acceptance
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
