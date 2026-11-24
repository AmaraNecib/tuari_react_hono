# Active debt workflows, shared capabilities and pagination

## Authority and scope

Base `cc7f75b457bf3fd87cb4c6ad50d696b2ea63389b` in `D:/worktrees/tuari_react_hono/t3-fb0ab2f1-a18bb36b15530b22`. This isolated tree differs from the parent's source tree. Plan authority is `plans/003-ui-polish-and-architecture/plan.md`, M3, M7 and M9, adapted to the active ExactFinancialRoutePage -> ExactDebtsPage route. Legacy case panels are not restored.

Verification mode is focused-local / CI-final-pending. Parent reports effective ruleset 26837184, strict CI acceptance 15368 and no bypass; the owner activation decision is unrecorded. This worker does not independently claim hosted protection or acceptance. Elevated review applies because shared account selection, payments and receipt identity are reachable. The parent owns three initial independent lenses on the integrated committed head, publication and final owner UI presentation. No interim approval is requested.

## M3 presentation and domain vocabulary

Four Base UI tabs divide ledger/payments, account creation, existing account settlement/history and available party information. Ledger is the default. The bounded searchable account selector stays above the tabs so selection is obvious without changing workflows. It is a shared selector, not a second case model. Choosing an account opens its ledger. Creation drafts and selected account state remain in the page, outside mounted tab panels. Dialogs, exact parsing, financial commands and uncertain receipt retention remain at their original seam.

Settlement means the existing per-account settlement command. Its tab shows only actual SETTLEMENT entries with amount, date, actor, note and live/voided status. It makes no cross-account closure claim. The party tab displays the actual supplied label and the existing payroll module when applicable. The supplied ExactDebtPartyOption has no phone or notes, so this slice does not invent those fields or search them. M4/M10 contract decisions remain outside this work.

## M7 ownership and depth

The plan names seven capabilities, not nine. The components/ui index exposes those seven. PageHeader and SectionHeader reuse the existing page-primitives implementations, EmptyState reuses its current implementation, and StatCard extracts the repeated exact-page label/value pattern into page-primitives. AmountDisplay restricts MoneyValue to exact string inputs, including wide aggregates, and adds sign-based semantic color without numeric conversion. StatusBadge accepts caller copy and semantic tone. DataTable owns scroll containment and composes the real table with shared pagination. Existing TablePaginationControls now uses that same pagination control instead of retaining its own previous/next implementation.

The deletion test favors reuse here: removing DataTable and paginate would spread safe page slicing, count handling, navigation and scroll markup back into the debt page. Removing the index aliases introduces no missing behavior because they deliberately expose the existing owner, rather than adding wrappers. Shared components contain no translation literals. Capability composition and actual debt-page tests cross their public interfaces.

## M9 state and ordering

Accounts use 15 rows, ledger entries 10. Account list scrolling is capped at 12rem; tables and settlement history at 24rem. Horizontal scroll stays inside the table region. Pagination always reports range, total, current page and total pages with translated names and previous/next controls. Account filtering resets its page. Account selection resets the ledger page. Data shrink clamps before slicing and commits the clamp to state, preventing later growth from resurrecting a discarded page. Ledger order is entryDate descending with descending postingSequence as tie-breaker. No money operation or receipt signature changes.

The 61-account/61-entry test traverses every page, submits a payment from the final ledger page with the exact expected entry ID, shrinks/refetches datasets, filters accounts and regrows entries. A failing regrowth assertion exposed the initial derived-only clamp; the state clamp fixes that reachable defect. Existing cents, maximum, producer ownership, scoped account and receipt retry/remount tests remain intact. Initial tab work was tested after implementation, not represented as red-first. The subsequent shrink/regrow correction has explicit failing-first proof.

## Proof boundaries and lessons

Focused Vitest covers the debt page, seven capabilities and the existing pagination adapter. Affected ESLint, web typecheck and i18n key scanner are required. Frozen dependency installation and contracts compilation are local prerequisites only. The first test invocation mistakenly passed a literal `--` through pnpm and selected broad files before timing out; its failed log is preserved, not counted as proof. Later commands use explicit `exec vitest run <files>`.

The browser selector returns full because ar.ts is a critical path. Full E2E remains CI-final. The justified local browser expansion is only the changed debt module: actual React, Arabic resources, Base UI and app CSS through the existing browser fixture with a fake financial JSON client. It checks 1120px and 390px document containment, tab switching, creation-draft retention and Home/Enter keyboard navigation. Element screenshots are local proof, not the parent's final integrated presentation. The initial screenshot selector matched an inert outgoing animated tab panel; the retry names the active panel explicitly. No backend/auth browser integration is claimed.

Evidence lives in ignored `.scratch/reviews/176-m379/`, with committed-head verification recorded separately after commit. Review verdicts and CI acceptance are pending parent work. No dependencies, schema, contracts, shell, featureCopy or global styles changed.

Applied lessons: keep one shared pagination owner rather than parallel controls; wire resource keys through real callers; retain exact-SHA evidence after source changes. Historical whole-feature/full-suite advice is excluded by the current focused-local workflow. The impeccable setup found no PRODUCT.md; existing app primitives and styles supply this scoped change's design context. Its referenced product-register file is absent in this checkout and was not fabricated.
