# Issue 559 payment entry

## State and scope

Worktree: `D:/worktrees/tuari_react_hono/t3-0e4b1467-be3d2c82e07909f9`.
Base: `5b09d7213f5fd8d990a8b20cd3e5a80abdbca21f`, matching freshly fetched `origin/develop`.
Specification: https://github.com/AmaraNecib/tuari_react_hono/issues/559.
Verification mode: focused-local / CI-final-pending.
Review route: three distinct initial sessions, debate, test-audit, code-review. Money entry can cause a reachable overpayment or rounding error.

The issue says #558 blocks delivery. That issue remains open, but the current source already provides the connected payroll panel, authenticated cash mutation and durable pending-intent mechanism. Inspect their current API and persisted-balance coverage before treating the dependency as complete. Do not create a second payment writer.

## Proposed implementation

Extend `apps/web/src/features/employees/employee-payroll-panel.tsx` for ordinary earned-wage cash payments. Keep opening wages, advance repayment and advance offsets separate from the selected approved-earned percentage basis.

The basis is `selectedEarning.earning.totalAmount`, not `selectedEarning.remaining`. A payment percentage describes this payment only. A separate cumulative preview must account for prior settlement without mislabelling advance offsets as cash paid.

Keep exact money as the sole persisted amount. Convert percentage input using integer rational arithmetic and the accepted currency rounding contract. Derive the reciprocal display from the last explicitly edited field, without reciprocal effects. Mark rounded percentage displays as approximate. Quarter and half use approved-earned total; whole remainder uses exact current outstanding wages.

Preserve the existing explicitly entered advance amount and the foundation's bonus classification path. Do not silently classify an excessive wage payment. Keep frozen request identity and payload unchanged for uncertain retries, even after balances change. First-time confirmation must validate current outstanding wages; server-side atomic validation remains authoritative.

## Proposed test interfaces

The owner confirmed that issue-defined requirements need no further approval. The accepted interfaces are the real calculator, authenticated payment API and persisted balances, plus the connected form.

1. Exact calculator: 60,000 at 50 percent gives 30,000; round trips, fractional cents, malformed input, zero totals and excessive amounts use literal expected results.
2. Payroll form: amount and percentage editing, quarter/half/remainder, previous 20 percent plus new 60 percent, approximate displays, keyboard labels and RTL preview before submit.
3. Authenticated payroll API with persisted state: stale balance, duplicate submit, uncertain retry and reload retain the exact request identity and do not overpay or duplicate records.

Existing form tests are in `employee-payroll-panel.test.tsx`. The authenticated API regression is `apps/api/src/rpc/exact-payroll-auth.integration.test.ts`. The connected browser case in `tests/e2e/payroll-connected-exact.spec.ts` exercises percentage entry, an intercepted committed response lost in transit, another real payment, reload and identical retry, then a stale-balance refusal. Raw logs remain local; final exact-SHA verification follows the commit.

Display percentages allow six entered decimal places and show two derived places, marking non-exact ratios. Conversion uses integer rational arithmetic and half-away-from-zero currency rounding. These are input/display rules, not a new persisted-money policy. The preview distinguishes cumulative cash paid from cumulative settlement including advance offsets. Direct amount edits and shortcuts update money once; no reciprocal effect recalculates drafts.

The E2E selector returns full scope because Arabic resources are a critical path. Local proof remains limited to affected payroll cases because this change adds payroll keys only; full unrelated browser coverage remains CI-final. Compile contracts as a test prerequisite because package exports resolve generated dist, not TypeScript source.

## Local execution boundary

Dependencies were installed with `pnpm install --frozen-lockfile`, without package additions. No package additions are proposed. The Impeccable context script reports no PRODUCT.md; use existing UI conventions, without expanding this issue into product documentation. Its referenced `reference/product.md` is absent in this checkout.

## Bounded correction after initial reviews

