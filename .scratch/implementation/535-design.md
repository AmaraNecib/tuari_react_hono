# Issue 535 currency placement

## Assigned work and acceptance

Worktree: `D:/worktrees/tuari_react_hono/feat-issue-535-currency-564b564fbd3da3c6`.
Branch: `feat/issue-535-currency-placement`. Target: `develop`.
Clean initial HEAD and freshly fetched origin/develop were both
`7a56b245740d6d2ef836181cd150011657be0303`, the actual shared PR532 merge.
One writer owns this tree. The project root and peers are read-only.
Before freezing source, fetched and fast-forwarded the assigned branch to actual
develop `2d27176b44058bbb02bde13e45ba33f5b9117cb8`, PR533's terminal merge.
The incoming diff contains expense implementation and exact-contract exports,
not this lane's callsites or shared CurrencyRun. No pending source was copied.
The final review base is that develop SHA. The visual before source stays pinned
to shared PR532's merge, whose affected presentation files are identical to this
new base. PR533's expense evidence and UI approval do not cover this work.
The complete live issue body and comments were read with `gh issue view 535`.

Mode: **focused-local / CI-final-enforced**. Live ruleset 26837184 is active
on develop, requires strict `CI acceptance` from app 15368, resolves review
threads, prevents deletion/non-fast-forward and has no bypass actors.
The checked-in activation document is historical and still says pending.
Protection and current-head CI are separate checks before readiness.

High-assurance presentation. A misplaced sign/currency can misstate a financial
value. Preserve every existing numeric formatter, precision, grouping behavior,
NULL branch, zero branch and translated currency label. No new Number bridge,
calculation, date policy, persistence, schema, input-layout or backend change.
The owner approves the UI and merges manually. This lane cannot self-approve.

## Model and interfaces

A CurrencyRun is a preformatted numeric string plus its original currency label.
Its merged inline-flex LTR container places the RTL label physically left of the
isolated LTR signed numeric run. Numeric/exact formatting belongs to the caller
or existing MoneyValue, not this placement repair.

Structured JSX callers pass their original formatted text to CurrencyRun.
Project movement direction signs join the numeric run, not the currency label.
Project unit prices become JSX fragments rather than stringifying a component.
StatBand.value and SurfaceHeader.description accept ReactNode to carry the
structured display. Their layout does not change. The actual 390px project
render exposed the fixed-width contribution row extending beyond its card.
Use a narrower mobile source-label column and gaps, preserving desktop widths,
so the currency run stays inside the contribution card.

Generated history, search and server log strings remain strings for sorting,
searching, transport and domain tests. CurrencyProse is a presentation adapter
at their render boundary. It recognizes the existing numeric-suffix DZD grammar,
passes the matched numeric text unchanged to CurrencyRun and leaves surrounding
text escaped by React. It does not parse numeric values or regenerate prose.
It supports signed, grouped, decimal, Arabic-digit and exponent source text.
Unrecognized text remains text. This is not a new money formatter.

Deletion test: removing CurrencyProse would expose unisolated generated currency
in four consumers without changing their source data. CurrencyRun continues to
own all physical placement. No existing shared money/input implementation moves.
Architecture review is limited to this adapter and the two ReactNode slots.

## Caller inventory

Paths below are relative to `apps/web/src/features/` unless stated otherwise.
Inventory is based on literal-label, translated-label, formatter and consumer
traces on the actual merged source, not on grep counts as visual proof.

### Structured callers converted

