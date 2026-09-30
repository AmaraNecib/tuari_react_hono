# Debt terminology — test audit

- lane: fix-debt-terminology
- base SHA: `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`
- reviewed HEAD: `2be128f042b30d5cde82488080cc7424d36842db`
- reviewers: independent edge-case / coverage / quality sub-agents (read-only), parent synthesis

## Edge case hunter

- Sub-dinar balance (`0.4` / `-0.4`) rounded to `0` beside a direction phrase. Fixed by
  keeping centimes in `formatDebtAmount`.
- Ledger running-balance column (`balanceAfterDzd`) had no screen coverage because the
  tests render `debtEntries={[]}`.
- Movement-delta sign was never asserted through a render.
- Non-finite balances are unguarded (`NaN` would print beside a confident phrase).
  Dismissed: inputs are validated (`debt-ledger-panel.tsx:57`, `normalizeSignedMoneyAmount`).
- Hub stat cards show a direction label with `0` when a bucket is empty. Dismissed: the
  cards are direction *bucket totals*, not a single balance state.

## Coverage analyst

- Helper tests assert the exact phrase per `(direction, sign)` and an independent Arabic
  oracle, so a swapped `owedToUs`/`owedByUs` or a flipped PAYABLE sign fails.
- The hub screen test (`debts-mvp-web.test.tsx:118-124`) only asserts presence, not which
  row maps to which direction — a sign→phrase inversion there would not fail it.
- The consolidation dialog had **no** coverage, so the preview inversion and the header
  overpaid inversion were invisible. Added.
- Zero covered at helper, API and one screen; direction-less fallback covered.

## Quality reviewer

- Grades: `company.unit.test.ts` A, `company.service.test.ts`/`router.test.ts` A-,
  `debt-helpers.test.ts` B+, `debt-utils.test.ts` A-, `debts-mvp-web.test.tsx` C+.
- Loose `getAllByText(/700/)`-style screen assertions can pass on the wrong magnitude;
  only the sign is guarded. Noted, not fixed (out of the review's blast radius).

## Synthesis — added tests (all verified to fail on pre-fix source)

| Test | Fails pre-fix because |
| --- | --- |
| `debts-mvp-web.test.tsx` "phrases the remaining payable balance as owed by us" | preview showed `مستحق لنا` |
| `debts-mvp-web.test.tsx` "phrases the remaining receivable balance as owed to us" | preview showed `مستحق علينا` |
| `debts-mvp-web.test.tsx` "states the overpayment phrase for an overpaid payable header" | header had no state phrase |
| `debts-mvp-web.test.tsx` "keeps opening-entry movement deltas signed" | entry showed `5,000` |
| `debts-mvp-web.test.tsx` "keeps a voided payment movement delta signed" | void amount showed `300` |
| `report-builder.test.tsx` "does not stamp a direction phrase on the gross totals" | two `مستحق لنا` cards rendered |
| `debt-utils.test.ts` "keeps a nonzero sub-dinar balance from rounding to a bare zero" | `formatDebtAmount(0.4)` was `"0"` |
