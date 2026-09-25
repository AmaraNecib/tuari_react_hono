# Code Review — issue #23 (Standard tier)

- **HEAD**: f90f9df (evidence covers c4ee8df → f90f9df; review ran against the
  committed diff plus the working-tree review fixes)
- **base**: 389336a
- **Commits**: c4ee8df (feat: business counters), f90f9df (review fixes)
- **Spec source**: issue brief in lane task + `.scratch/implementation/23-design.md`
  (local snapshot does not carry #23; no plan.md/progress.md at root)

Two parallel axes (Standards / Spec), verbatim findings.

## Standards

1. **Correct (evidence)** — `dashboard-metrics.ts` sums `currentBalance` only
   when `status === "OPEN"`, exactly matching the finance service's
   accountOutstanding predicate; cross-reference verified.
2. **Correct (evidence)** — seam wisdom (`.agents/wisdom/architecture.md`,
   "Deepen a leaky view-model seam" #217) respected: only the snapshot-backed
   `counterparties` extends `buildHomeViewDerived`; debts/invoices/items
   aggregate from the sanctioned narrow queries instead of reaching into
   internal home-view-derived modules.
3. **Correct (evidence)** — four reused i18n keys verified in ar.ts
   (`shell.invoices`, `shell.itemsGuide`, `dashboardPage.outstandingDebts`,
   `sections.externals.label`); zero new strings (i18n-key lint passes).
4. Mild notes (judgement calls, no action): Shotgun Surgery (mild) — a stat
   card touches several files, but metrics+labels props are typed so drift is
   type-checked; Duplicated Code (mild, repo-wide convention) — inline `د.ج`
   formatting (now ar-DZ-consistent), no shared formatter exists; Feature Envy
   (weak) — cross-feature hook mounting matches the documented
   DebtsHubPage/InventoryInvoicesPage pattern.

## Spec

1. All six acceptance criteria implemented: open-invoices count, outstanding
   debt balance (OPEN-only, ar-DZ formatted), item count, counterparty count
   (snapshot-derived seam), existing cards kept, stat-band visual language
   unchanged.
2. Reuses existing queries (`useDebtsSummaryQuery`, `useInventoryInvoiceGroupsQuery`,
   `useInventoryItemDefinitionsQuery`, snapshot externalCounterparties) — no
   parallel query path created.
3. Labels reuse existing i18n keys — no new strings.
4. Unit/integration tests only (no Playwright this round, per lane split).
5. Notes: working-tree review edits (placeholders + ar-DZ) were uncommitted
   during the review run — now committed as f90f9df. The reviewer's claim that
   "finance.service does not exist" is incorrect: it lives at
   `apps/api/src/modules/company/finance.service.ts` (comment amended with the
   full path to prevent that confusion).
6. Minor, not blocking: negative-balance OPEN accounts untested — matches the
   debts module invariant (positive balance + direction), same as the finance
   service's own assumption.

## Summary

- Standards: no blocker (3 mild judgement-call notes).
- Spec: no blocker (1 false reviewer claim, corrected; 1 documented minor gap).