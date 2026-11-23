## Test fixture data must satisfy contracts schemas — vitest does NOT typecheck (🟠 Major)

Issue #30: a unit-test fixture added an asset with `condition: "GOOD"`, which
is not in `inventoryAssetConditionSchema` (`"NEW" | "USED" | "MAINTENANCE" |
"DAMAGED"`). Vitest transpiles without typechecking, so `pnpm test:web` (548
tests) stayed green, but `pnpm typecheck` failed on the next run and the
review evidence (Greptile verdict, review files named by SHA) had to be
regenerated — a mid-gate correction that churned commit history.

**Always**: when writing test fixtures typed by `@tuari/contracts` schemas,
verify literals against the schema enum/union before running the suite. Cost
of a mistake is higher than a red test: it surfaces at the guard typecheck,
invalidates evidence, and forces a Greptile re-run.

