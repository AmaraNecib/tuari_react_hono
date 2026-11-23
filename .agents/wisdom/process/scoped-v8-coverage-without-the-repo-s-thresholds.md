## Scoped v8 coverage without the repo's thresholds (🟡 Minor)

`vitest.config.ts` gates 100% coverage only on `src/modules/{workforce,invoice}`. To measure
a different file set (e.g. the config module) without tripping the thresholds:
`pnpm exec vitest run --coverage --coverage.include="src/config/**/*.ts" ... --coverage.thresholds.100=false --coverage.reporter=text`.
The report is per-file; use the "Uncovered Line #s" column to hunt branches. Files fully
covered may drop out of the table between runs. Re-check with the raw report.

