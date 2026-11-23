# Issue 176 M2: internal debt parties

Base: `e340e53b9cefd9fc367457d624a98d0eb9657f1b`. Verification mode: focused-local / CI-final-pending. Risk: debt counterparty eligibility; preserving employee IDs and existing financial command semantics is required. This slice changes only the active debts/debt-create route option construction in `apps/web/src/features/app-shell/home-view-page-content-detail-pages.tsx`. Existing SQLite `partyExists` accepts employee records without a role predicate, and the exact route maps `WORKER` options to `INTERNAL_WORKER`. No schema, financial semantics, or employee creation rules change. Invoices and other role-filtered features remain unchanged.

Proof required: a rendered debt form offers all employee roles, passes the selected ID through the existing create command, and unrelated role-filtered features retain their existing filters. CI acceptance and the three parent-owned review lenses remain pending.
