# Test Audit — #178 (final refresh, post CI pin)

Three read-only reviewers (edge-case hunter, coverage analyst, quality reviewer)
audited the final E2E tests/helpers against the fixed recovery base.

- **Base:** `origin/develop` at `6be34976954dee8b6ef33a34ce923d348270cdb0`
- **HEAD:** `c375569378cbdf078c2d0d97fded7748ff62cd91`
- **Scope:** `employees.spec.ts`, `projects.spec.ts`,
  `inventory-transfer.spec.ts`, `debt-entry.spec.ts`, `helpers/db-isolation.ts`,
  `helpers/db-seed.ts`, CI report upload, and the design metadata pin.

`c375569` changes only `.github/workflows/ci.yml` (action SHA pin); the audited
test code is unchanged since `e0aa68c`/`13c29c2`.

## Prior concrete findings — resolved

- Employee phone no longer uses independent `Math.random()`; it is derived from
  every character of the same per-attempt `uniqueSuffix()` as the employee name.
- Debt phone no longer uses `Date.now()` or a fixed fallback; it is derived from
  every character of the same suffix as the counterparty name.
- Inventory item, warehouse names, and warehouse addresses are suffix-derived;
  module-scope names are reused for the invoice, source/destination selectors,
  balance rows, and serial follow-up tests.
- The partial-payment test now returns to the debt hub and asserts the matching
  counterparty row contains the reduced signed balance `-3 000`.
- The Greptile P2 on the upload action is resolved by the SHA pin in `c375569`.

## Verified coverage and quality

- All four critical specs reset the transactional DB in `beforeAll` and use
  serial mode where later tests intentionally depend on setup data.
- Employee coverage: create with role, role edit manager→viewer, soft-delete,
  and list disappearance.
- Project coverage: create with location/details and close to `COMPLETED`.
- Inventory coverage: consumable item, two unique warehouses, invoice receipt
  into A, A balance, A→B transfer, A/B balances, and transfer history.
- Debt coverage: external counterparty, payable opening, initial hub balance,
  partial payment, detail `+3000`, payment ledger row, and post-payment hub
  `-3000`.
- Assertions are generally outcome-based and scoped to rows/cards; zero-match
  deletion uses polling/count semantics, and item selection resolves an option by
  matching text/value rather than index.
- Quality reviewer grade: **A**. No production-source changes are recommended.

## Residual risks (not blockers)

1. `TRANSACTIONAL_TABLES` is a manual reset allowlist. The existing guard catches
   removed/renamed listed tables but cannot detect a newly added transactional
   table omitted from the list.
2. Transfer history asserts `×5` and `تحويل داخلي`; the preceding balance
   assertions establish the A→B identity, but repeating item/source/destination
   identity in the history card would improve diagnostics.
3. The specs intentionally share module-scope values inside serial workflows;
   Playwright must retry the complete serial group so setup tests rerun before
   dependent tests.
4. Phone values are deterministic from the complete suffix but reduced to the
   eight-digit phone space; theoretical hash collisions remain possible.
5. Invalid quantity, overpayment, insufficient-stock, and failed-save cases are
   not part of the issue's reachable happy-path acceptance.

## Web-suite failure documentation

The earlier prep session observed one load-sensitive full-web failure in
`src/features/app-shell/home-view.test.tsx`.

- Test: `HomeView workspace shell > shows employees on their own page with clear action buttons`
- Failure: heading `العاملون` was not found
- First run: 58 files passed / 1 failed; 493 tests passed / 1 failed
- Standalone file rerun: 50/50 passed
- Immediate full-suite rerun: 59/59 files and 494/494 tests passed

The #178 diff contains no web source. No web code was changed; the failure is
recorded as a pre-existing load-sensitive test flake, not a #178 regression.

## Validation

- `pnpm check:workflow-assets`: exit **0**.
- `pnpm lint`: exit **0**.
- `git diff --check`: exit **0** (commit hooks passed for the pin commit).
- Targeted #178 E2E previously passed at `13c29c2` (13/13); the CI-only pin does
  not affect E2E behavior.

## Conclusion

The concrete #178 test-audit findings are fixed and reverified; the Greptile P2
is resolved and the delegated review at this HEAD is clean (5/5, 0 comments).
No blocker was identified.