# PR 561 CI follow-up

Base: `2fb17eb6fdcf74dc06d167eb42a455bba570a90b`. Worktree: `D:/worktrees/tuari_react_hono/t3-6d8811cb-cd90ef29d5e1e717`. Verification mode: focused-local / CI-final-enforced, ruleset `26837184`. Review tier: high-assurance, because this fixes a CI inventory contract and the dependency-audit evaluator.

The contracts import inventory will explicitly allow the existing `apps/web/src/features/employees/employee-earning-allocation.ts` exact-money consumer. The exact-list assertion remains intact.

The audit collector will retain raw JSON and preserve severity thresholds and the exact temporary picomatch exception. The evaluator must distinguish pnpm's documented vulnerability exit behavior from command failures. Malformed reports, unexpected exits, muted findings, unapproved high or critical findings, changed exception identity/package/version/severity, and findings past the existing expiry remain failures. No dependencies, application behavior, thresholds, exception scope, expiry, auth, payments, or schema change.

Hosted evidence is limited to the supplied run `44432955805` logs at the base SHA. Local checks establish only the affected inventory, allocation helper, and audit collector behavior. Parent owns review, publication, and merge.
