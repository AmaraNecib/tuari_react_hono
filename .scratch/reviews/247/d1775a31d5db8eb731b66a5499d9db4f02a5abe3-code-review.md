# Code Review — #247 RPC wire tests (getRecoveryKeyPool / generateRecoveryKeys)

- Base SHA: `03ec349643901a2802338d8e19b730b28e5eb841`
- Head SHA (reviewed): `d1775a31d5db8eb731b66a5499d9db4f02a5abe3`
- Tier: Standard
- Date: 2026-08-10

## Method

Two parallel sub-agents against `git diff 03ec349...HEAD` (commits e5b9a62,
d1775a3): **Standards** (AGENTS.md, docs/engineering-workflow.md,
.agents/wisdom/testing.md + architecture.md, Fowler smell baseline) and
**Spec** (GitHub issue #247).

## Standards axis

**No hard violations, no blockers.** Correct: real `RecoveryKeyService` over a
stubbed `RecoveryKeyPort` injected via the harness `recoveryKeyService` param
(third positional arg); `@ts-nocheck` file conventions respected; exact
`toEqual` pins the ORPC output shape end-to-end ("output schemas validate,
they don't transform" wisdom); boundary assertions meaningful; service
constants (`INITIAL_KEY_COUNT = 3`, `MAX_KEY_POOL = 5`) corroborate the
asserted values.

Judgement calls (accepted, not violations):
- Mild duplicated fixture literal (7-field record repeated across the two
  tests) — acceptable in test fixtures.
- Hardcoded 3/5 constants instead of referencing private module constants —
  deliberate wire-pinning; drift would force a test update.
- Evidence dir must be committed while the PR is open (AGENTS.md).

## Spec axis

**(a) Missing/partial — none.** Both required tests exist and match the issue
scope ("two router tests using a stubbed RecoveryKeyPort-backed service ...
asserting the passthrough shapes resolve through ORPC output validation").
**(b) Scope creep — minor, benign:** the design doc (repo `.scratch/`
convention) and two boundary assertions inside the same tests. **(c)
Implemented but wrong — none.** Service math verified against the stub data;
`createdAt` truthiness correct per `createAlgeriaTimestamp` (`+01:00` ISO).

## Verdict

✅ Safe to push. No actionable findings on either axis.