| Caller | Disposition and preserved source |
| --- | --- |
| app-shell/dashboard-section | Outstanding-debt stat; ar-DZ locale string. Loading, error and retained-data branches stay unchanged. |
| reports/report-builder | Six inventory/debt summary totals; ar-DZ strings. Count cards and CSV unchanged. |
| projects/project-cost-section | Total, four contribution rows, expense/salary/stock rows, material unit price and signed movement, parked total/assets; existing en-US maximum-two-decimal formatter unchanged. Expense contribution here is a project caller, not #528's expense screen. |
| inventory/inventory-invoice-details-page | Gross, paid, remaining and entry total; existing fixed-two-decimal text unchanged. |
| inventory/record-invoice-payment-dialog | Remaining-debt summary; fixed-two-decimal text. No editable-input changes. |
| inventory/location-transfer-history | Sale total; ar-DZ text. |
| inventory/transfer-history-page | Summary total and sale total/paid/debt; existing formatCurrency retained. Existing optional/positive guards unchanged. |
| inventory/multi-source-item-picker | Selected total; ar-DZ and common.currency translation. |
| inventory/outbound-transfer-create-page-v2 | Total, first payment and remaining preview; ar-DZ and common.currency. Editable amount/percent suffix is excluded as input policy. |
| debts/consolidation-dialog | Both account headers, both signed entry lists and selected-pair amounts; formatDebtAmount/formatDebtMoney unchanged. |
| debts/debt-cases-panel | Balance stat and both consolidation account summaries; original direction phrases and magnitude formatter. |
| debts/debt-ledger-panel | Balance stat, signed movements and running balance; direction phrases and formatters retained. Settlement prose uses CurrencyProse. |
| debts/debts-hub-page | Two directional totals and party row magnitudes; original formatDebtAmount and phrases. |
| debts/debt-party-summary-card | Net magnitude; original translated currency and direction phrase. |
| debts/debt-payment-preview | Payment and balance-after; original translated currency, magnitude and direction. |
| debts/record-payment-dialog | Account balance; original translated label and formatDebtAmount. |
| debts/record-entry-payment-dialog | Opening and maximum payment; original phrases and magnitude formatter. |
| debts/void-entry-dialog | Signed entry summary; cascade translated prose uses CurrencyProse. |
| externals/externals-page | Party balance magnitude; original phrase, fixed literal label and formatter. |

### Generated strings traced to renderers

| Source | Actual render disposition |
| --- | --- |
| app-shell/home-view-derived-employee-history | Salary detail remains the original interpolated number/translation/period string; shared/record-page-frame wraps row.detail in CurrencyProse. Notes remain escaped text. |
| app-shell/home-view-signed-in-shell | Search debt description remains searchable text; components/ui/search-dialog wraps item.description in CurrencyProse. |
| debts/debt-utils getConsolidationRemainder | Both description and label retain exact original arithmetic and prose; consolidation-dialog wraps both output slots. |
| i18n/resources/ar.ts debts.voidEntry.cascadeDescription | Translation and fallback remain unchanged; void-entry-dialog adapts the interpolated output. |
| debts/debt-ledger-panel settlement description | Existing generated sentence is adapted at SurfaceHeader.description. |
| apps/api/src/modules/company/company.system-log.ts | formatSignedMoney emits explicit +/- or zero with دج; salary payment detail emits raw numeric text plus دج. No server change. app-shell/system-log-section adapts existing detail tokens and summary only, after existing tokenization. |

### Excluded callers and why

| Caller group | Reason |
| --- | --- |
| expenses/expenses-page and expense tests | #528 owns this correction; no unpublished dependency or copied expense evidence. Existing exact expense consumers already use MoneyValue. |
| shared/money-value, components/ui/form-controls CurrencyInput, currency-amount-input | Actual merged PR532 owns display and editable-input policy. Reused, not redesigned. |
| employees/employee-details-page, app-shell/salaried-workers-table, salary-payments-table | Existing MoneyValue consumers already use merged placement; keep grouping and exact/numeric semantics. |
| employees/employee-edit-page, employee-batch-row-card and outbound editable amount/percent label | Input labels/affixes, not bypassed read-only money. Shared input policy is settled. |
| hooks/use-report-queries CSV headings and export values | Non-visual structured export; stable currency columns, no bidi layout. |
| API schema currency defaults, Money bounds/errors and inventory arithmetic | Storage, validation or financial semantics, not runtime currency-label composition. No backend edits. |
| inventory/asset-charge-history and transfer-item-dialog chargeHint | Existing amount-only text without a currency suffix, including revision translations. No currency label is invented and editable input policy stays unchanged. |
| Inventory invoice/outbound list cells with header-only monetary units | No inline currency-label composition; original numeric cells and headings stay unchanged. |
| User-authored names, notes and arbitrary unrecognized strings | Never parsed as HTML or converted to financial values. Recognized currency tokens in displayed prose receive placement only. |

