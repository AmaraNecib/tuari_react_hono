# Issue 560: employee payroll debt presentation

Base `5b09d7213f5fd8d990a8b20cd3e5a80abdbca21f`. Owned worktree `D:/worktrees/tuari_react_hono/t3-a535314e-b7170e7a3b7dcf4c`.
Mode: focused-local / CI-final-pending. Live issue #560 read with `gh issue view` on this lane. High-assurance financial read and debt-direction risk. The parent owns sequential debate, test-audit and code-review sessions. No publication, merge, schema, public contract or financial writer changes are authorized.

## Domain and aggregate decision

Wages owed are payable to the employee. Advances owed are receivable by the company. Neither direction is silently netted. Unallocated earnings describe project attribution, not unpaid wages. Cash records can contain both a wage allocation and an advance; the display distinguishes their exact amounts and IDs. Explicit offsets and cash recoveries remain separate histories.

`ExactFinanceService.summary` includes all posted payroll and opening debt accounts already. `SqlitePayrollLifecycleReader` additionally returns approved earnings pending registration. The panel must not add its summary to the ledger summary or create registrations on reads. The UI explains the difference and preserves the existing ledger totals. A coherent cross-employee approved-plus-posted aggregate would need an owner-approved snapshot contract; this implementation does not pretend separate requests provide one.

No new domain term or glossary change is needed. Opening review remains authoritative; an empty current earning list says nothing about the opening balance. Unknown opening balances retain the existing reminder.

## Module and caller decisions

The active caller is `ExactDebtsPage`, used both globally and inside employee and external details. The payroll module takes internal-worker options and an optional scoped party. It owns selected identity, fallbacks after list changes, loading/error/retry, exact rendering and bounded history pages. External scoped views do not mount it. The existing workspace query wrapper supplies session isolation; the payroll hook now disables empty employee IDs. One selected employee is fetched, not one request per employee on mount.

The module earns its interface by keeping payroll read and history state out of the ledger page. Deleting it would move that complexity into the page and its scoped callers. The private History module shares pagination across the five collections without exporting another seam. No financial adapter or storage interface changes. The employee link opens the financial tab with period and settlement IDs shown in the panel. AppDate, NativeSelect, unique React IDs and exact MoneyValue formatting use existing conventions.

Approval already invalidates the selected payroll query. Existing payroll mutations invalidate both payroll and exact-debt queries. No extra invalidation or writer is needed.

## Proof

Recovered the parent's two behavioral tests before editing and reproduced both failures. Preserved the earlier missing-contracts setup failure separately. Corrected invalid period and nested advance accesses, false empty-list zero, selected identity handling and cash attribution.

Focused React proof covers 60,000 earned, 20,000 remaining, separate 5,000 advance and unrelated 15,000 attribution; opening wages without current earnings; loading/error/retry; genuine zero and unknown opening; selected employee, removed options and scoped identity; paginated payment records and exact wage allocation versus cash total. Query tests cover empty/session gating and session identity changes. Existing ledger tests preserve search, pagination, permissions, producer write restrictions and exact aggregates. Their router/payroll mocks isolate the ledger contract from the separately tested panel.

The authenticated normal-root database test uses real recorded payments and disk reopen twice. It proves 60,000 project labor cost stays unchanged, a separate paid 15,000 unallocated period is not unpaid, wage balance 20,000 becomes zero, advances remain 5,000, duplicate payment requests return the same records, repeated reads do not write, and final settlement does not add another account. The browser case uses an independently reachable 60,000 earning with 15,000 unallocated, 40,000 wage cash and 5,000 advance. It renders the real debt route, exact allocation history, mobile layout and zero after settlement/reload.

The selector fails closed to full due to the API integration-test path. Local scope intentionally remains the new connected browser case, not the full browser suite: no production API or financial implementation changed. Full CI acceptance remains pending. Desktop and 390px mobile element crops were captured and the mobile crop inspected. IDs wrap without horizontal overflow. No invented before image.

## Evidence and boundaries

Ignored evidence is under `.scratch/reviews/560/`. `final-results.txt` and `extra-results.txt` record exact commands, exits and elapsed times. Final checks pass: 49 web tests, one selected API test with two unrelated existing cases skipped, web typecheck, connected-test typecheck, affected web/API ESLint, eight i18n checks and diff whitespace check. Browser retry passes one test after correcting a strict locator that matched both summary and remaining wage amounts. Preserve all earlier failed logs.

