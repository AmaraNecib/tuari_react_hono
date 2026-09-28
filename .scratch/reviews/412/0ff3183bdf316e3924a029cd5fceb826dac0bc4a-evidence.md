# #412 — verification evidence (final)

- branch: `feat/412-salary-days`
- base: `develop` @ `199798ba3d8300ab1a67da1d5591b2d4e5fd9aa8`
- final source SHA (reviewed HEAD): `0ff3183bdf316e3924a029cd5fceb826dac0bc4a`
- tier: High-assurance (financial calculation)
- mode: remote, lane does not push / open PR

## Review-tier record

- `debate` (High-assurance, PR #420 00:11Z requirement):
  `0ff3183…-debate.md`. Critic + defender, parallel read-only. The money math
  held; the one real finding (canonical date vs `dd/MM/yyyy` picker) was fixed.
- `code-review` (Standards + Spec): `0ff3183…-code-review.md` (axes run against
  `988493d`; round-1 and round-2 deltas appended).
- `test-audit` (edge/coverage/quality): `0ff3183…-test-audit.md` (round-1 and
  round-2 deltas appended).
- Local Greptile CLI: skipped by parent decision (trial quota exhausted); the
  hosted PR review is the independent gate.

## Round 2 (debate fix, source 0ff3183)

Re-pinned from the round-1 evidence (`c9268e2`) after the rebase (`246f541`),
the debate fix (`25094b0`), and the wisdom capture (`0ff3183`, doc-only). The
code and test changes are in `25094b0`; `0ff3183` only adds
`.agents/wisdom/testing.md`. Commands on the reviewed source, `--maxWorkers=2`
where applicable:

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @tuari/contracts build` | 0 | ESM + DTS success |
| `npx vitest run --maxWorkers=2` (contracts) | 0 | 5 files, 191 passed |
| `npx vitest run --maxWorkers=2` (web, full) | 0 | 81 files, 664 passed |
| `npx vitest run src/modules/company src/infrastructure/database --maxWorkers=2` (api) | 0 | 19 files, 480 passed, 1 skipped |
| `npx vitest run --maxWorkers=2` (api, full) | 0 | 74 files, 1370 passed, 1 skipped |
| `pnpm typecheck` (turbo) | 0 | 4/4 tasks |
| `pnpm lint` | 0 | 2/2 tasks; unslop PASS (0 errors, 1648 warns) |
| `npx playwright test tests/e2e/salaries.spec.ts --reporter=line --workers=1` | 0 | 2/2 passed (30.4s) |

The two new regression tests
(`add-salary-payment-dialog.test.tsx`, `employee-details-page.test.tsx`) are
included in the web run above. Ports 3000/4318 were free before the E2E run, so
it ran locally rather than deferring to CI.

The full API suite was also run at the capped `--maxWorkers=2` and was green:
the documented load-flaky files (`app/dependencies.test.ts`,
`modules/auth/adapters/sqlite-bootstrap.port.test.ts`, and the web
`app-shell/home-view.test.tsx`) did not fire this run.

## Round 1 review delta (PR #420)

This round fixes the six findings from the PR #420 review:

1. `deriveSalaryProjectDays` now floors each line and distributes the
   remaining days by largest fractional part (largest-remainder/Hamilton)
   instead of rounding and correcting the largest line. A correction can no
   longer drive a line negative/dropped and leave the paid days
   over-allocated. New tests: five projects / 3 paid days, all-round-up, and
   fractional-tie cases.
2. `listSalaryPayments` reads splits through an inner join on
   `employee_salary_payment` instead of an `IN (…)` list of payment ids, so the
   query's bound-variable count no longer grows with the window. New SQLite
   tests: split round-trip, and a window of `MAX_VARIABLE_NUMBER + 2` payments.
3. The employee table and the employee details page now pass the project list
   and the per-employee assignment windows into the payment dialog, so a
   payment started from an employee view can be allocated.
4. The employee-details quick-payment form captures the day count and derives
   the expected/paid proposal from it instead of always storing 30 (MONTHLY)
   or 1 (DAILY).
5. The WEEKLY salary-period option is keyed on the stored period, not the
   draft, so a legacy weekly employee can be set back to WEEKLY.
6. The saved split is asserted against the SQLite-backed path in the API test
   and read back from the E2E database after submit.

## Round 1 commands

| Command | Exit | Result |
| --- | --- | --- |
| `npx playwright test tests/e2e/salaries.spec.ts --reporter=line --workers=1` | 0 | 2/2 passed (39s) |
| `pnpm --filter @tuari/contracts test` | 0 | 191 passed |
| `pnpm --filter @tuari/contracts build` | 0 | ESM + DTS success |
| `pnpm typecheck` (turbo) | 0 | 4/4 tasks |
| `pnpm lint` | 0 | 2/2 tasks (incl. i18n keys, hygiene, unslop) |
| `pnpm check:unslop` | 0 | PASS (0 errors) |
| `npx vitest run src/modules/company --maxWorkers=2` (api) | 0 | 12 files, 356 passed |
| `npx vitest run src/modules/company/sqlite-company.repository.test.ts` (api) | 0 | 33 passed (includes the split/bound-limit tests) |
| `pnpm --filter @tuari/web test` | 0 | 77 files, 641 passed, 0 failed |
| scoped coverage `packages/contracts/src/salary-days.ts` | 0 | 100% stmts/branches/funcs/lines |
| scoped coverage `apps/web/.../salary-payment-form.ts` | 0 | 100% stmts/lines/funcs; branches 86.48% (pre-existing `resolveSalaryPaymentPeriod` gaps) |

The full API suite at vitest's default 11 workers failed 12 tests across 4
pre-existing load-flaky auth/update files (timeouts). Re-running
`src/modules/auth src/modules/update` scoped with `--maxWorkers=2` leaves only
the documented `sqlite-bootstrap.port.test.ts` cross-connection write-lock
contention test (5s timeout, #196/#212/#259) still timing out on this host. The
touched `src/modules/company` suite is green.

## E2E round 1 (`tests/e2e/salaries.spec.ts`, commit c9268e2)

- Test 1: seeds a monthly worker (30 000 DZD) with an open-ended project
  assignment, opens the payment dialog, asserts the proposal equals
  `salary/30 x days` (30 000 at 30 days, 27 000 at 27), the split line is
  prefilled from the assignment, and the unallocated remainder is 0.
- Test 2: hand-edits the split, shrinks the paid days so the split
  over-allocates, asserts the warning and a disabled submit, slides the days
  back, submits, asserts the payment appears in the history with 12 days, and
  then reads the persisted split back from the SQLite database
  (`readSalaryPaymentSplitsByEmployeeId`) to prove the project id and 12 split
  days survive the insert and read paths.

## Review-tier record (round 1, superseded by the round-2 record above)

- `code-review` (Standards + Spec): `c9268e2…-code-review.md` (axes run against
  `988493d`; round-1 delta appended).
- `test-audit` (edge/coverage/quality): `c9268e2…-test-audit.md` (round-1 delta
  appended).
- `debate`: skipped by parent decision (spec settled with the user).
- Local Greptile CLI: skipped by parent decision (trial quota exhausted); the
  hosted PR review is the independent gate.

## Not verified / known boundaries

- `salary-payment-form.ts` keeps pre-existing uncovered branches in
  `resolveSalaryPaymentPeriod`; the new `parsePositiveInteger` helper is fully
  covered.
- The full API suite's auth/update timeout flakes are pre-existing and are not
  a coverage or correctness signal for this change.
- The E2E suite ran on a free-port host; CI may retry it once for the known
  load flakes.

## Meaning change confirmed (parent note 3)

`expectedAmountDzd` used to store the raw `salaryAmountDzd`; it now stores the
prorated proposal for the entered `days`. Legacy rows are never recomputed: the
migration only backfills `days = 30`, and
`apps/api/src/infrastructure/database/schema-migrations.test.ts` proves a legacy
row reads back with unchanged `expected_amount_dzd` / `actual_amount_dzd` and
`days = 30`. `actualAmountDzd` remains the authoritative paid amount.
