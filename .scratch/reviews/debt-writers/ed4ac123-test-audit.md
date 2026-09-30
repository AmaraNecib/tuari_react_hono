# Debt writers (PR #464) — test audit

Range: `git diff bfb87fbd...HEAD`. Edge-case hunter + coverage analyst + test
quality reviewer on fresh context. Fixes landed in `ed4ac123`.

## Answers to the brief's questions

1. **Are the failing-first assertions the observed wrong values?**
   Mostly yes. D4 pins `currentBalance === 600` after a 1000/400 purchase and
   `not.toBe(-1200)` (the probe's observed pre-fix value) after the final
   payment. D8 pins `signedAmountDzd === -200`. D1a pins RECEIVABLE + `5000`.
   D7 pins `-200`/`-300`. Weak spots: the D2 rejection test only asserted
   `CompanyError`, and the invariant loop asserted only `ledger === invoice`
   with no absolute value.
2. **Invariant on a sequence, not a single case?** Yes — `[200, 300, 500]`,
   ending 0. Strengthened in `ed4ac123` with the absolute remaining value at
   each step so a payment dropped from *both* the ledger and the invoice
   counter in lockstep can no longer pass.
3. **Salary-advance test proving RECEIVABLE with a positive amount?** Yes —
   `direction === "RECEIVABLE"` and `currentBalance === 5000` (and the ADVANCE
   test asserts `signedAmountDzd === 500`).
4. **Does a test fail if `input.direction ?? "PAYABLE"` is re-added?** Yes —
   "records an ADVANCE as a positive worker receivable" fails if an ADVANCE
   lands PAYABLE. `ed4ac123` adds tests that fail if the *explicit* override
   returns first, and if the reason category is ignored.
5. **Is the cases-panel shape test load-bearing?** Weakly — it passes on the
   pre-fix code, so it is a regression guard against a naive rejection of
   `direction` with no category, not a pre-fix detector. Now also pinned at the
   contracts wire level.
6. **Duplicate coverage?** Layered, not harmful. SALARY_ADVANCE is asserted at
   core / service / contracts / web / integration, which is intentional.

## Missing cases found and their disposition

| Missing case | Risk | Disposition |
|---|---|---|
| ADVANCE + explicit PAYABLE | RED | Fixed — service + wire reject; tests added (`ed4ac123`) |
| OPENING + SALARY_ADVANCE (category ignored) | RED | Fixed — derives RECEIVABLE; test added |
| Wire-level "explicit direction, no category accepted" | ORANGE | Fixed — contracts test added |
| Invariant loop lacked absolute values | ORANGE | Fixed |
| D2 rejection asserted only the error type | ORANGE | Fixed — asserts the message |
| `getEmployeeDebtAccount` ambiguous with two ledgers | ORANGE | Deferred (no live caller) |
| `createEmployeeDebtEntry` has no overpay guard | ORANGE | Dismissed — overpay is a modelled credit state; wire rejects non-positive amounts |
| `firstPayment > 0` with `debtAmountDzd = 0` throws | ORANGE | Dismissed — contradictory input; correct rejection |
| NaN skips the inventory debt block | ORANGE | Dismissed — wire `z.number().nonnegative()` rejects NaN at the RPC boundary |
| `getDebtAccountNetContribution` sign convention unasserted | YELLOW | Noted; covered indirectly by net-balance tests |
| Reuse path across two invoices | YELLOW | Noted; per-counterparty ledger model (D5) |

## Test quality grade

**B+** before the fixes. Exact `toBe` numeric assertions, good isolation,
production schema + migrations in the inventory suite, and an exemplary D3
index test (existence, legacy index gone, idempotent re-run, raw duplicate
INSERT). After `ed4ac123` the weak `assert-only` spots above are closed.