## Coordination

#534 owns date imports/helpers/JSX on overlapping files. Direct agreement sent to
its owning thread before currency edits. Currency imports and amount expressions
are disjoint from its reported report timestamp, project formatDay and inventory/
debt date-only hunks. Ordinary import conflicts wait for actual develop integration.
No date source is copied from an unmerged branch. The additional prose adapter
render slots were communicated directly. #524 shared components and #528 expense
screens remain untouched.

## Verification plan and evidence boundaries

The owner explicitly selected actual callsites and physical geometry as test
interfaces. Dashboard's first focused red requires an isolated numeric bdi and
separate RTL label where the baseline is one concatenated string. Preserve red
logs. Generated-prose tests preserve exact digits, signs, labels and non-money
text. Add affected callsite tests for original formatter precision and guards.

Native-browser geometry must assert label right <= numeric left, and sign right
<= first digit left independently. Include desktop/mobile, RTL/LTR, positive,
negative, zero, grouped/plain, decimal and Arabic inline prose. Detect overflow.
Use actual imported components with explicitly synthetic fixtures, not a mock
CurrencyRun implementation. The browser fixtures provide the view fields read
by those components, not complete RPC-validation or database fixtures. Query and
navigation adapters are synthetic; React, i18n, styles and display components are
real. This is component-level browser proof, not authenticated app/DB evidence. Capture native-pixel element crops for before/after
from the pinned merged baseline and final source. Publish only synthetic media,
validate downloaded SHA256 and MIME, one equal-width table per changed surface.

Focused tests, relevant ESLint and web typecheck run locally. Contracts compilation
is a necessary test dependency because this fresh tree has no generated package
entry; it is not a production app build. No routine full suite/build/browser run.
The existing E2E selector returns full because report-builder is unmapped. This
is a conservative CI decision, not permission for a routine local full run.
Existing E2E cases do not independently measure label/sign geometry across these
bypasses. A bounded actual-component browser harness supplies that missing proof,
with synthetic query hooks only, real source components/styles and no API/DB.
Run it through heavy_run. It is not an authenticated end-to-end workflow claim.

Freeze a complete committed source/design/test SHA before debate, test-audit and
code-review, in distinct Luna sessions through the capability-resolved route.
Disclose owner-approved same-family separate-session independence, no local score.
Any bounded corrections get one fresh combined-delta review with earlier unchanged
conclusions carried explicitly. Logs/reports stay ignored and exact-SHA anchored.

Live hosted review 5/5, current-head CI, protection and resolved findings are
separate from local readiness. Request hosted once per published head. Link and
watch the independent develop PR at creation. Maintain its watch until a confirmed
terminal state. Owner UI approval and manual merge remain outstanding gates.

## Wisdom applied

Applied dashboard-stat-bands lesson: preserve pending/error-without-data versus
retained-data states, deterministic existing formatting and distinct fixture values.
Its historical ar-DZ recommendation does not authorize changing other callers'
current formatting or preference semantics. Worker-pool cap remains two.
Money-derived-default bounds and split-allocation lessons are excluded because
no arithmetic, fields or allocations change.

Local impeccable reference/product.md is absent in the installed skill directory;
use the existing app's committed design tokens/components and the loaded skill's
product-UI guidance. Accessibility skill applies. No shadcn skill is present in the
available project skill list; existing installed components are reused unchanged.
