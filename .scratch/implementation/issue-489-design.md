# Issue 489: Windows Rust CI execution

## Scope and authority

Base: eb4c16d05fd9ed187b825bdd94b057bfe8073396, fresh origin/develop.
Worktree: D:/worktrees/tuari_react_hono/fix-issue-489-independe-dde8dc81563de439.
Live issue #489 is open with no comments. Owner authorizes the named CI addition only.
Verification mode: focused-local / CI-final-enforced. Ruleset 26837184 was freshly read as active, strict CI acceptance from app 15368, no bypass actors, resolved review threads, deletion and force-push guards. Pending activation prose is historical.
High-assurance: a broken job or weakened aggregate can let platform-specific failures escape CI.
The updated owner authority requires explicit approval before merging this CI change. No UI changes.

## Design

Extend the existing test-rust job into an Ubuntu 24.04 and Windows 2022 matrix. No existing Windows workflow runs the requested cargo tests. Release, beta and nightly workflows build on Windows; SQLCipher proof does not execute Rust tests.
The same selector controls both legs. GitHub aggregates matrix outcomes into the existing test-rust dependency consumed by CI acceptance. Neither selector nor acceptance code changes. Disable fail-fast so either platform still produces execution proof if its sibling fails.
Keep apt system dependencies, the Bash import-boundary check and existing clippy enforcement on Linux. Both legs install Rust and Node for the signer integration test and run the entire crate with the exact issue command. A single native command lets the Windows PowerShell runner propagate cargo's exit status.
Windows 2022 matches the repository's existing native proof runner and avoids floating Windows image changes.

## Domain and architecture

Vocabulary remains selector, applicable job, matrix leg and CI acceptance. No business-domain term changes, glossary or ADR needed.
The workflow is the adapter from event-SHA scope to hosted execution. Its test-rust result interface stays unchanged. The existing acceptance module retains depth by validating every applicable result in one place. Deleting this matrix would remove Windows execution rather than relocate reusable logic. No new helper or duplicate acceptance rule is introduced.
Architecture: no seam moved. Parent assessment is limited to the unchanged selector-to-job-to-acceptance interface.

## Proof and review

Add a regression in the already CI-invoked tests/ci-final.test.mjs. Prove the current workflow fails the new matrix expectation, then verify the matrix, unfiltered crate command, Linux-only setup and retained clippy. Existing acceptance tests reject failed, cancelled, missing and unjustified skipped Rust outcomes.
Focused local checks: node --test tests/ci-final.test.mjs tests/workflow-policy.test.mjs tests/workflow-assets.test.mjs and git diff --check. No TypeScript or Rust source changes, so local typecheck or Rust compilation would not test the changed CI runner. Full suites/builds remain CI-final.
Static wiring is not hosted execution proof. Require a successful current-head Windows cargo step with the #403 stale_cleanup_matches_only_this_installations_api_sidecar test present in its log, successful CI acceptance, exact-head Greptile 5/5, resolved findings and fresh effective protection before merge approval.
Three independent initial Luna sessions: debate, test-audit, code-review, in order at a frozen commit. Bounded fixes receive one fresh combined-delta review.

## Boundaries and wisdom

Do not touch #425 expense RPC/tests or #480 contracts/inventory rounding. Preserve peer checks when merging develop. No policy/protection edits, dependencies, resource_dir spelling changes, logging seam, release claims or runtime changes.
Applied the hosted-runner migration lesson by inspecting current workflows and retaining hosted runners. Applied the workflow-snapshot lesson by requiring a fresh PR run, not an old-run rerun. Greptile lesson mechanics apply, but its historical waiver advice is superseded: missing verdict blocks merge.
