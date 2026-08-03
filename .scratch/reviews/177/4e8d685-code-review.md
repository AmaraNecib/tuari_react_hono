# Code Review — issue #177 Phase 4 (debts workspace query segmentation)

**Base:** `f93c37c` · **Head:** `04d905b` · **Commits:** eee4dea, d3adf5f, 04d905b
**Tier:** Standard · **Method:** two parallel sub-agents (Standards + Spec)

## Standards

No hard violations of documented repo standards. Deep-module shape
(`debts-queries.ts`: 2 hooks + 2 pure builders behind a small interface,
mirroring the inventory-hooks precedent) and query-key invalidation sync
(party-detail key is a `debtsDetail` prefix) confirmed.

Judgement calls (baseline smells, non-blocking, accepted):

- **Duplicated Code** — `requireEntitySuccess` re-implemented locally in
  `debts-queries.ts`, drifting from the copies in `workspace-mutations.ts` /
  `employee-debt-hooks.ts` / `inventory-hooks.ts`. This is the repo's
  established pattern (4 local copies already); extracting a shared helper
  across all four is out of scope for this PR.
- **Middle Man** — production query code imports `AppMutationError` from
  `mock-dashboard`; precedent exists in `employee-debt-hooks.ts`.
- **Behavior-preservation note** — worker hub `caseCount` = `openDebtCasesCount
  + settledDebtCasesCount` (old: `accounts.length`); equivalence relies on the
  server invariant that `listDebtsSummary` builds parties from all debt
  accounts and counts OPEN status per account (verified in
  `finance.service.ts`).
- `partyId ?? "missing"` query-key sentinel — harmless; partyType
  disambiguates.

## Spec

All five requirements verified against issue #177 Phase 4 + design doc:

1. **Each consumer points at its narrow domain query** — debts hub
   (`useDebtsSummaryQuery` + `buildDebtsHubRows`), externals list
   (`buildExternalCounterpartyRows`), employee debts tab + external detail
   (`useDebtPartyDetailQuery`) — wired in
   `home-view-page-content-detail-pages.tsx`.
2. **Shrink the snapshot fetch** — `useDebtAccountsQuery` dropped from the
   composite; `debtAccounts: []` / `debtEntries: []` kept only for
   `WorkspaceSnapshot` type compat; `externalCounterparties` retained for
   shell selection. No leftover consumers of the deleted derived debts
   collections (grep-verified).
3. **Invalidation freshness** — new queries key off
   `workspaceDomainQueryKeys.debtsSummary` / `debtsDetail`, which every debts
   mutation invalidates; `externalCounterparties` added to the two create
   mutations' invalidation.
4. **Tests** — 30 unit tests in `debts-queries.test.ts` (builders + hooks,
   error/disabled states); Playwright debts spec rewritten for the full flow.
5. **Behavior preservation** — zero-account externals stay visible via the
   explicit join; totals semantics match the old derived builder; ledger
   entries now actually render (previously hardcoded `[]` in the composite).

Notes (low, accepted): synthetic `accountId` keys are React keys only; a
pending summary renders an empty hub briefly before first data (no shell-level
block); E2E serial reuse is safe under the Playwright config (`workers: 1`,
`fullyParallel: false`).

**Summary:** Standards — 3 judgement calls, worst is duplicated
`requireEntitySuccess` (pre-existing repo pattern). Spec — 0 findings, all
requirements met.

---

## Post-evidence delta (4e8d685 — Greptile round)

Greptile (4/5) flagged that `useDebtPartyDetailQuery` returned entries in
server order. Fixed by sorting through the shared `sortDebtEntries`
(entryDate desc, createdAt desc) in the hook's assembly — identical to the
server's `listDebtEntries` order and the old composite-derived builder, so
the ledger renders identically regardless of adapter. Covered by a new unit
test with out-of-order fixtures. No spec/standards impact; all prior
findings stand.
