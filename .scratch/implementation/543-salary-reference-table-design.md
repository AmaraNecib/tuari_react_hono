# Issue #543: salaried-worker reference display

- Base: `a7c9948b4a1dc6252cc8c3aa06ae2023a123d079`
- Worktree: `D:/worktrees/tuari_react_hono/t3-c92d46c6-9e2d1711493c4891`
- Scope: original salaried-workers table only; focused-local / CI-final-pending; high-assurance exact UI.
- Contract: each row carries `salaryReference: { period, amount: string } | null`. DAILY is an exact four-place unit price; WEEKLY and MONTHLY are exact two-place money. Zero is present data. Null is no reference. The reference is not approved earnings or a monthly liability/cap.
- Implementation: keep search, project and period filters, pagination, row order, empty states, date and action callbacks intact. Filter by `salaryReference.period`. Format DAILY through the existing unit-price parser/formatter; format WEEKLY/MONTHLY through `formatExactMoney`. Apply the user's grouping preference and the shared `CurrencyRun`. No numeric conversion or extra display module.
- Design: preserve the Arabic RTL table and existing shared primitives. No new seam moved; format logic stays private to the table.
- Proof: focused table interaction covers exact daily precision, zero versus null, and period filtering. Existing pagination, search, project filtering, empty state and actions assertions remain.
- Exclusions: no earnings dialog, other pages, derived/query/mutation modules, shared money or i18n changes, package changes, publication, or broad tests/builds.
- Wisdom: no matching `.agents/wisdom` lesson found for salaried-workers or exact salary display.
