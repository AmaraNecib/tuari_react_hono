# Debt terminology — test audit for the pushed head

- lane: fix-debt-terminology
- base SHA: `5d0629be768a75689c081249843af4a79d045230`
- reviewed HEAD: `f8cf1b3dc0d24eb5c75732119d868e51b9dec0a0`
- companion: `f8cf1b3d-code-review.md`

## What the tests guard

Every review finding is pinned by a test that fails on the pre-fix source
(reverted the exact fix hunk, kept the current test):

| Test | Pre-fix failure |
| --- | --- |
| `debt-utils.test.ts` "phrases a payable remainder as owed by us, never owed to us" | sign-only preview showed `مستحق لنا` |
| `debts-mvp-web.test.tsx` "phrases the remaining payable balance as owed by us, not owed to us" | sign-only preview showed `مستحق لنا` |
| `debts-mvp-web.test.tsx` "states the overpayment phrase for an overpaid payable account header" | header had no state phrase |
| `debts-mvp-web.test.tsx` "keeps opening-entry movement deltas signed" | delta rendered `5,000` |
| `debts-mvp-web.test.tsx` "keeps a voided payment movement delta signed" | amount rendered `300` |
| `report-builder.test.tsx` "does not stamp a direction phrase on the gross outstanding/overdue totals" | two `مستحق لنا` cards rendered |
| `debt-utils.test.ts` "keeps a nonzero sub-dinar balance from rounding to a bare zero" | `formatDebtAmount(0.4)` was `"0"` |
| `date-picker-screens.test.tsx` both create-page direction tests | `direction` undefined, owed-by-us sent `-500` |
| `debts-mvp-web.test.tsx` both cases-panel direction tests | `direction` undefined, owed-to-us sent `-500` |

## Edge cases and states

- Four `(direction, sign)` states + zero covered at the helper, contract, and
  screen level; zero renders `مسوّى`, never `مستحق علينا 0`.
- `formatDebtAmount` keeps centimes so a sub-dinar balance cannot round to `0`
  beside a direction phrase; `formatDebtMoney` stays signed for movements.
- The hub row uses the documented net path (positive → `مستحق لنا`); the
  per-account path always passes the account direction.
- The cases-panel fix normalizes a typed minus to a magnitude and asserts the
  sent direction, so the sign can no longer decide the phrase.

## Coverage

- `@tuari/contracts` `debt-helpers.test.ts`: 100% statements / branches /
  functions / lines (25 tests).
- Full `@tuari/contracts`: 219 tests, 89.68% statements.
- Full `@tuari/web`: 95 files, 851 tests (2 more than before this pass).

## Known gaps (not created here)

- `dashboard-overview.tsx` (the dashboard half of the gross-total finding) is
  dead code and has no render test; `report-builder.tsx` is the live, tested
  equivalent (F2, parent is filing).
- Loose `/700/`-style magnitude assertions can pass on the wrong amount; the
  sign is guarded, the magnitude is not. Pre-existing.
- The cases-panel "record payment creates an account" path is out of scope and
  filed with the debt-writers lane (F1b).
