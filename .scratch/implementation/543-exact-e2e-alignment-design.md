# Align managed E2E cases with the exact application root

## Scope and authority

Base af4b3e4fb16aa04eddaf4dea15d8468d3226c702 in D:/worktrees/tuari_react_hono/541-ci-gates-01. Owner authorized updating tests whose runtime behavior changed, not splitting E2E/CI configuration, blanket skips, license bypasses or numeric financial fallbacks. Verification mode remains focused-local / CI-final-pending. This commit changes test fixtures and existing E2E specs only; no application source, scripts selecting CI tests, coverage thresholds, package/lockfile or server contract changes. Other employee/placement/select integration specs still require diagnosis; do not claim full E2E acceptance.

## Fixture boundary

Exact normal startup rejects mixed/foreign schema. Old helpers wrote retired salary_amount_dzd columns and attempted deletes forbidden by append-only earning triggers. The managed fixture reset now explicitly recognizes the disposable tuari.phase1.integration.*.sqlite basename and known exact workspace version/table set. It reconstructs transactional tables inside one transaction with original schema/index/trigger definitions restored. Roles, permissions, workspace identity and schema remain unchanged. Unexpected tables/version refuse reset; failed reconstruction rolls back. This helper must never operate on the owner's original native database. The compatibility test proves seed/reset/identity/trigger preservation and refusal/rollback, not an application migration.

Seed helpers resolve the existing API native driver through createRequire, accept bigint exact salary reference units, and refuse a numeric salaryAmountDzd argument on the exact schema. They do not recreate legacy tables or install dependencies. External-API fixture skips remain the existing policy; no new broad skip or test-selection configuration is added.

## Changed acceptance cases

Supported project/warehouse cases exercise genuine production create/edit/detail components with existing manager selection. The exact application intentionally disallows numeric inline manager creation; the test does not demand it or bypass the ownership edit flow. Monthly salary approval asserts actual200, reload persistence of one62500DZD earning and one debt obligation, ordered A/B/A10000/37500/15000DZD segments and5/15/5days, plus project costs25000/37500DZD. No float-derived financial expected values.

Debt, expense and four inventory families are deliberately unavailable at this root. Their old monetary CRUD assertions cannot run on a root that refuses those contracts. Replacement cases require translated capability refusal in the actual UI and503 from the retired server operation, through a helper whose procedure names are typed to the retired contract difference. This is explicit deferred-capability proof, not financial CRUD completion. The unchanged old scenarios remain in Git history; no claim that unsupported workflows now work. See local supported-assertion-map-01.md for diagnosis mapping.

Snapshot tests now use scoped reference lists/capabilities rather than a retired numeric aggregate. Query-state cases target supported projects and warehouses and verify loading, visible error, no false empty success and Retry recovery. I18n checks cover supported/reference/earning and deferred-capability surfaces. Project wire validation checks actual400,160-character detail, retained161-character draft and unchanged route; it caught the independently committed real error-toast defect rather than weakening the assertion.

## Verification and review boundaries

Managed affected integration run: heavy_run run-affected-alignment-01.ps1, API4418/web3100, fresh disposable DB, thirteen changed spec files24passed in1.8minutes, exit0, log .scratch/reviews/543/e2e-align-01/affected-alignment-01.log. Shared dependency junction causes Vite font allow-list warnings; this was not a visual/font acceptance run. No screenshot claim. Earlier genuine failures are retained in separate logs.

Fixture compatibility5tests pass in1.06s; full API tsc and focused fixture lint exit0. Explicit strict ES2022/Bundler TypeScript check of all changed E2E specs/helpers exit0. This is pre-commit proof of the staged tree, not CI-final. No full local suite/build run. Original native4318 and original persisted62500DZD request are untouched. Generated apps/api/backups is not staged.

All three independent initial lenses must review the committed test scope, especially fixture safety and loss of reachable assertions. Current-head hosted verdict/CI still gate publication acceptance. Owner alone decides merge; no auto-merge even with5/5 and green checks.
