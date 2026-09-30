# #414 — code review (Standards + Spec)

HEAD reviewed: `d06ffee0184ef5cdb4d87bc63e50a00eb3839490`
Base: `55b71181a493fcfe413b2375b1901e1a36f66513`
Tier: High-assurance. Two independent axes (parallel reviewers; the spec axis
was re-run once because its first child returned empty output).

## Standards axis

Hard violations / judgement calls, and disposition:

| Finding | Decision |
| --- | --- |
| **Missing E2E** (`docs/engineering-workflow.md` §3: every user-facing feature includes a Playwright test). | **Deferred to a follow-up, flagged to the parent.** The lane brief explicitly constrained Playwright ("only if you must", one E2E lane per round); the component + service + adapter + integration + router tests cover the behaviour. Recommend `tests/e2e/project-cost.spec.ts` as a follow-up (pattern: `tests/e2e/expenses.spec.ts`). |
| SQLite adapter is raw `better-sqlite3`, not Drizzle (`docs/ARCHITECTURE.md`). | **Accepted deviation.** Mirrors the sibling read model `sqlite-expenses.repository.ts` (also raw); the doc is explicit but the surrounding convention is mixed. |
| Duplicated ordering: `sortByDateDesc` re-sorts what SQL already ordered. | **Fixed.** SQL `ORDER BY` removed; the service owns ordering; new out-of-order service test makes it falsifiable. |
| Duplicated error mapping: `project-cost.errors.ts` clones the inventory/company mapper. | **Accepted + follow-up.** Every module owns its `toFailureResult`; a shared `AppError` mapper is a cross-module refactor, out of this lane's scope. |
| Cross-module reach: `successResult` imported from `../company/company.helpers`. | **Accepted + follow-up.** Same note: promote `successResult` to a shared helper in a dedicated refactor. |
| Middle man: `parked.assets.map(identity)`. | **Fixed.** The records are returned directly (the contract row shape is the port record shape). |
| Duplicate shape: `getProjectCost(input: { projectId: string })`. | **Partially fixed.** The service accepts the exported `ProjectCostInput`; the RPC handler still casts because `queryAuth`'s handler input is `unknown` (the same cast every handler uses). |
| Ad-hoc JSX key for parked consumables (no id). | **Fixed.** `id` added to the contract row; `b.id` selected; the UI keys on it. |
| `SOURCE_BAR_CLASS` re-enumerates the four source keys. | **Fixed.** The bar class is inline in the single `sources` array. |

Correct per the reviewer: i18n keys all route through `t()` with matching
`ar.ts` entries; no hardcoded money strings; evidence files in the sanctioned
`.scratch/implementation/` and `.scratch/reviews/<id>/` paths.

## Spec axis

- **Missing/partial:** no spec-mandated test is missing (each source, the
  combination, no activity, unassigned-then-assigned all present). The design
  doc promised `tests/e2e/project-cost.spec.ts`; it is absent (see the E2E
  finding above).
- **Scope creep:** none material; parked inventory and the labelled bars are
  explicitly required; the bound guard and ordering are internal hygiene.
- **Implemented but wrong (1): salary day rate.** The spec identity
  `salary part = allocated days × day rate` does not literally survive a rounded
  non-whole day rate. Disposition: the share keeps the exact quotient and
  rounds once (matching the repo's round-once convention); the API's
  `dayRateDzd` is a displayed derivative and is **not** multiplied back; the
  misleading paired display was removed. The reviewer's "should prorate at
  salary/30" point is a category error — `computeProposedSalaryAmount` proposes
  a *payment* from the employee's wage, while the project cost splits the
  payment's *authoritative* `actualAmountDzd` by its own days.
- **Implemented but wrong (2): consumed = cumulative issuance.** Confirms the
  debate finding #1; reported to the parent as the one business-rule decision
  request (alternative: inventory-report entry valuation, a one-method change).

## Summary

Standards: 1 deferred (E2E), 1 accepted deviation (raw SQL), 2 accepted
follow-ups (shared error mapper / `successResult`), 3 fixed. Spec: 1 confirmed
business-rule ASK (consumed), 1 clarified-and-fixed display issue (day rate),
no scope creep.
