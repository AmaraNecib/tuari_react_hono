import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the API.
 *
 * - Uses v8 coverage provider (faster, more accurate branch tracking)
 * - Excludes test files, types, and adapters from coverage requirements
 * - Lines/statements/functions must stay at 100%; branches sit at a 99 safety
 *   floor so provably-unreachable defensive branches (see #242) do not force
 *   illegal-state tests or v8 pragmas. A genuinely impossible branch may be
 *   marked with a commented v8-ignore escape (see the thresholds note below).
 */
export default defineConfig({
  test: {
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
        // Coverage policy: ALL thresholds are strict 100% ("tests pass" keeps
        // its meaning). A provably-unreachable DEFENSIVE branch may be marked
        // with a commented `/* v8 ignore */` escape: v8 then excludes it from
        // the numbers, so any REACHABLE untested branch still fails the gate
        // while impossible defensive branches don't demand illegal-state
        // tests. (In-module: the #242 unreachable branches live in
        // src/modules/company/finance.service.ts, covered here, so the escape
        // applies in scope.) Do not lower the branch threshold: an aggregate
        // floor would let real gaps pass silently.
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
