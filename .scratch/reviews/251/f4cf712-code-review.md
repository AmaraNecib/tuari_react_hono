# Code Review — Issue #251 (Coverage 100%: company/debt/finance)

- Base: `fd94c413846934e8722aa098f130e3a5bf9db1c6`
- Head: `f4cf712` (refreshed at final push)
- Two axes: Standards + Spec (parallel reviewer sub-agents).

## Standards

No blockers. The adapter move aligns with the repo's established adapter layout
(`adapters/sqlite-{workforce,operations,finance,audit}.repository.ts` already
existed; composition-root comment matches). The system-log filter unification
is a genuine duplicated-code fix (the old gate compared dates with raw string
operators while the matching set used `compareTimestampsDesc`). The finance
consolidation changes are provably correct (count==0 ⇒ sum==0). The
`paymentMethod ?? "CASH"` default and `assertDebtEntryDateNotBackdated` widening
are benign.

Judgement calls (accepted, not regressions):
- `primaryEvent` priority chain is a pre-existing Repeated-Switches-style list; the diff simplified it.
- `matchesFilters`/`resolveActorLabel` closures grow `buildCompanySystemLog`'s local state — acceptable at this size.

Residual concern verified: `UserProfileHistoryRecord.userId` is non-nullable
(company.types.ts:76 + `user_id TEXT NOT NULL` in schema-definitions.ts), so
`entry.name ?? currentAccountLabel` in the ACCOUNT_UPDATED log line never
produces null — the shortened label chain is safe.

## Spec

Acceptance criteria all met:
1. `vitest.config.ts` include covers company (incl. debt/finance services — they live inside the company module).
2. 100% thresholds pass on the measured modules (verified by run: 100/100/100/100).
3. Tests assert behavior (reviewer spot-checks; tautological/assertion-free cases recorded as fixed in test-audit evidence).
4. typecheck/test:api/lint green (run locally).

Scope-creep flags (all disclosed in the design doc, all justified):
- **Adapter move** — the single biggest enabler of the coverage target; follows parent #248 policy ("adapters excluded from coverage") and the #209 layout convention. Flagged, not blocked.
- **system-log refactor** — fixes a real date-filter divergence bug; behavior-neutral for valid inputs.
- **finance consolidation refactor** — provably a no-op under the single-connection sqlite deployment.
- `company.test-helpers.ts` remains in the coverage include (not `*.test.ts`) — the thresholds depend on the test-support file staying fully covered; intentional per design doc, fragile if helpers grow branches (noted).

## Verdict

Safe to push. No actionable findings from either axis.
