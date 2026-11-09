# Issue #483: expense period shortcut

## Scope and authority

Worktree: `D:/worktrees/tuari_react_hono/t3-9529e1bc`.
Branch: `fix/issue-483`. Base: `ec0064c77c9ce381534c45327d04e1ebae35e712`, freshly fetched `origin/develop`.
Spec: #483 and item 4 of #473. Implement locally; publication and merge are not requested.
Verification mode: `focused-local / CI-final-pending`.
Review tier: high-assurance. Incorrect date bounds can hide expenses or misrepresent money totals, although no accounting write changes.

## Behavior and interfaces

The existing ExpensesPage filter/query interface and buildExpenseFilters are the regression seams. Filters open empty. A current-month toggle sets the first and last calendar days of the current Algeria month. Clicking the active toggle clears both date fields, not project or worker selections. Manual date edits determine the pressed state by equality with the month range, not a separate flag. Calculate the month at interaction time so an old open page does not apply a stale month.

The first KPI says all-time when the outgoing query has no date bounds, including project-only or worker-only filters. Either bound gives the existing period wording. The query remains the source of all amounts; no client-side accounting is added.

Current month means the whole calendar month, not month-to-date. Use canonical yyyy-MM-dd state and the existing inclusive Algeria-day conversion. Month-end calculation must cover leap years, December and the UTC/Algeria month boundary.

## UI

An operator uses the existing Arabic RTL expenses screen at a desk to find period spending. Keep the existing theme, compact wrapping filter bar and standard Button. Put the labelled toggle beside the date pickers, with aria-pressed and the same selected styling as the grouping toggle. Add explicit picker IDs for accessible labels. No redesign or dependencies.

## Design and architecture

Vocabulary stays unchanged: expense, date range, project and responsible worker. The telemetry-only root glossary does not describe this domain and is left alone. A small pure month-range helper lives beside the existing expense-filter builder and hides timezone and month-length rules. Deleting it would move those calendar details back into the page. No new adapter or configurable seam is needed. No shared date-picker behavior changes.

## Proof

Use failing-first component proof for default all-time wording and the toggle query bounds, plus fixed-date helper cases. Cover turning off, partial/manual ranges, preserved non-date filters and real translation resources. Run focused expense/date tests, changed-file lint, web typecheck and the E2E selector. Select only expenses browser cases for integration proof. Full suites and production builds remain CI-final. The selector returns full because the Arabic resource file is a critical path; the local run is deliberately narrowed to the expenses case because only two expense translation entries changed. CI retains its independent full-scope decision. Contracts compilation is a prerequisite for web typechecking in this fresh checkout. The installed impeccable skill references a missing product.md register file; use existing DESIGN.md and component conventions rather than inventing replacement instructions.

Three separate read-only review sessions run debate, test-audit and code-review at the committed head. Reports and execution logs stay ignored under `.scratch/reviews/issue-483/`.

## Applied lessons

Use inclusive Algeria end-of-day bounds, canonical picker values without bridges, and actual Arabic resources rather than translation fallback mocks. Existing builder and picker source confirm these lessons still apply.
