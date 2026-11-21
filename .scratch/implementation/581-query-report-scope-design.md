# Issue #581: query report execution scope

Base: `82836d098b534f6769567c5b626ed3f51a09dd7f`

Worktree: `D:/worktrees/tuari_react_hono/t3-8cbcf731-3b4c44dea48ca7da`

Mode: focused-local / CI-final-enforced, as supplied by the parent.

Review tier: prospective routine-trial slot 3, eligible for one fresh combined local review.

## Eligibility and scope, recorded before review outcomes

Issue #581 corrects one inaccurate, factual sentence in the historical query report. The API test job is conditional on the CI scope selector, so the claim that this test runs on every PR is false. This is narrow, reversible documentation work verified against current test, API script, workflow and selector sources. It changes no CI behavior or policy, and does not touch money, stock, authentication, recovery, schema, dependencies or application behavior. It is independent of #558.

Full writable manifest:

- `docs/QUERY_OPTIMIZATION.md`: replace only the unconditional CI execution claim with conditional wording and direct source links.
- `.scratch/implementation/581-query-report-scope-design.md`: this required design record.

The report's date, counts, index inventory, results and performance conclusions remain unchanged. This edit makes no claim of present-day EXPLAIN proof. If source inspection raises a CI correctness question beyond the factual claim, stop and report it rather than expanding scope.

## Proof and boundaries

Verify the changed sentence and links against `apps/api/src/tests/integration/query-explain-regression.test.ts`, `apps/api/package.json`, `.github/workflows/ci.yml` and `scripts/ci/ci-scope.mjs`. Run diff/whitespace and prose checks. No application tests, EXPLAIN execution, build, server, browser or install is justified for this prose correction.

The parent owns the fresh combined independent review, hosted verdicts, CI acceptance, protection and publication. Stop after commit and Guard Phase 1 for the frozen review handoff. No push, PR, merge, issue mutation, wisdom edit or other file change.

Architecture: no seam moved. No matching task wisdom was found in the scoped wisdom search.
