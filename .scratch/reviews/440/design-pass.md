# Design pass — `fix/form-defaults` (issue #440)

Diff under review (`git diff 5d0629be...HEAD`, 6 files):

- `apps/web/src/features/inventory/inventory-invoice-create-page.tsx`
- `apps/web/src/features/expenses/expense-form-dialog.tsx`
- `apps/web/src/features/inventory/inventory-invoice-create-page.test.tsx`
- `apps/web/src/features/expenses/expense-form-dialog.test.tsx`
- `apps/web/src/features/date-picker-screens.test.tsx`
- `tests/web-hygiene.test.mjs`

Skills run against the diff: `domain-modeling`, `codebase-design`,
`improve-codebase-architecture`.

## 1. domain-modeling

- No `CONTEXT-MAP.md` and no `CONTEXT.md` exist in the repo. This diff introduces
  no new domain noun; it reuses the existing day vocabulary (`canonical
  yyyy-MM-dd`, "Algeria business day", `toAlgeriaDayBoundaryIso`). Nothing to add
  to a glossary.
- "A day is the Algeria business day" is stated in exactly one place:
  `getAlgeriaDateInputValue` / `toAlgeriaDayBoundaryIso` in
  `apps/web/src/lib/algeria-time.ts`. The diff removes the one competing
  statement (the private UTC copy) and adds a test that fails if a competing
  statement returns.
- Friction worth naming (not fixed here): the day concept is described three ways
  across code comments — `getAlgeriaDateInputValue`, "canonical day", "Algeria
  business day". That is a glossary candidate, not a code change. Recommendation:
  follow-up when a `CONTEXT.md` is first needed; out of scope for a bug fix.

## 2. codebase-design

- **Second copy of a rule (the serious one).** The base had two definitions of
  "today": the shared `getAlgeriaDateInputValue` and a private UTC
  `getTodayDateValue` in the invoice page. The diff deletes the copy. This is the
  single highest-value change in the diff: one rule, one definition.
- **Deletion test on `getAlgeriaDateInputValue`.** Deleting it would force the
  Africa/Algiers `Intl` formatting to reappear at 39 call sites and reintroduce
  the UTC-vs-Algeria class of bug. It earns its keep — deep enough (timezone
  behaviour behind a two-word interface), real seam (39 adapters).
- **Did the diff add anything shallow?** No production pass-through. The one
  helper the diff adds is `listSourceFiles` in `tests/web-hygiene.test.mjs`;
  it is test-only and exists so the single-definition rule is enforced, not
  merely documented.
- **Brittle assertion the pass caught and fixed in this PR:** the hygiene test
  originally asserted `assert.doesNotMatch(page, /new Date\(/)`, which would fail
  on any future unrelated `new Date(...)` in the page. Narrowed to the actual
  regression shape: `new Date(...).toISOString()` submit-time conversion.
- **Deepening opportunity the diff reveals (reported, not implemented):**
  every `useDateField` caller has to remember to pass
  `getAlgeriaDateInputValue()`. A caller that forgets gets an empty date and
  silently violates the rule. Making the hook's own default
  `getAlgeriaDateInputValue()` would state "a date field starts today" once for
  all four callers. It is a behaviour change to a shared hook used by
  `employees/add-salary-payment-dialog.tsx` (owned by another lane), so it is
  **out of scope here** and needs a parent decision before any lane makes it.

## 3. improve-codebase-architecture

Friction the diff creates or reveals, in the shared vocabulary:

- **Seam quality:** the diff routes the invoice page through the existing
  `algeria-time.ts` seam instead of a local one. That is the correct move: the
  seam now has uniform callers and the day rule has locality.
- **Rule enforcement without a seam:** "no second `today`" is now enforced by a
  source scan in `tests/web-hygiene.test.mjs`. A scan is the right shape while
  the rule is about *absence* of code; it would become shallow if it grew to
  police every default. Its deletion test currently passes (deleting it would let
  a UTC copy return and the 23:30-UTC regression test would not catch a *new*
  page that copies it).
- **Revealed deepening candidate (the strongest one):** the "form defaults"
  rule is applied per form by hand. `useDateField` is the natural seam for the
  date half of it. Recommendation: a follow-up issue — "`useDateField` defaults
  to the shared Algeria today, and no create form calls it with no argument" —
  owner-tagged, because it touches another lane's file.
- **No new tight coupling** and no leaked abstraction in the diff.

## Outcome

- Fixed in this PR: the duplicate UTC `today` definition; the invoice page's
  UTC seed and UTC submit conversion; the empty-first-render date in the expense
  dialog; the brittle hygiene assertion.
- Reported as findings with recommendation: (a) `useDateField` default-to-today
  — follow-up, cross-lane; (b) day-vocabulary glossary entry — follow-up when
  `CONTEXT.md` is created; (c) record-payment amount default and the expenses
  filter range default — owner decisions (see the lane report).

---

## Round 2 — design pass on the parent-decision diff

Second diff adds: `shared/use-form-amount.ts` (`useDateField` defaults to the
shared Algeria today), four call sites dropping the argument,
`expenses-page.tsx` filter opening empty, `expenses-filters.ts` losing the dead
`getDefaultExpenseDateRange`, plus tests and a hygiene scan.

Re-ran the three skills against this diff.

### domain-modeling
- The rule "a date field starts today" moved from caller discipline into the
  hook's interface (`useDateField(initialValue = getAlgeriaDateInputValue())`).
  That is one statement of the rule where there were four. Good.
- "Filter" vs "form" is now explicit in the design doc: a filter's empty state
  means "everything", a form's empty date is a bug. That distinction was the
  source of the brief's mis-classification; recording it here so it is not
  re-litigated.
- Still no `CONTEXT.md`; nothing to add beyond the day-vocabulary note from
  round 1.

### codebase-design
- **Deletion test on `getDefaultExpenseDateRange` passes:** deleting it removed
  a rule ("default to the current month") that only existed to feed one call
  site, and no complexity reappeared. Correct deletion, not a lost seam.
- **Deletion test on `useDateField`'s parameter:** the parameter still exists,
  but only tests use it now. It is not shallow because it is the hook's seam and
  the tests cross it directly; keeping it lets tests pin the reset/empty arms
  without reaching into state.
- **Second copy of a rule:** the "starts today" default is now single-sourced.
  The hygiene scan fails if a form passes an explicit date, which is the
  enforcement seam for the new rule.
- **Shallow additions:** none in production. One brittle-assertion risk was
  avoided in the hygiene regex by excluding the hook's own definition file
  explicitly rather than by a pattern that could silently stop matching.

### improve-codebase-architecture
- Friction created: none new. The `useDateField` deepening removes the
  cross-form duplication the round-1 pass identified.
- Friction remaining (reported, not fixed): `useFormAmount` still has no shared
  way to say "the amount starts at the full expected figure" the way
  `useDateField` now says it for dates. That is the salary/transfer-payment
  family, it is money behaviour, and the owner has explicitly deferred it (Q1).
  No action.
- Filter-vs-form is now a documented convention rather than tribal knowledge;
  the expenses filter is the reference implementation of "empty means
  everything".

Outcome: no new findings requiring a fix in this PR. The only deferred item
(`useFormAmount` full-figure default) is owner-deferred money behaviour.
