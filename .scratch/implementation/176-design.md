# Issue 176 — debt category translations

Base: `16c3ec7c5f9ce8b5e6a6bd64c4347a0307a59e14`. Risk tier: elevated domain caller (debt direction and opening-balance submission are preserved). Verification: focused-local / CI-final-pending. The page intentionally supports Arabic only; this slice adds no English resource, locale configuration, or language toggle. English expansion remains outside this partial delivery.

## Scope and model

Move the eight legacy category names and descriptions in `apps/web/src/features/debts/debt-create-page.tsx` to the existing Arabic resource under `translation.detailPages.debt.categories`. Preserve values, ordering, exact text, direction locks and submission behavior. Domain terms and interfaces remain unchanged: `ReasonCategory`, `DebtDirectionAlias`, `getLockedDirectionForCategory`, and the create mutation payload continue to define semantics. The category label-key and description-key fields are presentation references only. No seam moved.

## M1–M10 plan audit at base

Plan authority: `plans/003-ui-polish-and-architecture/plan.md`.

- M1 (plan lines 11–56): partially delivered here: reachable create-page category copy only. Remaining hardcoded debt surfaces and English-resource work are unfulfilled.
- M2: active debt route still filters `derived.employeeRows` by `employee.isWorker` in `home-view-page-content-detail-pages.tsx:104`. SQLite exact-finance `partyExists` checks the employee table without a role predicate in `sqlite-exact-finance.repository.ts:49-51`. No query or dropdown behavior changed here.
- M3 (lines 74–99): no tab conversion; the current create page remains a form, not the proposed detail-page tab layout.
- M4 (lines 102–117): closure presentation/API work untouched.
- M5 (lines 120–130): shell spacing untouched.
- M6: router.tsx defines NotFoundPage at line 34, uses it for roles at line 172, and registers defaultNotFoundComponent at line 288. Existing implementation needs rendering and navigation proof, not a duplicate catch-all route.
- M7 (lines 156–179): shared UI component inventory untouched.
- M8 (lines 182–204): theme token audit untouched.
- M9: the active debts-exact-page.tsx already slices accounts and entries into pages of 25 at lines 81-82 and renders account paging at line 98. Acceptance beyond 50 items still needs interaction proof. Legacy panels remain separate.
- M10 (lines 234–244): linked-case label API/UI work untouched.

Route correction from parent inspection: router.tsx:87 maps /debts/create to the debt-create workspace page. home-view-page-content-detail-pages.tsx:97-108 handles both debts and debt-create with ExactFinancialRoutePage, not DebtCreatePage. The category extraction is therefore legacy cleanup only and does not fix the active experience. Active M1 work must target debts-exact-page.tsx. This audit records milestone status for this slice, not a full verification of each milestone's acceptance criteria. Current code evidence: `debt-create-page.tsx` still contains category list and form; `debt-create-page.test.tsx` covers direction; `ar.ts` contains the existing `detailPages.debt` namespace. No other milestone source was changed.

## Active page implementation

The parent additionally extracts all user-facing Arabic literals from `debts-exact-page.tsx`, including the creation form, ledger, accessible names, action and entry maps, loading/errors, notices and action dialog. Resources live in `translation.exactDebts`. All values retain their original Arabic copy. Domain state, exact-money parsing, idempotency signatures, payloads, page sizes and scoped-party filtering remain unchanged. Action and entry maps hold resource keys, resolved inside React with the existing translation hook. No new interface or seam is introduced.

Existing active-page tests cover cents, direction, payment/correction/void/settlement commands, producer ownership and receipt reuse. A new resource-substitution test exercises page headings, ledger entry labels and the payment dialog through their real rendered interface. It proves translation wiring rather than only unchanged literal text. Parent focused active/legacy tests, affected ESLint and web typecheck pass. Earlier missing-contract and tuple-typing failures remain in local logs. This does not establish browser proof, independent review or hosted acceptance. The old M1-M10 audit is explicitly partial; do not infer that untouched milestones are absent from current source.

## Proof and review

Focused test asserts all eight category buttons render exact Arabic copy through the real application i18n initialization. Existing direction tests protect salary advance and reimbursement lock behavior. Initial debate, test-audit and code-review are parent-owned. Screenshots requested before/after were not captured in this implementation record; this must be resolved or reported as unavailable before handoff. Lesson applied: use actual resources rather than a fallback-returning translation mock, matching `.agents/wisdom/testing/test-mocks-that-return-the-fallback-mask-missing-keys.md` and `.agents/wisdom/testing/adding-an-i18n-key-you-don-t-wire-is-dead-code-that-byte-duplicates-the-inline-string.md`.