Parent dependency junctions reuse the frozen installed packages and built contracts; no manifests or lockfiles changed. Source fingerprints and the committed SHA are recorded in the ignored handoff. Valid exact-source executions are retained rather than rerun only to relabel their reports after commit.

Applied wisdom: never show a false zero for loading/error; exact deterministic money display. EOL lesson checked against the actual diff; no whitespace failure. Excluded unrelated aging, money-split and transaction-writer lessons because those algorithms did not change. No wisdom file is written by this lane.

Local implementation and execution proof do not constitute independent review, CI acceptance, protection enforcement or whole-issue closure. Protection was reported pending by the parent. Parent review and hosted gates remain open.

## Shared-database correction after hosted review

Greptile identified that the existing connected payroll case asserted every cash row in the shared file database. The new case adds two unrelated payments, so the original expectation fails when all three cases run together. Reproduced at published head 57901d0b: two cases passed and the payroll persistence case received three cash rows instead of its employee's one row. Earlier single-case proof did not cover this interference.

Scope the cash, offset and repayment persistence queries to their fixture employee, retaining the independent exact amount and one-row expectations. Explicitly select the fixture employee in the debt case instead of depending on employee-list ordering. No financial source, schema, test cleanup or database reset changes. Run the entire three-case connected file against one fresh shared database to cover cross-case coexistence, plus connected-test typecheck. Preserve red and green logs under ignored .scratch/reviews/560/shared-db-*. One fresh combined-delta review must carry forward unchanged initial conclusions before publishing this correction.

## Shell fixture correction after CI

Hosted Test Web failed two HomeView debt loading/error cases. Reproduced both failures locally: the generic workspace query mock supplied workspace metadata to the newly mounted payroll read, so reading opening.reminder threw before either ledger state rendered. Add a narrow useEmployeePayrollQuery mock to the existing partial payroll-hook mock in home-view.test.tsx. This keeps ledger loading/error controls independent without changing production guards or hiding malformed server data. Dedicated payroll component/query tests and the authenticated browser case still cover real payroll wiring. The whole HomeView file plus payroll component/query files pass 73 tests after the correction. Preserve hosted and local red logs. A fresh combined-delta review covers this additional test-fixture fix before publication.

## Manager visibility and finance navigation correction

Hosted review found two production integration omissions. The global debt caller supplied worker-only debt parties to payroll, omitting project and warehouse managers with approved earnings. Keep existing manual-debt parties unchanged and pass all employee options through a separate payrollEmployees prop. Scoped employee/external views retain their existing behavior. The employee details tab identifier is finance, not financial; fix the link and verify the displayed selected tab and payroll region after clicking it.

The connected debt case now creates a project manager, selects that manager on the global debts page, proves the same balances/history and clicks through to the actual finance tab. The existing three-case shared-database run passes after these changes. A route regression asserts manager payroll options remain independent of empty manual-debt parties. Five affected web files pass 110 tests; web typecheck passes. No schema, new RPC, writer, or aggregate changes. Earlier reviews cover their pinned source only; obtain one fresh combined review at this final committed delta and explicitly reassess the interface and proof before publication.

## Standalone ledger fixture scope

After merging current develop, hosted review identified a separate standalone browser caller. Its synthetic schema and bridge provide debt operations only, and it mounts ExactDebtsPage without a router. The new employee payroll Link crashes that fixture and its payroll read would bypass the controlled bridge. Reproduced the missing ledger plus null isServer router error in standalone-red/failure.json; optimizer warmup errors are preserved separately in the same attempt.

Use the existing separate payrollEmployees interface to pass an explicit empty payroll list in this debt-only fixture, keeping its worker ledger party and every ledger assertion intact. This is an explicit test-scope choice, not a production feature flag or removal of employee coverage. The authenticated connected suite continues to test real payroll requests and navigation. Add a fixture browser guard against uncontrolled payroll RPCs. The complete standalone ledger browser proof passes with zero errors under standalone-green/result.json. No production source changed.

Reassessed integration scope after repeated corrections: callers now include the global route, scoped detail routes, shell unit fixtures and this standalone synthetic ledger. Keep payroll dependencies out of the debt-only bridge rather than fabricate payroll records for its employee-id-only schema. This reuses the explicit employee-list seam and avoids adding router/API fakes unrelated to the fixture's contract. Retain prior connected proof; obtain one bounded combined review of this fixture correction.
