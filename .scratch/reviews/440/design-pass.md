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
