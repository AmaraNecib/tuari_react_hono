# Issue 534: local numeric date presentation

## Authority and acceptance

Issue: https://github.com/AmaraNecib/tuari_react_hono/issues/534, read live verbatim before editing.
Worktree: `D:/worktrees/tuari_react_hono/feat-issue-534-date-for-5ac9a98dba95338d`.
Branch: `feat/issue-534-date-format`.
Base: `b2d37386aa3aa7bca1d98a4f7171f7a459859201`, clean at assignment and equal to fetched origin/develop.
Tier: high-assurance. A shared formatter can mislabel financial business days and audit timestamps across the application.
Verification: focused-local / CI-final-enforced. Live ruleset 26837184 is active for develop, requires strict `CI acceptance` from app 15368, resolved threads, blocks deletion/history rewrite and has no bypass actors. The checked-in activation record is historical; current enforcement was inspected read-only. Recheck before any merge-ready report.

Default DD/MM/YYYY. Offer MM/DD/YYYY, YYYY/MM/DD and YYYY/DD/MM too. Pad numeric day/month, preserve Gregorian calendar and existing locale digits. The setting is translated Arabic, keyboard accessible, local to the device and immediately observable by mounted consumers. Invalid preferences fall back to the default. Storage denial retains a usable session choice. Cross-tab storage events refresh mounted output. Numeric order must remain physically left-to-right inside Arabic and future LTR prose, without internal RLM characters. Audit clocks retain their existing precision and Africa/Algiers timezone.

This is presentation only. Canonical yyyy-MM-dd values, stored ISO instants, range expansion, filters, sorting and accounting are unchanged. Native HTML date fields keep browser/OS presentation. No new language, package, schema or account preference migration is authorized. Owner UI approval and manual merge remain mandatory.

## Dependency decision

Independent develop-based branch, no stack or unpublished cherry-pick. PR 532's money components, form-controls and money inputs are excluded from edits. PR 533's owner confirmed that the minimal expense patch should keep the existing span/TableCell styles and replace their date children with AppDate. Do not copy that owner's unpublished expense details or audit history. The owner will adapt new exact-detail, revision and void consumers after actual owner merges. These pending consumers are an explicit full-closure dependency, not an omitted caller. Ordinary import conflicts are resolved by the parent against real ancestry.

## Domain and interfaces

A **business day** is the calendar day in Africa/Algiers; a **stored instant** is the recorded point in time. A **date display order** changes only the sequence of rendered numeric components. A **canonical picker value** is yyyy-MM-dd, independent of display order. These terms extend the presentation vocabulary without changing the telemetry glossary in CONTEXT.md.

- `date-format.ts` owns the closed set, default and runtime validator.
- `date-format-preference.ts` owns local persistence, session fallback and subscriptions. Its read/set/hook interface is separate from canonical date utilities.
- `formatAlgeriaDate(value, locale?, order?)` is pure and returns an unisolated numeric string for explicit formatting boundaries. `formatDateTimeInAlgeria(date, locale?, order?, timeStyle?)` retains the clock. Neither reads a preference or converts storage.
- `AppDate` accepts `value`, optional `includeTime`, `timeStyle` and `locale`. It subscribes itself and isolates the date run with bdi dir=ltr. The localized clock is separately isolated. Callers pass original values rather than slicing ISO strings.
- History range derivation returns presentation React nodes containing AppDate instead of prematurely freezing display strings. This avoids global preference reads inside pure builders and keeps already-mounted history reactive without rebuilding workspace data. Corresponding presentation-only prop types accept ReactNode.
- Existing DatePicker keeps parsing, calendar selection and canonical submission unchanged. Its full-date trigger label uses AppDate, and its default empty cue follows the selected order with LTR isolation. Explicit caller-provided placeholders remain unchanged. Calendar days/month headings keep their own semantics.

Deletion test: removing AppDate would duplicate subscription, invalid-date handling, numeric ordering, timezone selection and bidi isolation across each display caller. The module earns its interface. No generic protocol-string coercer, root context rerender or datepicker replacement is introduced.

## Diagnosis and proof

The first focused test ran against the real helper and failed: expected `10/11/2026`, received `10\u200f/11\u200f/2026`. This proves the locale-inserted control marks, not physical geometry. The browser baseline subsequently rendered the real ExpensesPage at the pinned base with synthetic query data and real Intl. Text Range geometry put `2026`, `11`, `10` at increasing x coordinates although logical text was day/month/year. The draft corrected component passed all 16 combinations of four orders, RTL/LTR and desktop/mobile, with setting-driven updates, clock retention and cross-tab refresh. Final committed-head proof remains separate. Earlier fixture bootstrap failures are preserved privately and are not described as product failures.

Ranked hypotheses before browser probing:

1. Internal RLM plus unisolated RTL containers reverse date component geometry. Removing those marks and isolating the numeric run should restore the selected order.
2. Container RTL alone reverses the run. A numeric string without controls should distinguish this from hypothesis 1.
3. Stored instant or timezone is wrong. Intl formatToParts should disagree on calendar day if this is the cause; the known day10/month11/year2026 probe argues against it.
4. Locale medium formatting loses padding. A single-digit fixture should fail independently of geometry.

