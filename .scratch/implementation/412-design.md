# #412 — Salary payment: days worked and per-project split

mode: remote
ticket: #412 (GitHub, `AmaraNecib/tuari_react_hono`)
branch/worktree: `feat/412-salary-days` @ `worktrees/feat-salary-days`
target ref / base: `develop` @ `17911dc`
review tier: High-assurance (financial calculation)

## Public contract changes (`@tuari/contracts`)

- `employeeSalaryPaymentCreateInputSchema`
  - `days: int > 0`, default `30` — whole days only. The business pays per
    whole day; the day-before-Friday penalty and half days are explicitly out
    of scope (#412), so a fraction is not representable.
  - `actualAmountDzd` becomes optional. Omitted → the server stores the
    proposed amount; provided → the override is authoritative.
  - `projectSplits: Array<{ projectId, days>0 }>`, default `[]`. Empty is the
    "unallocated" payment.
- `employeeSalaryPaymentSchema` gains `days` and `projectSplits`; the split is
  exposed on every payment read path (`salaryPaymentsList`, `workspaceSnapshot`).
- New pure helpers in `packages/contracts/src/salary-days.ts`:
  - `computeProposedSalaryAmount` (shared by the API and the web form, so the
    proposal cannot drift): MONTHLY `salary/30*days`, DAILY
    `salary*days`, WEEKLY unchanged (raw salary, not offered).
  - `deriveSalaryProjectDays` (web form default only; the API takes the split
    as an explicit payload and never derives it): for each project, the distinct
    Algeria calendar days its assignment windows cover inside
    `[periodStart, periodEnd]`; open-ended windows run to the period end. A day
    belongs to exactly one project: assignment windows are half-open
    (`[startDate, endDate)`), so the instant that ends one project's assignment
    and starts the next leaves the handoff day to the new project, and any day
    two still-overlapping windows dispute goes to the first project in
    project-id order (round-4 review). Overlapping windows on the same project
    dedupe.
    The covered days are then normalized against the period length and scaled
    to the payment's day count (parent decision, #412): a project covering the
    whole period gets all of `days` (30 by default), a project covering 15 of a
    30-day period gets 15, and a partially covered period leaves the rest
    unallocated. Each line is floored and the remaining days are handed out by
    largest fractional part (largest-remainder/Hamilton), so a fully covered
    period sums EXACTLY to `days` (never `days + 1`, even through a handoff) and
    a correction can never drive a line negative. Order is project-id
    ascending.

## Data model

- `employee_salary_payment.days INTEGER NOT NULL DEFAULT 30` — fresh CREATE in
  `schema-definitions.ts`, plus the idempotent
  `ALTER TABLE ... ADD COLUMN` in `additiveStatements` (the `debt_entry`
  precedent). Existing rows backfill to 30; their stored amounts are untouched.
- New `employee_salary_payment_split` (id, payment_id FK CASCADE, project_id FK
  RESTRICT, days > 0, created_at) with payment/project indexes, mirrored in the
  Drizzle schema (`apps/api/src/schema/company.ts`).

## Service rules (`workforce.service.ts`)

`expectedAmountDzd` is the proration proposal for the entered `days`;
`actualAmountDzd` is the caller's override when supplied, otherwise the
proposal. **Meaning change:** `expectedAmountDzd` used to store the raw
`salaryAmountDzd`; it is now the prorated proposal. Legacy rows are never
recomputed — the migration only backfills `days = 30`, and the migration test
pins that their stored `expected_amount_dzd` / `actual_amount_dzd` read back
unchanged. Validations: integer `days > 0`; `actualAmount > 0`; each split line
needs a positive integer and a project that exists; no duplicate project; the
split total must not exceed `days` (the remainder stays unallocated).
`WEEKLY` keeps working in code but is not prorated and is no longer offered.

## Web

- `AddSalaryPaymentDialog`: days input (default 30), live proposed amount,
  editable-but-overriding amount, per-project lines prefilled from
  `deriveSalaryProjectDays` for the month (MONTHLY) or day (DAILY) of the
  payment date, plus a live unallocated-remainder readout and an
  over-allocation warning that blocks submit. The date the picker shows and
  returns is `dd/MM/yyyy`; the dialog converts with
  `toDatePickerValue`/`fromDatePickerValue` so its canonical `yyyy-MM-dd`
  state (and therefore the derived period and the submitted date) is preserved.
  While the person has not edited a line, the default re-derives as the days
  input changes (so the proposal always reconciles); once a line is touched,
  the hand edit wins and the remainder readout keeps the reconciliation honest.
- Derived data: `salariedEmployees[].projectAssignments` and
  `derived.salaryProjects` feed the dialog; the history table shows days.
- Period selectors no longer offer WEEKLY; a legacy WEEKLY employee keeps the
  option only while it is their stored value, so existing data still renders.

## Tests

- `salary-days.test.ts`: proration 30/27/15, daily, weekly, float noise,
  derived default (full period, before/after clamp, null end date, no windows,
  same-project overlap, two projects, outside window, single day, bad timestamp,
  inverted period), create-input defaults.
- `workforce.service-coverage.test.ts`: proration, daily, override,
  unallocated, split stored, sum > days rejected, unknown project rejected,
  duplicate project rejected, bad days rejected, non-finite amount rejected.
- `schema-definitions.test.ts`: days column + additive ALTER + split table/index.
- `schema-migrations.test.ts`: a legacy row (days column dropped) reads back
  with days 30 and unchanged amounts after re-running the schema bootstrap.
- Web `salary-payment-form.test.ts`: month/day period boundaries, unallocated
  remainder.
- Playwright `tests/e2e/salaries.spec.ts`: seeds a salaried worker with a
  project assignment, opens the dialog from the salaries section, asserts the
  proposed amount (`salary/30 x days`), the prefilled split, the unallocated
  remainder, the over-allocation block, and the recorded payment's days.

## Risks / ambiguities

- **Month length vs /30 (settled by parent decision).** The derivation counts
  real calendar days but normalizes them to the payment's day count, so a
  full-March assignment suggests 30 days at the default and the lines sum
  exactly to the day count. A partially covered period stays partly
  unallocated. The rule is pinned by contract tests (full period, partial
  coverage, rounding overshoot, single-day period).
- **`expectedAmountDzd` meaning.** It was the raw wage and is now the prorated
  proposal; legacy rows are never recomputed and render their stored values
  (pinned by the migration test).
- The split is a starting suggestion only; assignments corrected late are fixed
  by hand, per the prototype notes.

## Verification

See `.scratch/reviews/412/` for the evidence collected in this lane.
