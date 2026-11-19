# PR 561 CI follow-up

Base: `2fb17eb6fdcf74dc06d167eb42a455bba570a90b`. Worktree: `D:/worktrees/tuari_react_hono/t3-6d8811cb-cd90ef29d5e1e717`. Verification mode: focused-local / CI-final-enforced, ruleset `26837184`. Review tier: high-assurance, because this fixes a CI inventory contract and the dependency-audit evaluator.

The contracts import inventory will explicitly allow the existing `apps/web/src/features/employees/employee-earning-allocation.ts` exact-money consumer. The exact-list assertion remains intact.

The audit collector will retain raw JSON and preserve severity thresholds and the exact temporary picomatch exception. pnpm 10.8.1 reports that `--audit-level` controls which advisories it prints. Hosted run `44432955805` demonstrates that an audit with 4 low, 12 moderate, 0 high and 0 critical findings can still exit 1. The evaluator accepts exit 1 only when the valid report contains findings, then applies the existing severity policy. Malformed reports, unexpected exits, muted findings, unapproved high or critical findings, changed exception identity/package/version/severity, and findings past the existing expiry remain failures. The hosted report contains no picomatch advisory; GitHub's advisory API marks GHSA-fc5q-39xc-vjpf withdrawn. No dependency, application behavior, threshold, exception scope, expiry, auth, payments, or schema changes.

Hosted evidence is limited to the supplied run `44432955805` logs at the base SHA. Local checks establish only the affected inventory, allocation helper, and audit collector behavior. Parent owns review, publication, and merge.
