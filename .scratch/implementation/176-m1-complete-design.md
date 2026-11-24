# Issue 176 M1 production feature extraction

## Scope and authority

Base: `e340e53b9cefd9fc367457d624a98d0eb9657f1b`.
Worktree: `D:/worktrees/tuari_react_hono/t3-ff555e38-a7298def29cdfee8`.
The assigned checkout was clean at the supplied base. The parent tree is read-only.
Verification mode is focused-local / CI-final-pending. The parent reports effective ruleset 26837184 and CI acceptance app 15368 without bypass. Owner activation is not recorded. No policy, dependency, protection, locale or finance changes are authorized here.

The supplied M1 brief and the parent's full-milestone audit govern this extraction. A separate Plan 003 document is absent from this checkout; its M1 scope is recorded in the existing 176 design and the parent's audit. This work completes the owned production-feature string extraction, not issue 176 or every milestone. Three initial review lenses, browser comparisons and hosted acceptance remain parent-owned.

## Implementation

Append `translation.featureCopy` with 289 Arabic resource entries in 34 caller-specific groups. Wire actual display callers, including legacy screens, toast/error fallbacks, CSV audit headers, form validation, attachment labels, debt presentation utilities and currency labels. Existing `exactDebts` and category resources remain untouched. Remove inline translation fallbacks only where their existing resource key already resolves. Resource lookup continues to win, as before.

Use the initialized application i18n resource layer directly for these calls. This works in non-React utilities without introducing hooks, a second resource store or another adapter. The application remains Arabic-only. No language selector, English resource or new locale activation is introduced. Debt balance description getters resolve copy on each display-helper call rather than capturing translated text at import time.

Keep JSX whitespace and template output, including punctuation and interpolated monetary formatting, unchanged. Preserve request values, direction aliases, error classification tokens, parsing alphabets, permission checks, receipt keys and amounts. No domain model vocabulary changes. `PAYABLE` remains an obligation by us; `RECEIVABLE` remains an obligation to us. Balance direction still comes from the contract helpers, not translated wording.

The presentation seam is the existing application i18n instance. The deletion test is straightforward: removing the resource layer would put duplicated Arabic sentences back into each caller. No new public interface or cross-module abstraction is needed. Parent architecture review can stay scoped to debt presentation and the resource access calls.

## Inventory and exclusions

The ignored execution inventory records all 390 Arabic-containing baseline production/fixture lines, plus individual extracted AST literals. The final resource-key manifest is the committed diff, not the temporary extraction script's numbered staging keys. The residual inventory records 77 Arabic-containing lines. These are not represented as grep-zero:

1. Shell, layout, router and shared-component files are parent-owned. In particular, breadcrumbs, shell navigation/copy, dashboard currency, update dialog copy and the external detail-page title still need parent integration. The excluded files were not edited.
2. Test fixtures retain Arabic business names, role descriptions, sample records and filenames. Test expected text remains independent of the resources.
3. Localized numeric alphabets and separators in debt payment, payroll percentage and shared exact-money input remain executable parsing syntax. CurrencyProse's currency-matching regular expression is not display copy.
4. Arabic in source comments and the login error-classification token remain unchanged. They are not user-facing output.
5. `DEBT_BALANCE_STATE_PHRASE` remains domain-owned in `packages/contracts/src/debt-helpers.ts`. Debt utilities, hub, externals, reports and the excluded signed-in shell still display it. A future locale implementation should translate the returned state at a presentation adapter rather than moving or mutating the shared contract constants solely to erase Arabic. No contract edits are made here.

Detailed local evidence lives in `.scratch/reviews/176-m1-complete/`: `final-inventory.json`, `residual-inventory.json`, the initial literal scan and extraction inventory. Those are ignored, not shipped.

## Proof and failure boundaries

Existing affected tests cover real callers and unchanged financial behavior. New wiring tests mutate real Arabic resources temporarily and assert independent sentinel output through the attachment input and debt utilities. Attachment selection is exercised after label substitution. Debt remainder proof checks the independently worked 1250 minus 250 result, direction and formatted 1,000 amount. Tests restore resources after each case.

The first wiring execution exposed import-time capture of balance descriptions; lazy descriptions fix it. That run also contained an incorrect test expectation for the shared payable phrase, corrected against `debt-helpers.ts` rather than changing domain behavior. Preserve both failures in the red log.

The affected regression run passed 323 tests across 28 files, with one additional suite failing at import because its partial react-i18next mock omitted `initReactI18next`. Preserve that failure. The batch-create test now retains the actual package exports while preserving its original key-based test interface. Its three tests pass separately. Existing assertions and expected Arabic text were not weakened.

Resource scanner, affected ESLint and web typecheck pass. A first typecheck failed because the isolated checkout lacked compiled contracts. Frozen-lockfile installation and the authorized contracts prerequisite build resolved it; no package or lockfile changes were made. Full suites and app builds remain CI-final. Exact command exits, timings, test counts and committed-head checks belong in ignored verification records, not evidence-only commits.

## Applied lessons

Wire every resource key to the actual caller. Test representative wiring against real resources, not fallback-returning mocks. Classify interpolation options separately from fallback text. Retain domain-owned direction rules and numeric parsing syntax rather than pursuing a misleading source grep-zero. No wisdom files are changed.
