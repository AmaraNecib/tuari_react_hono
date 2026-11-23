# Issue 176 — debt category translations

Base: `16c3ec7c5f9ce8b5e6a6bd64c4347a0307a59e14`. Risk tier: elevated domain caller (debt direction and opening-balance submission are preserved). Verification: focused-local / CI-final-pending. The page intentionally supports Arabic only; this slice adds no English resource, locale configuration, or language toggle. English expansion remains outside this partial delivery.

## Scope and model

Move the eight rendered category names and descriptions in `apps/web/src/features/debts/debt-create-page.tsx` to the existing Arabic resource under `translation.detailPages.debt.categories`. Preserve values, ordering, exact text, direction locks and submission behavior. Domain terms and interfaces remain unchanged: `ReasonCategory`, `DebtDirectionAlias`, `getLockedDirectionForCategory`, and the create mutation payload continue to define semantics. The category label-key and description-key fields are presentation references only. No seam moved.

## M1–M10 plan audit at base

Plan authority: `plans/003-ui-polish-and-architecture/plan.md`.

- M1 (plan lines 11–56): partially delivered here: reachable create-page category copy only. Remaining hardcoded debt surfaces and English-resource work are unfulfilled.
- M2 (lines 59–71): employee role filtering remains unaudited in this slice; no query or dropdown behavior changed.
- M3 (lines 74–99): no tab conversion; the current create page remains a form, not the proposed detail-page tab layout.
- M4 (lines 102–117): closure presentation/API work untouched.
- M5 (lines 120–130): shell spacing untouched.
- M6 (lines 133–153): not-found route and roles guard untouched.
- M7 (lines 156–179): shared UI component inventory untouched.
- M8 (lines 182–204): theme token audit untouched.
- M9 (lines 207–231): cases, ledger and hub pagination untouched.
- M10 (lines 234–244): linked-case label API/UI work untouched.

This audit records milestone status for this slice, not a full verification of each milestone's acceptance criteria. Current code evidence: `debt-create-page.tsx` still contains category list and form; `debt-create-page.test.tsx` covers direction; `ar.ts` contains the existing `detailPages.debt` namespace. No other milestone source was changed.

## Proof and review

Focused test asserts all eight category buttons render exact Arabic copy through the real application i18n initialization. Existing direction tests protect salary advance and reimbursement lock behavior. Initial debate, test-audit and code-review are parent-owned. Screenshots requested before/after were not captured in this implementation record; this must be resolved or reported as unavailable before handoff. Lesson applied: use actual resources rather than a fallback-returning translation mock, matching `.agents/wisdom/testing/test-mocks-that-return-the-fallback-mask-missing-keys.md` and `.agents/wisdom/testing/adding-an-i18n-key-you-don-t-wire-is-dead-code-that-byte-duplicates-the-inline-string.md`.
