# #428 — DatePicker: canonical `yyyy-MM-dd` in / out, `dd/MM/yyyy` only in display

- mode: remote
- ticket: GitHub #428 (`gh issue view 428`)
- base: `develop` @ `9949146208d276915b31f28ba9a95788a6e113f5`
- branch/worktree: `fix/428-datepicker-audit` · `worktrees/fix-datepicker-audit`
- review tier: Standard

## Problem

`DatePicker` (`apps/web/src/components/ui/date-picker.tsx`) parsed and returned
`dd/MM/yyyy`. The app's canonical day everywhere else is `yyyy-MM-dd`
(`getAlgeriaDateInputValue`, `toAlgeriaDayBoundaryIso`, the API day filters).
A screen that holds canonical state therefore failed twice:

1. `parse(value, "dd/MM/yyyy", …)` was invalid, so the field looked unselected.
2. Picking a day emitted `dd/MM/yyyy` into canonical state. Downstream
   `toAlgeriaDayBoundaryIso` split on `-`, found no parts, and returned
   `undefined` (the salary/expense symptom: nulled period, silent "now" on the
   server). `new Date("01/10/2026")` in other paths parses as **January 10**
   (US month-first), a silent wrong day rather than a crash.

The expenses feature had bridged the two formats at its call sites with
`toDatePickerValue` / `fromDatePickerValue`. That bridge fixes two sites and
leaves every other site — and every future one — free to reintroduce the bug.

## Audit (every `DatePicker` usage in the app)

| # | Call site | State format | Verdict |
| --- | --- | --- | --- |
| 1 | `debts/debt-cases-panel.tsx:159` | canonical (`getAlgeriaDateInputValue`) | broken |
| 2 | `debts/debt-create-page.tsx:395` | canonical | broken |
| 3 | `debts/debt-ledger-panel.tsx:98` | canonical | broken |
| 4 | `debts/employee-debt-panel.tsx:89` | canonical (`useDateField`) | broken |
| 5 | `debts/record-payment-dialog.tsx:136` | canonical (`useDateField`) | broken |
| 6 | `employees/add-salary-payment-dialog.tsx:87` | canonical (`useDateField`) | broken |
| 7 | `employees/employee-details-page.tsx:317` | canonical | broken |
| 8 | `inventory/inventory-invoice-create-page.tsx:337` | canonical (`getTodayDateValue`) | broken |
| 9 | `inventory/inventory-invoice-create-page.tsx:580` (asset purchase date) | canonical | broken |
| 10 | `inventory/transfer-item-dialog.tsx:187` | canonical | broken |
| 11 | `expenses/expense-form-dialog.tsx:157` | canonical **through the bridge** | correct (bridge) |
| 12 | `expenses/expenses-page.tsx:235,243` | canonical **through the bridge** | correct (bridge) |
| 13 | `shared/table-primitives.tsx:189,198` (`DateRangeFilter`) | pass-through, consumers all pass canonical/`""` | broken at consumers (14–16) |
| 14 | `app-shell/system-log-section.tsx:254` | canonical/`""` | broken |
| 15 | `audit/audit-log-page.tsx:162` | canonical/`""` (`new Date(startDate)`) | broken |
| 16 | `reports/report-builder.tsx:75` | canonical/`""` | broken |

14 of 16 call sites were broken; the two "correct" ones were correct only
because someone remembered the bridge.

## Decision: invert the component contract, not the call sites

Make `DatePicker` a **canonical-day component**:

- **`value`** is the app's canonical `yyyy-MM-dd` day. A `dd/MM/yyyy` string is
  still accepted defensively and normalized to the same day for display, so a
  stray caller cannot silently blank the field or emit the wrong format.
- **`onChange`** always emits canonical `yyyy-MM-dd`.

`dd/MM/yyyy` survives only as the *display* format inside the component
(Arabic day-first), which is what the user sees and what react-day-picker is
laid out for.

Why this over bridging each call site:

- **One seam, one convention.** The bug is a format mismatch at a shared
  boundary; fixing it at the boundary is the only place that cannot be
  forgotten by the next screen. A bridge requires ~14 edits today and a rule
  every future author must know.
- **The class is closed by construction.** With canonical in *and* out, the
  specific failure mode the issue asks a guard to catch (a `yyyy-MM-dd`
  literal reaching the picker) is no longer an error — it is the contract. The
  wrong-literal lint the issue suggests only makes sense if we keep the
  display-format contract.
- **No second convention in the tree.** `toDatePickerValue` /
  `fromDatePickerValue` are deleted along with their call sites.

Trade-off: a caller that genuinely wanted to *store* `dd/MM/yyyy` would now get
canonical back. No such caller exists (every audited screen holds canonical),
and the app's canonical day is `yyyy-MM-dd` everywhere else, so canonicalizing
on output is the correct normalization, not a lossy one.

## Changes

