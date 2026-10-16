# #459 / PR #481 — code review at `f1e00278`

- mode: remote
- base SHA: `d6164c65`
- reviewed HEAD: `f1e00278`
- axes: Standards and Spec, run in parallel fresh contexts.
- tier: Standard

## Standards

Sources: `AGENTS.md`, `docs/engineering-workflow.md`, `.agents/wisdom/*.md`
(no repo-wide `CODING_STANDARDS.md` / `CONTRIBUTING.md`).

**Hard documented-standard violations: none.**

Checks that pass:

- Save-blocked reason rendered in a `role="status"` line beside the disabled
  control — the rule in `.agents/wisdom/architecture.md:740`, mirroring the
  invoice `saveDisabledReason` pattern and the salary dialog.
- Every new i18n key is wired by the component (`paymentAmountRequired`,
  `amountInvalid`, `saving`, `recordPaymentDescription`,
  `createAccountDescription`); the removed `accountDescription` has no lingering
  reference (`.agents/wisdom/testing.md` dead-key rule).
- Tests render the real `ar` resource rather than mocking `react-i18next`.
- `vi.hoisted` used for the mock factory state (Vitest 4 hoisting rule).
- E2E `tests/e2e/debt-entry.spec.ts` updated with the balance drop.

**Judgement-call smells (all deferred, none blocking):**

1. **Duplicated Code** — direction→account selection exists in
   `debt-utils.ts:172` and `debt-cases-panel.tsx:117,121`. A shared
   `findAccountByDirection` would collapse them.
2. **Duplicated knowledge** — `entryType`'s union is re-declared in
   `workspace-mutations.ts:711` instead of imported from
   `packages/contracts/src/debts.ts:223`.
3. **Dynamic i18n key** — `t(saveBlockedReasonKey)` (`debt-cases-panel.tsx:262`)
   defeats literal-key checking; the keys are valid today.
4. **Divergent Change** — the validation block (`:68-97`) belongs in
   `debt-utils` next time it grows.
5. `as never` fixtures in `debt-utils.test.ts:242` — tolerated; repo precedent,
  positive fixtures only.

## Spec

Spec sources: `.scratch/implementation/459-design.md` (§Decision, §Behaviour,
§Round 2 + Gate follow-ups).

All three Greptile round-2 findings are implemented and pinned:

1. **Either-mutation gate** — `debt-cases-panel.tsx:88-93`;
   `setAmount("")` only after `await` (`:283`). Tests cover both halves
   (entry-pending and create-pending).
2. **Localized blocked-amount hint** — `ar.ts:1409-1410`, `role="status"` at
   `debt-cases-panel.tsx:250-254`; the reason-split matches the design.
3. **Description names the selected ledger** — `ar.ts:1408`
   («لا يوجد حساب على الدفتر المختار بعد…»), create branch only (`:200`).

Core #459 is intact: `resolveDebtCasesFormAction` is the single source of
label/description/button/submit; an existing account on the chosen ledger posts
`entryType: "PAYMENT"` with `-|amount|`; a missing ledger opens it with a
positive opening; no wire change.

Notes (not defects):

- `debts.cases.saving` and the invalid/non-zero reason split go beyond the three
  Greptile findings but are recorded in the design's §Gate follow-ups — in scope,
  not creep.
- The resolver does not filter `status === "OPEN"`, so a settled account would
  still accept a payment. Pre-existing; deferred.

## Summary

- Standards: 5 judgement-call findings, 0 hard violations; worst = the
  duplicated direction→account selection (low, deferred).
- Spec: 0 missing/partial; the three round-2 findings are implemented and tested.