Retain the failed initial connected-suite log. Scope existing native cash, offset and repayment assertions by employee_id, preserving every literal amount. Extend the connected percentage case with quarter/half interactions and derived previews, a three-cent earning whose 50 percent payment persists as two cents, reload with one cent outstanding, approximate reciprocal percentage and invalid/excess percentage rejection. No runtime source, money policy or API changed in this correction.

## Hosted review correction

CI found that the new calculator's direct Money import was absent from the exact-money consumer inventory. Add only its explicit path, preserving the complete scan and exact-set assertion. This records an existing direct consumer, not new storage activation or a looser allowlist.

Greptile found that automatic earning selection retained the previous editable percentage and amount, and that excessive percentages disabled submit without explaining the outstanding-balance limit. Reproduce both through form tests before correcting them. Clear editable money, percentage and errors on an automatic source change only when no pending intent is locked. Retain pending payload and request identity. Derive an excessive-balance message from the live amount and remaining balance, independently of malformed percentage errors. Add frozen retry proof across automatic selection.

## Repayment-draft correction and design reassessment

A later hosted review found an unrelated advance repayment draft was erased when the wage source disappeared. Reassessment after three correction rounds identifies shared editable `amount` state across cash, offset and repayment as the relevant coupling. The source-selection invalidation must match its dependencies: cash and offset use an earning, repayment does not. Keep the existing state model for this bounded fix and condition earning-driven draft invalidation on action not being repay. Splitting all action state or replacing the form is not needed to correct the reachable defect. Preserve locked retry behavior. A failing-first form regression exhausts the unrelated earning, preserves 1500 DZD repayment input and verifies submission still references the original advance.

## CI earnings navigation synchronization

Full CI E2E at 965e01cd failed only employee-earnings.spec.ts at the post-save breadcrumb bounds assertion, all three attempts; 85 other cases passed. The retained retry trace shows the edit page still present when the substring heading locator matched the employee name within the edit heading. The save toast had appeared, but navigation had not completed. A focused Windows reproduction passed, so do not claim a local failing replay or change production layout to fit this timing observation.

Reassessment identifies an independent test synchronization defect, not another payroll-state correction: wait for the details URL, an exact employee heading and exact current breadcrumb text before preserving the existing geometry assertion. Before saving, assert the exact employee heading is absent to prove it discriminates the edit state. This strengthens the original check without relaxing any boundary or financial assertion. Keep CI trace and initial failure logs local. Verify the focused earnings spec, not all unrelated E2E cases locally.

## Owner-requested single-field redesign

The owner rejected the original two-input design and explicitly requested a single numeric entry with two inline unit choices, DZD and percent, in place of the currency adornment. Final visual acceptance and merge remain owner-only. This is a new interaction revision, not visual-only routine review: use three distinct initial lenses for reachable payment-entry and retry consequences.

Design direction: restrained, compact ERP entry for an Arabic-speaking operator recording wages under ordinary office light. Preserve the existing light/dark tokens, terracotta selection accent and IBM Plex Arabic. The distinctive interaction is one generous numeric control with a quiet inline unit switch, followed by subordinate shortcuts and an exact two-column payment/remainder preview. Center the bounded operation within the account area, align source selection across the form width, and keep date and explicitly classified extra advance secondary. No new font or dependency.

Load frontend-design and Impeccable. Two independent read-only Impeccable assessments ran: subjective layout and mechanical detector. The engine returned no layout findings and no arbitrary spacing utility violations; the visual assessment identified duplicated entry, detached shortcut row, equal-weight preview lines and misplaced density. The synthesized fix removes duplicate fields, groups input/basis/shortcuts, uses a border-block preview rather than a nested card, and limits cumulative settlement display to cases where it differs from cumulative cash. All values remain available when relevant. A first real screenshot exposed broad role-group margin affecting the inline switch; narrow the selector to the action group. Repeat engine scan remains clean, but rendering evidence, not detector output, decides balance.

