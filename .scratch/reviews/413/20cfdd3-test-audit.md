# PR #422 round 7 — test audit (edge + coverage + quality)

reviewed HEAD: 25c60c71
fix commit: 20cfdd30a6b8a0eda33c3eba94442df326712d3d
base: origin/develop

Three fresh-context reviewers: edge-case hunter, coverage analyst, quality
reviewer. Grades before fixes: transfer-item-dialog B, asset-charge-history B-,
inventory-hooks A-, invoice-details B, asset-charge.service A,
inventory-transfer-charge A-, sqlite adapter A-, contracts B+.

## Fixed (with a test that fails on the pre-fix code where a behaviour changed)

1. **Batch partial-overflow rollback (edge, high).** The in-memory double's
   `withTransaction` was a passthrough, so it could not prove rollback. It now
   snapshots/restores, and the production path resolves all amounts before
   writing. Tests: "refuses a batch whose individually legal amounts would make
   the total unreadable" and "rolls the whole batch back when a later placement
   overflows" (both fail pre-fix), plus a real-sqlite mid-batch failure test.
2. **Huge percentage → over-bound amount (edge, medium).** `handlePercentChange`
   was untested. Added a dialog test asserting the derived over-bound amount is
   rejected and submit is blocked.
3. **Voided-last-charge fallback (edge, medium).** Added a service test.
4. **voidCharge escape hatch (edge, low).** Added a service test that seeds an
   over-bound project, voids one charge, and reads the total back.
5. **Zero-price default (edge, low).** Added a dialog test.
6. **Weak "never blocks" assertion (quality).** The over-price test now submits
   and asserts `chargeAmountDzd: 150000` instead of only checking a button
   exists.
7. **Project-name N+1 (quality).** The adapter test now counts the
   `SELECT name FROM project` queries and asserts exactly one.
8. **History timestamp / voided affordance (quality).** The revision test now
   asserts the formatted timestamp; the voided-row test asserts exactly one
   "تعديل" and one "إلغاء".
9. **Contracts `charges` required (quality).** The test now proves omitting
   `charges` fails with a `charges` issue and that `[]` is accepted.
10. **Arg-blind hook mocks (quality).** The dialog, history and invoice-details
    tests now record the unit id passed to the query hook and assert it.
11. **Coverage gaps (coverage).** Added: header-inherited project charge,
    invoice path without the charge service, explicit `null` amount, void
    revision reason/actor, correction landing exactly on the bound, empty batch,
    batch default carry-forward, consumable dialog branch, cancel paths,
    contract `roundMoney`.

## Accepted / reported

- The rejection-swallowing history tests use a one-tick wait plus a
  `process.on("unhandledRejection")` probe. That is the point of the assertion
  (prove no unhandled rejection), so the pattern stays; flake risk is low and
  the draft-still-open assertion backs it up.
- Fixture setup duplication between the sqlite adapter test and the transfer
  test remains; extracting a shared factory is a cleanup, not a defect.

## Coverage after fixes (scoped)

- `apps/api/.../asset-charge.service.ts`: 100% statements/branches/functions/lines.
- `packages/contracts/src/payment.ts` (incl. `roundMoney`): 100% all.
- Web `asset-charge-history.tsx`: 100% lines/statements/functions, 87.9%
  branches (JSX ternaries). Web has no coverage threshold gate.
- Web `transfer-item-dialog.tsx`: 89.4% lines (consumable/notes/cancel chrome).
