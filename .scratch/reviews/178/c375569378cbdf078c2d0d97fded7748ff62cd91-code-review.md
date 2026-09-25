# Code Review — #178 (final refresh, post CI pin)

Two-axis review against the fixed recovery base.

- **Base:** `origin/develop` at `6be34976954dee8b6ef33a34ce923d348270cdb0`
- **HEAD:** `c375569378cbdf078c2d0d97fded7748ff62cd91`
- **Diff:** `git diff origin/develop...HEAD`
- **Tier:** Standard (E2E tests + CI workflow)
- **Spec:** `.scratch/implementation/178-design.md` and the local issue ledger.

The reviewed behavioral E2E code was finalized at `e0aa68c525b860bf15513910d27b0a8b6af2950a`; the
later commits were the evidence refresh (`13c29c2`) and the CI supply-chain pin
(`c375569`, `actions/upload-artifact@ea165f8d…` v4.6.2) which resolved the single
Greptile P2 finding. No E2E or other source behavior changed after `e0aa68c`.

## Standards

- **Pass:** The diff is confined to E2E tests/helpers, CI workflow, the issue
  design, and issue-specific review evidence. No web or production application
  source changed.
- **Pass:** Employee and debt phone values derive from every character of the
  same per-attempt `uniqueSuffix()` used for the corresponding name, with no
  `Math.random()`, `Date.now()`-only value, or fixed fallback:
  `tests/e2e/employees.spec.ts:27-34` and `tests/e2e/debt-entry.spec.ts:21-36`.
- **Pass:** Inventory item, warehouse names, and warehouse addresses use a
  retained per-attempt suffix: `tests/e2e/inventory-transfer.spec.ts:25-54`.
- **Pass:** The post-payment debt hub check is scoped to the matching party row
  and checks the signed reduced balance: `tests/e2e/debt-entry.spec.ts:98-103`.
- **Pass:** The reset helper validates listed tables, handles optional
  `sqlite_sequence`, uses transactional FK handling, and closes its connection:
  `tests/e2e/helpers/db-isolation.ts:82-125`.
- **Pass:** `actions/upload-artifact` is pinned to the immutable SHA
  `ea165f8d65b6e75b540449e92b4886f43607fa02` (v4.6.2), matching the adjacent
  SHA-pinned `actions/cache` reference at `ci.yml:260`.
- **Judgement call — Duplicated Code (🟡):** The phone-salt derivation is
  repeated in the employee and debt specs. This is minor test-only duplication
  and not a documented standards violation.
- **Residual (🟡):** `TRANSACTIONAL_TABLES` is manually maintained. The
  existence guard catches renamed/missing listed tables, not a newly introduced
  transactional table omitted from the list.

## Spec

- **Pass:** Reachable employee flow covers create with role, role edit,
  soft-delete, and disappearance from the list.
- **Pass:** Reachable project flow covers create with location/details and close
  to `COMPLETED`; unavailable dates and worker assignment remain documented
  deviations.
- **Pass:** Inventory covers item definition, receipt into warehouse A, A→B
  transfer, both balances, and transfer-history visibility.
- **Pass:** Debt covers counterparty/opening payable, partial payment, detail
  balance, payment ledger entry, and the post-payment hub balance.
- **Pass:** CI Playwright report upload, DB isolation, and replacement specs are
  explicitly included in the design; no material scope creep found.
- **Residual (🟡):** Transfer history checks quantity/type while the preceding
  warehouse-specific balances establish source/destination identity.

The documented project-date, dormant worker-assignment/reassignment, debt
consolidation, stale “5 specs,” and audit-wording deviations remain intentional.

## Validation

- Applied Greptile finding by pinning the upload action; verified the diff
  changes only `ci.yml` (one line).
- `pnpm check:workflow-assets`: exit **0**.
- `pnpm lint` (includes web-hygiene, i18n-keys, repo-hygiene, workflow-assets,
  update-metadata): exit **0**.
- `git diff --check`: exit **0**.
- Targeted #178 E2E (4 specs, 13 tests) previously passed at `13c29c2`; the
  `c375569` CI pin does not change E2E behavior or source, so it was not re-run.

## Conclusion

Standards and Spec axes pass with no blocker. The prior Greptile P2 supply-chain
finding is resolved and the delegated Greptile review at this HEAD is clean
(confidence 5/5, 0 comments). Remaining observations are low severity:
duplicated test helper logic, manual reset-list maintenance, and
transfer-history diagnostic strength.