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
- New pure helpers in `packages/contracts/src/salary-days.ts`, shared by the API
  and the web form so the proposal cannot drift:
  - `computeProposedSalaryAmount`: MONTHLY `salary/30*days`, DAILY
    `salary*days`, WEEKLY unchanged (raw salary, not offered).
  - `deriveSalaryProjectDays`: for each project, the distinct Algeria calendar
    days its assignment windows cover inside `[periodStart, periodEnd]`;
    open-ended windows run to the period end; overlapping windows dedupe.
    Returns project-id-ascending order.

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
proposal. Validations: integer `days > 0`; `actualAmount > 0`; each split line
needs a positive integer and a project that exists; no duplicate project; the
split total must not exceed `days` (the remainder stays unallocated).
`WEEKLY` keeps working in code but is not prorated and is no longer offered.

## Web

- `AddSalaryPaymentDialog`: days input (default 30), live proposed amount,
  editable-but-overriding amount, per-project lines prefilled from
  `deriveSalaryProjectDays` for the month (MONTHLY) or day (DAILY) of the
  payment date, plus an explicit unallocated-remainder line and an
  over-allocation warning that blocks submit.
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

## Risks / ambiguities

- **Month length vs /30**: the derivation counts real calendar days, so a
  full-month March assignment suggests 31 days while `days` defaults to 30.
  The form surfaces the -1 remainder instead of hiding it. Decision record for
  the parent: whether the derived default should normalize a full period to 30.
- The split is a starting suggestion only; assignments corrected late are fixed
  by hand, per the prototype notes.

## Verification

See `.scratch/reviews/412/` for the evidence collected in this lane.
