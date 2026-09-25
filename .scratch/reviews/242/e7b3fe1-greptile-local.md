# Greptile — issue #242 (real report aggregation)

- Branch `feature/issue-242-real-reports`, base `origin/develop` (`6be3497`), evidence HEAD `e7b3fe1`
- Command: `greptile review --json --branch origin/develop --instructions "Review only issue #242
  diff from origin/develop; focus on real report aggregation/filter semantics, output contracts,
  tests, and source-only scope; ignore unrelated pre-existing findings/generated artifacts."`

## First run (at `57503b8`) — confidence 4/5, 1 actionable finding

- **P1 — finance.service.ts debt aging boundary:** an open account exactly 60 days old landed in
  the `31-60_DAYS` bucket while `overdueDzd` (documented as ≥ 60) also counted it, so the aging
  breakdown disagreed with the overdue figure.

### Resolution
The finding was legitimate and **fixed** in `e7b3fe1`: aging buckets now place age 60 into
`60+_DAYS` (`age <= 30 → 0-30`, `age <= 59 → 31-60`, else `60+`), so the `60+_DAYS` bucket equals
`overdueDzd` by construction. A dedicated boundary test pins the behavior. All local checks pass
(typecheck, lint, API 1181 passed / 1 skipped, web 494 passed — run before the final boundary-only
API fix).

## Re-verification — BLOCKED (external trial cap)
A second run could not be executed: `error: you've used all 50 trial reviews for this account.
Upgrade at https://app.greptile.com/-/settings/billing.` The Greptile trial quota on the connected
account is exhausted, so a fresh clean-verdict re-run for the final HEAD is not obtainable in this
lane. The single actionable finding it surfaced is fixed and test-pinned; the remaining diff is
unchanged from the reviewed code apart from that fix. **This must be re-verified by Greptile once
the account trial/billing allows** (or accepted by the parent on the basis that the only finding
was addressed).

## Residual risks / deferred
- As-of historic debt balance reconstruction (out of scope, documented).
- Movement value for asset outbound sales = 0 (no entry link; documented).
- Pre-existing `createOutboundTransfer` item-id ambiguity (finance path) discovered but out of
  #242 scope — recommended follow-up.
- Pre-existing post-RBAC-migration `worker`-role gap that blocks `INTERNAL_WORKER` debt-account
  creation (out of #242 scope) — recommended follow-up.
