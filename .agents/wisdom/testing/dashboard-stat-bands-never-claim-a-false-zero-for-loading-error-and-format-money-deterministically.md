## Dashboard stat bands: never claim a false zero for loading/error, and format money deterministically (🟠 Major)

Issue #23 added business counters (open invoices, outstanding debt balance,
item count, counterparty count) to the dashboard StatBand by aggregating from
the existing feature-scoped queries (debtsSummary, inventory invoice groups,
item definitions) inside the lazy `dashboard-section.tsx`, plus one
snapshot-derived metric in `buildHomeViewDerived`. The review (edge-case
hunter + Greptile) caught two render-truth problems:

1. Reading only `query.data` and defaulting to 0 means a **pending** or
   **errored** query shows "0 د.ج" — indistinguishable from a genuinely
   empty account, and worse: a busy account flashes 0 → real values.
   Fix: gate on `isPending` ("…") and `isError` ("—") so the stat card never
   claims a number it does not have. Dashboards are summaries; density-first
   does not mean lying about the data state. NB (post-review): gate the
   error placeholder on `isError && data === undefined` — a background
   refetch that fails after data loaded keeps the retained value; isError
   alone would hide valid totals.
2. Bare `toLocaleString()` (runtime locale) is nondeterministic — Arabic
   users can get Arabic-Indic digits ١٬٥٠٠ or different grouping. The repo's
   money convention is `toLocaleString("ar-DZ")` (audit-log, transfer pages,
   invoices) — use it, and pin the rendered string in a test.

**Always**: when a stat band card aggregates from a query that can be
pending/failed, never project a placeholder zero; show "…"/"—"; and route
money through `toLocaleString("ar-DZ")` exactly like the rest of the app.
Also make render-test values distinct (openInvoices=1 vs items=1 collides and
hides a wiring swap).