PaymentUnit is presentation state only. A DZD edit uses existing exact-money parsing; a percent edit uses the existing rational calculator. Switching units never converts the rounded display back into money. Repeated mode switching on a 0.01-of-0.03 payment must submit exactly 0.01. Keep malformed percentage text visible in its active field, current-source reset, separate repayment state dependency and locked retry identity intact. Two explicit pressed buttons have 44px targets, visible keyboard focus and localized group name; one input has an associated label and basis/error descriptions. Opening wages, offsets and repayments retain their original money-only entry.

Update the existing form and connected browser assertions to select modes explicitly rather than querying two simultaneous fields. Preserve all literal amounts, stale balance, fractional rounding, reload, retry and repayment assertions. Add a failing-first one-field/mode-switch drift regression. Local focused form/calculator proof is 45 tests; connected spec is 3 cases. Verify desktop/mobile light/dark screenshots, keyboard unit selection, no horizontal overflow and a new cropped recording before presenting to owner. Reports and recordings stay ignored; only source/tests/style/copy and this note are committed.

## Single-field review correction

The three initial UI lenses confirmed a presentation defect: comparing rounded cash and settlement percentage strings can suppress distinct settlement information. Keep the compact single-row preview only when exact cumulative minor-unit amounts match. A failing-first case uses a 1,000,000 DZD earning, 1 DZD prior offset and 800,000 DZD proposed payment: cash is exactly 80 percent, while settlement rounds to approximately 80 percent and must remain visible. Compare prior cash against approved total minus remaining in BigInt, not display strings. No money conversion, write or interaction changes. The recorded demo has no offsets, so its rendering remains identical under this correction.

## Owner-requested attached selector and laptop presentation

The owner rejected the cropped near-square recording and inset floating unit buttons. Keep the single-field interaction unchanged; attach a rectangular DZD/% selector directly beside the input, with a shared seam, zero gap or inset padding, and equal outer height. Remove the surrounding focus ring; retain a single-pixel input focus indicator and keyboard-visible unit focus. Selection uses a quiet background with a short inset baseline, not an orange floating tile. Record at native 1440 by 900 and preserve that laptop aspect ratio; remove setup/wait/mobile-resize segments without cropping away the application context. Supply a separate element screenshot for readable detail.

This is a bounded appearance/recording correction, not another money interaction revision. Add browser geometry assertions: input and selector are exactly 52px tall, aligned at top, with selector right edge meeting input left edge, no outer wrapper border, and existing 44px keyboard/touch checks retained. First execution caught the project's 15px root making 3.25rem input height 48.75px while the fixed unit selector was 52px. Correct the input to 52px rather than relaxing equal-height assertions. Keep failed log. No arithmetic, draft, API, persistence or retry source changes. Fresh combined-delta review carries unchanged prior lenses. Owner approval remains required; no merge.

## Attached-control focused-error correction

Fresh appearance review raised focused invalid styling. Source inspection shows the destructive border rule already follows focus, contrary to the report's stated cascade order; the actual issue is the primary inward outline painting over that border. Preserve destructive outline color as well for invalid input. Browser proof compares focused border and outline against a separate destructive-token probe. An intermediate test captured a border transition frame as its expected color; replace that timing-sensitive snapshot with a retrying final-token assertion, not a weaker palette expectation. Preserve both failed logs and the passing focused run. Normal valid-input recording is visually unchanged by this error-only correction.

## Selected-action identity correction

After develop synchronization, hosted review identified that pressing the already-selected cash action cleared wage amount/percentage while retaining extra advance, allowing accidental advance-only submission. Accept the finding. Current-action selection must be a no-op, preserving the entire existing draft and any errors; actual action changes retain the prior reset behavior. Failing-first regression enters50percent of10000 plus2000 advance, presses selected cash and verifies percentage50 plus2000 remain and request submits7000 total with5000 wages and2000 advance. No appearance, calculator, ledger, retry identity or schema change. Owner's provisional visual acceptance remains applicable. Reassessment keeps action identity guard local rather than broad form refactor; no further UI changes are authorized by this correction.

## Architecture

Retain the existing payroll write and retry interfaces. A pure percentage calculator should own rational conversion and display approximation so integer money rules do not spread through event handlers. No schema, ledger, rounding-policy or published-contract change is proposed.