Agreed test seams follow the owner's explicit proof request: pure formatting, persisted preference and storage events, actual setting-to-AppDate interaction, existing consumer integration, and browser text Range positions. Use literal worked examples, real Intl and synthetic UI data. Record failed attempts separately. No routine full suite/build; the contracts build is a prerequisite because this fresh frozen setup lacks the contracts declarations needed by web typecheck. The existing E2E selector returns full for the unmapped report-builder test path. CI retains that full scope. Local browser work is deliberately bounded to the date regression fixture because it directly exercises physical order in actual expense/system-log components, the actual setting and reactive range nodes without an unrelated full application run.

## Complete runtime caller inventory

All paths below are relative to apps/web/src. Status describes the source migration; exact-SHA execution is recorded privately under .scratch/reviews/534.

| Path / function | Decision |
| --- | --- |
| lib/algeria-time.ts / formatAlgeriaDate | Pure padded numeric component formatter; retains Africa/Algiers and invalid placeholder. |
| lib/algeria-time.ts / formatDateTimeInAlgeria | Numeric date portion plus unchanged localized clock and timezone. |
| features/expenses/expenses-page.tsx / existing grouped and table dates | AppDate children only; preserve container styling and all money behavior. |
| features/debts/debt-ledger-panel.tsx | AppDate entry date. |
| features/debts/consolidation-dialog.tsx | AppDate for both entry lists. |
| features/debts/record-entry-payment-dialog.tsx | AppDate entry date. |
| features/debts/void-entry-dialog.tsx | AppDate entry date. |
| features/employees/employee-details-page.tsx | AppDate salary payment date. |
| features/app-shell/salaried-workers-table.tsx | AppDate last payment; retain absent placeholder. |
| features/app-shell/salary-payments-table.tsx | AppDate payment date. |
| features/inventory/inventory-invoices-page.tsx | AppDate invoice date; retain translated absent state. |
| features/inventory/inventory-invoice-details-page.tsx | AppDate invoice date and timestamp with seconds for movements. |
| features/inventory/outbound-transfers-page.tsx | AppDate transfer date. |
| features/inventory/location-transfer-history.tsx | AppDate date; remove independent formatter. |
| features/inventory/transfer-history-page.tsx | AppDate date; native date filter values unchanged. |
| features/inventory/asset-charge-history.tsx | AppDate revision timestamp with seconds. Numeric currency formatting untouched. |
| features/projects/project-cost-section.tsx | AppDate expense, salary and asset-charge placement dates. |
| features/app-shell/home-view-derived-formatters.ts | AppDate-based range nodes; used by employee/project/warehouse histories. |
| features/app-shell/home-view-derived-employee-history.ts | Inherits reactive range nodes for state, manager, project, warehouse and ownership histories. |
| features/app-shell/home-view-derived-projects.ts | Inherits reactive assignment and ownership range nodes. |
| features/app-shell/home-view-derived-warehouses.ts | Inherits reactive assignment and ownership range nodes. |
| features/license/license-settings.tsx | AppDate validity and translated rich-text activation date; no raw numeric interpolation. |
| features/audit/audit-log-page.tsx | AppDate timestamp with seconds in table. CSV formatting intentionally unchanged. |
| features/reports/report-builder.tsx | AppDate generated timestamp with seconds. Report numeric formatting untouched. |
| features/app-shell/backup-settings.tsx | AppDate timestamp, short clock, existing null/invalid placeholder. |
| features/app-shell/settings-section.tsx | DateFormatSetting in appearance and AppDate update-check timestamp. |
| features/app-shell/system-log-section.tsx | AppDate timestamp, short clock. |
| components/ui/date-picker.tsx | Existing custom calendar full-date trigger and default empty cue follow preference; canonical value, explicit placeholders and calendar untouched. |
| features/update/update-section.tsx | Audited: download byte/speed formatting only, no full-date output. |

## Intentional exclusions

- `getAlgeriaDateInputValue`, `isAlgeriaCalendarDay`, `toAlgeriaDayBoundaryIso`, date-range and expenses-filters implement canonical values, business boundaries or comparisons. They never read display preferences.
- `hooks/use-report-queries.ts` generates CSV download timestamps, and audit-log-page exports CSV timestamps. Retain their existing stable export behavior, separate from runtime UI. Do not add invisible bidi marks to transport/export text.
- API/package search found no generated localized date-display strings consumed by the UI. System-log detail strings and wire timestamps retain their existing protocol semantics.
- Native HTML date inputs, DatePicker calendar day numbers/month headings, and salary daily/weekly/monthly labels are not full-date presentation. Keep their existing semantics; do not invent full dates.
- Telemetry, technical logs, ISO serialization, filenames, persisted timestamps, date sorting and server report bounds remain unchanged.
- Test utilities are not runtime callers. Shared timezone fixtures now use independent literal numeric expectations rather than reproducing Intl output.

## Delivery gates

Commit complete source and this inventory before the three distinct initial local lenses, in order debate, test-audit, code-review. Use Luna separate sessions under the owner's standing same-family exception; optional OpenCode is not opted in. Bounded corrections get one fresh combined-delta review. Exact-head focused checks, current-head hosted 5/5, CI acceptance, resolved findings and rendered synthetic public evidence remain separate gates. Publication is authorized; merge and UI self-approval are not.
