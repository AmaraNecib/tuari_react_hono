# Debt summary measurement

This is a local baseline for the shared exact-debt aggregate used by the debt summary and dashboard. It does not complete issue #175; keep that issue open.

## Reproduce

From the repository root, restore pinned dependencies with `pnpm install --frozen-lockfile` if needed, build `@tuari/contracts` if its output is absent, then run:

```powershell
pnpm --filter @tuari/api exec tsx scripts/measure-debt-summary.ts
```

The opt-in harness creates a temporary plain (unkeyed) SQLite database. It seeds 1,000 distinct synthetic external counterparties and 1,000 live debt accounts, alternating 500 PAYABLE accounts at 10.01 DZD and 500 RECEIVABLE accounts at 20.02 DZD. Independent expected gross totals are 5,005.00 DZD payable and 10,010.00 DZD receivable. It checks SQL row counts for counterparties, accounts and live entries, then validates summary totals.

The first-call figure measures the first `summary()` invocation after seeding, on the already-open connection. Seeding warms operating-system and SQLite caches; this is not a cold-cache measurement. Five subsequent calls warm the service, followed by 30 measured calls. Result validation runs outside each timed interval. p50/p95 use nearest-rank quantiles: sorted sample at `ceil(p*n)-1`.

## Baseline

Implementation base SHA: `baaca20ef708cdf5dfa31538e609f153254a3fba`. The measured harness source blob was `5cd173391d3380b634826dfe71869dbb3c778c93`.

On Node v22.23.2, Windows x64, Intel64 Family 6 Model 158 Stepping 13, with SQLite 3.51.2: first invocation **110.023 ms**; p50 **85.7061 ms**; p95 **119.7945 ms**; min **78.6454 ms**; max **136.1123 ms**. The dataset contained 1,000 parties, 1,000 accounts and 1,000 live entries; totals were 5,005.00 DZD payable and 10,010.00 DZD receivable.

The harness was later relocated from `apps/api/src/modules/company/measure-debt-summary.ts` to `apps/api/scripts/measure-debt-summary.ts` so this opt-in executable is outside the API source coverage set. The historical JSON and stdout transcript were recovered from the T3 tool transcript at `.scratch/reviews/175-readiness/recovered-run-4/`; the moved harness source was not the source blob measured. They were not saved by the measurement process as runtime logs; native exit metadata and duration were not recorded in that recovered transcript. The worker reported exit 0. The temporary fixture directory printed by the harness was `C:\Users\sensei57\AppData\Local\Temp\tuari-debt-summary-measure-v6bVtL`.

## Scope and limits

This measures `ExactFinanceService.summary()` with `SqliteExactFinanceRepository` against a temporary plain SQLite fixture. It is not full dashboard or network latency, desktop cold start, an encrypted-database build, or realistic all-entity memory usage. It is not a security review or complete #175 acceptance. The proof for merged PR #628 is reused and was not rerun.