- `apps/web/src/components/ui/date-picker.tsx` — parse canonical *or* display
  input; emit canonical; drop the bridge exports; document the prop contract.
- `apps/web/src/features/expenses/expense-form-dialog.tsx`,
  `expenses-page.tsx` — pass canonical directly (bridge removed).
- `apps/web/src/components/ui/date-picker.test.tsx` (replaces `.test.ts`) — pins
  the component contract by driving the real picker: canonical renders, pick
  emits canonical, legacy display input is normalized, hidden input is
  canonical, empty/invalid values fall back to the placeholder.
- Per-screen tests assert the **submitted** canonical value after a real pick:
  - `apps/web/src/features/date-picker-screens.test.tsx` — `TransferItemDialog`,
    `RecordPaymentDialog`, `AddSalaryPaymentDialog`, `EmployeeDebtPanel`,
    `DebtLedgerPanel`, `DebtCasesPanel`, `DebtCreatePage`.
  - `apps/web/src/features/inventory/inventory-invoice-create-page.test.tsx` —
    invoice date and asset purchase date.
  - `apps/web/src/features/debts/debts-mvp-web.test.tsx` — `EmployeeDetailsPage`
    finance-tab inline payment form.
  - `apps/web/src/features/shared/table-primitives.test.tsx` — `DateRangeFilter`
    (shared by system log, audit log and reports).
  - `apps/web/src/features/expenses/*.test.tsx` — already covered; continue to
    pass with the bridge removed.

## Guard

The durable guard is the inverted contract plus tests, because the failure was
invisible in the display layer:

- Component tests fail if the picker ever stops round-tripping canonical days,
  stops tolerating display-format input, or starts emitting `dd/MM/yyyy`.
- Per-screen tests fail if a screen's submit path stops receiving canonical.
- A `yyyy-MM-dd`-literal lint is **not** added: after the inversion that literal
  is the correct input, so such a lint would encode the reversed contract. What
  tests cannot cover: a screen that never triggers the picker at runtime and has
  no test; that is a coverage gap, not a format-class gap, and the component
  contract no longer depends on the caller.

## Risks

- Any consumer relying on the picker's hidden `name` input receiving the raw
  prop string: none exists (no caller passes `name`). The hidden input now
  always carries canonical.
- `audit-log-page` compares `new Date(startDate)`, which parses canonical as UTC
  midnight; superseded by Round 2 below, which makes the end day inclusive.

## Verification

- `pnpm --filter @tuari/web test --maxWorkers=2` — full web suite green (658
  tests).
- `pnpm --filter @tuari/web typecheck`, `pnpm --filter @tuari/web lint`,
  `pnpm check:unslop` — green.
- Scoped v8 coverage over `date-picker.tsx` — 100% lines, ~85% branches.
- Exact commands and results are in `.scratch/reviews/428/`.

## Round 2 — range boundaries (batched review finding)

The inversion made `DatePicker` emit canonical `yyyy-MM-dd`. That fixed the
single-day consumers, but a bare day is *not* a range bound:
`new Date("2026-10-15")` is UTC midnight, so a range that ends on a picked day
dropped everything written after 00:00 on that day.

Decision: a range's end day includes the **whole** day — end-of-day in
Africa/Algiers (`…T22:59:59.999Z`) — and its start day is the day's start
(`…T23:00:00.000Z` the previous UTC day). The rule lives once in
`lib/date-range.ts` (`resolveDayRangeBounds` / `isInstantWithinDayRange`), and
every range consumer uses it.

| Consumer | Before | After |
| --- | --- | --- |
| `audit-log-page` (client filter) | `new Date(endDate)` (UTC midnight → drops the day) | `isInstantWithinBounds` over one resolved bound pair |
| `workspace-queries` system log (wire) | already `toAlgeriaDayBoundaryIso(…, "end")` | same rule via `resolveDayRangeBounds` |
| `hooks/use-report-queries` (wire) | bare day, rejected by the datetime contract | `resolveDayRangeBounds` |
| `features/expenses/expenses-filters` (wire) | already end-of-day | same rule via `resolveDayRangeBounds` |
| `DateRangeFilter` | pass-through days | doc states consumers must expand to bounds |

The other range consumer audited is the API side: `resolveReportWindow`
(`<= endMs`) and `listSystemLog` (`compareTimestampsDesc`) both treat the upper
bound as inclusive, and the client now hands them end-of-day instants.
`debts-mvp-web.test.tsx` now picks a day that is **not** the form default, so
the assertion proves the pick changed the submitted value.

Round-2 verification: `pnpm --filter @tuari/web test --maxWorkers=2` — 81 files,
672 tests green; root `pnpm typecheck`, `pnpm lint`, `pnpm check:unslop` green;
scoped v8 coverage: `date-range.ts` 100% (stmts/branches/funcs/lines),
`expenses-filters.ts` 100%.
