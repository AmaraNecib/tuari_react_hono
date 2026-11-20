# Exact-money import inventory

## Scope and authority

- Worktree: `D:/worktrees/tuari_react_hono/t3-dbac2e67-b7631174e6f9c301`
- Base: `18b065b1345653166eec74ade50ba9c41b7333fc` (prepared parent commit)
- Goal: repair the exact-money consumer allowlist that stopped PR #579's API job before API tests ran.
- Mode: focused-local / CI-final-pending. High assurance; three initial parent review lenses remain required.
- Reachable risk: a broad or permissive allowlist could hide unauthorized exact-money adoption across financial consumers.

## Decision

Keep the exhaustive sorted equality assertion. Update its title and explicit allowlist to the owner-approved activation observed in this checkout. The approved additions are the exact project-cost repository; exact report router and financial router; dashboard section, signed-in home shell, exact debts page and queries, externals page, and transfer-history page. Each remains a named expected path; unlisted consumers and missing expected consumers still fail.

Do not change financial source, import detection, CI policy, or dependencies. Establish red proof by introducing a temporary unauthorized import in a source file, run the focused test and observe failure, then restore that file before final verification.

## Baseline attribution

The prepared base is commit `18b065b1345653166eec74ade50ba9c41b7333fc`, which is also the merge base with `chore/issue-558`. The inherited test expected 39 consumers. Current source contains 48, including the nine explicitly approved additions listed above. This is a stale exact inventory expectation, not an API calculation failure. The CI report indicates the API test job stopped at this contracts test; no API tests ran.

## Verification

Focused contracts test and affected typecheck only. Preserve raw logs in a fresh D-drive temp directory; report exact commands, exit codes, test counts, elapsed time and source fingerprints in the handoff. Full suites and builds are not justified for this test-only delta. Parent owns reviews, hosted checks and publication.
