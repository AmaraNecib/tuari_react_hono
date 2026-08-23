# Test audit — c00e7d4 (issue #42)

Lane-conducted audit of the new unit tests. Unit-only round: vitest (web) +
vitest (api), no Playwright.

## Coverage of the changed branches

| Branch (web) | Covered by |
| --- | --- |
| PERCENT mode, percent < 0 | `blocks submitting a negative paid percent` |
| PERCENT mode, percent > 100 | `blocks submitting a paid percent above 100` |
| PERCENT mode, percent == 0..100 passes | `accepts the boundary paid values (percent 100)` |
| AMOUNT mode, amount < 0 | `blocks submitting a negative paid amount` |
| AMOUNT mode, amount >= 0 passes | existing `submits debt + payment payload` (1500.5) + boundary test (0) |
| createDebt false → no validation, fields not sent | existing `submits debt + payment payload` family (payload `paidAmountDzd`/`paidPercent` null) |
| handleSubmit validation path resolves (no throw) | every blocked test — vitest fails a run on an unhandled rejection, so a passing click-with-invalid-value test proves no rejection leaked through `void handleSubmit()` |
| click-handler `.catch` residual path | not directly asserted (would require forcing `mutateAsync` to reject); mutation `onError` toast behavior is pre-existing |

All branch declarations in the new `validateForm` additions are exercised
(percent in/out of [0,100], amount in/out of >= 0, the two payment-mode
guards, and the `createDebt` gate via existing tests).

## API wire-gate test

- `paidAmountDzd: -5` → BAD_REQUEST with issue path `["paidAmountDzd"]`.
- `paidPercent: 150` and `paidPercent: -1` → BAD_REQUEST with path
  `["paidPercent"]`.
- Uses the same harness (`createTestRouter` + `createClient`) and assertion
  shape as the neighboring `paymentsCreate` financially-invalid gate test, so
  the FULL auth+wire path is pinned, not just the schema in isolation.

## Edge cases considered

- Empty paidValue (`""` → `Number("")` = 0) is in-bounds and sends 0 — matches
  the pre-existing behavior (`paidValue || 0`) and the contract (nonnegative).
- NaN handling: jsdom implements the number-input sanitization algorithm, so a
  non-numeric value collapses to `""` (0) before React sees it; the NaN branch
  is unreachable through the UI and the existing checks do not guard it either
  (attempted test proved jsdom sanitization). Documented in the design doc.
- Boundary inclusivity (0 and 100 valid) is pinned in the acceptance test.
- The wire-gate test does not assert the missing-`entries` error (also
  BAD_REQUEST); out of scope for the paid-value bounds.


## Test-audit delta (c00e7d4, round 3)

## Test-audit delta (c00e7d4, round 3)

Three tests pin the duplicate-invoice guard:

- upload failure → Save button GONE, retry action present, toast shown,
  `onCreated` not called, create mutation called exactly once;
- retry → `uploadInvoiceAttachments` called AGAIN with the SAME invoice id
  ("inv-1") while the create mutation total stays at 1; on success
  `onCreated("inv-1")` fires;
- retry-failure → toast twice, still no navigation, still no re-creation,
  retry action still present.

Existing mutation-rejection and blocked-validation tests unchanged. All
23 tests in `inventory-invoice-create-page.test.tsx` pass; web suite 607/607.

## Test-audit delta (816f093, review-fix round)

Two new failure-path tests in `inventory-invoice-create-page.test.tsx`:

- `toasts and does not navigate when attachment upload fails after the invoice
  is saved` — upload mock rejects; asserts the dedicated toast message AND that
  `onCreated` (navigation) is never called. This pins the fix for the Greptile
  finding: user-visible error, no silent navigation past a partial save.
- `does not navigate when the invoice creation mutation rejects` — asserts
  `onCreated` is never called after the mutation rejection settles through
  `handleSubmit`'s catch (the mutation's own `onError` toast is the visible
  signal, asserted implicitly through the page never reaching navigation).

Coverage: both new `catch` branches (mutation, upload) plus the happy-path
`onCreated(groupId)` call are each exercised; the residual click-handler catch
is unreachable by construction (known paths are contained) — same class of
defensive branch the repo keeps untested. Web suite 605/605 on this HEAD.

## Verdict

No gaps that would let a new regression ship silently. Recommend the parent
run the repo's standard code-review/Greptile pipeline before merging.