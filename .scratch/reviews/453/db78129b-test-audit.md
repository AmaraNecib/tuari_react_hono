# Test audit — #453 extract the per-tab salary table modules

Base: `551948e4` (`origin/develop`). Reviewed HEAD: `db78129b`.
Three fresh-context reviewers: edge-case hunter, coverage analyst, test-quality
reviewer. The parent then ran the mutation claims itself instead of trusting
them.

## Are the module tests testing the modules?

Yes. `salary-payments-table.test.tsx` imports `./salary-payments-table`,
`salaried-workers-table.test.tsx` imports `./salaried-workers-table`, and
`salary-table-primitives.test.ts` imports the pure helpers. The callbacks are
spies, so no shell or dialog wiring is involved. The prefix is the shell test's
job.

## Is the equivalence check real?

`salaries-section.test.tsx` keeps every pre-existing assertion and adds one. It
still exercises both tabs — the worker tests click the workers tab, the payment
tests use the default recent tab and explicit "آخر دفعات الرواتب" clicks. Its
singular `getByLabelText("بحث باسم العامل...")` only resolves because `hidden`
removes the inactive table from the accessibility tree, so the shell test also
pins the keep-mounted mechanism.

## Gaps found and closed

The reviewers found that several filter predicates and reset dependencies could
be deleted with every test still green. The parent confirmed each by mutation
and closed them in `db78129b`.

| id | gap | verdict | closure |
| --- | --- | --- | --- |
| T1 | Payments `workerFilter` predicate and its reset dep had no test. | confirmed (mutation stayed green) | new "filters by worker and resets to page 1"; the fixture gives one worker 15 rows so the filtered result spans two pages |
| T2 | Payments `periodFilter` predicate and its reset dep had no test. | confirmed | new "filters by period and resets to page 1" |
| T3 | A payment with a null `periodType` under a period filter was unpinned. | confirmed | new "excludes a payment with no period when a period filter is set" |
| T4 | Worker `search` and `projectFilter` reset deps had no page assertion. | confirmed | search test filters to an unchanged page count then asserts page 1; project test assigns 15 workers so the filter spans two pages |
| T5 | The search reset test on the payments tab filtered to one row, so the page clamp masked a deleted reset dep. | confirmed (mutation stayed green) | search test now widens the page count first ("عامل " matches all 23) and asserts page 1 |
| T6 | The `—` placeholder assertion was confounded by the last-payment dash on every row. | confirmed | scoped to the no-wage row and asserted that row carries no digit |
| T7 | The "…and last payment" test name promised a date assertion it never made. | confirmed | added a `2026` date assertion on the monthly worker's row |
| T8 | Worker `onEditSalary` wiring had no module test (81.8% funcs). | confirmed | new "routes the edit action through onEditSalary" |

## Mutation claims — all re-run by the parent

Each run mutated one line and ran the owning test file; the source was restored
after each.

| mutation | result |
| --- | --- |
| payments: drop `workerFilter` from `resetPageDeps` | exactly "filters by worker and resets to page 1" fails |
| payments: drop `periodFilter` from `resetPageDeps` | exactly "filters by period and resets to page 1" fails |
| payments: drop `normalizedQuery` from `resetPageDeps` | exactly "windows its own rows and resets to page 1…" fails |
| payments: drop `projectFilter` from `resetPageDeps` | exactly "filters by project and resets to page 1" fails |
| workers: drop `normalizedQuery` / `projectFilter` / `periodFilter` (one at a time) | exactly the matching reset test fails each time |
| payments: delete the `workerFilter` predicate clause | exactly "filters by worker and resets to page 1" fails |
| workers: delete the `periodFilter` predicate clause | exactly "filters by period and resets to page 1" fails |
| primitives: change the `WEEKLY` label key to the `DAILY` key | exactly the two mapping tests fail (`maps every period…`, `gives every period a distinct label…`) |
| shell: check the extraction head before `a489b24c` | the new tab-state test fails at the page assertion; passes after the fix |

The design-pass claim "drop a filter from a reset dependency and exactly the
reset test fails" was false for the payment search and worker worker-filter
cases until T1/T5 fixed the fixtures — the page clamp hid a missing reset. That
is the correction this audit contributes.

## Coverage (scoped to the three extracted modules)

Command: `vitest run --coverage --coverage.include=<each module> …` over the four
salary test files.

| file | stmts | branch | funcs | lines |
| --- | --- | --- | --- | --- |
| salary-table-primitives.tsx | 100 | 100 | 100 | 100 |
| salary-payments-table.tsx | 97.82 | 94.11 | 94.44 | 97.61 |
| salaried-workers-table.tsx | 90 | 100 | 81.81 | 88.88 |
| total | 95.91 | 96.92 | 92.68 | 95.4 |

## Quality

Grade B before this round, improving after. No vacuous assertion remains; every
reset dependency and every filter predicate now has a failing mutation behind
it. Duplicate fixtures across the three files are deliberate isolation, not a
defect.
