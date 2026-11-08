## Cap the test worker pool: the default takes the whole machine (🟠 Major)

Vitest sizes its worker pool from the CPU count, not from what the work needs.
In the version this repo pins (4.1.x) the run-mode default is
`availableParallelism() - 1` — **11 workers on a 12-thread laptop** (watch mode
uses half). Its own CLI help claims the default is `availableParallelism()`,
which is wrong; read the code in `node_modules/vitest` before trusting either
number. Either way the default is the whole machine: one `pnpm test` then
saturates the CPU, other agent lanes crawl, suites hit their hook timeouts, and
the load-flaky failures start firing — which cost more time than the extra
workers ever saved, and look like real regressions.

So every package that runs vitest pins `maxWorkers: 2` (`apps/api`,
`apps/web`, `packages/contracts`), overridable with `VITEST_MAX_WORKERS` for a
dedicated machine or CI; Playwright runs `workers: 1`; and the heavy one-shot
turbo tasks run with `--concurrency=2`.

**Always**: cap a test pool explicitly and keep the default small with an env
override. Note where the cap does NOT belong: turbo's `concurrency` key in
`turbo.json` is global, so setting it there also throttles `turbo dev` and can
leave persistent dev tasks waiting for a slot — pass it on the one-shot tasks
(`turbo test --concurrency=2`) instead.

