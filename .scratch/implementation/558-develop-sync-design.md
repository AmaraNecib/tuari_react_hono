# #558 develop integration checkpoint

The owner requested an immediate develop refresh after recent PR merges. Fetched origin/develop at `f94af99e`, including #568 through #573, and merged it without rebasing or rewriting payroll history. Integration commit is `209f6fecaeed55f320d734595dc01dbf788ddbda`. There were no conflicts and no payroll source changes in the merge. Existing UI work remains isolated and must be integrated onto this refreshed parent after its completion; do not overwrite its live worktree or restart it.

## Plan changes

The current workspace now includes the portable ZIP identity, proof-process lifecycle and bounded diagnostics fixes, verified Nightly output publication, and source-bound Nightly tag handling. `check:workflow-assets` now also runs `tests/nightly-tag-build-identity.test.mjs`. The CI scope selector additionally recognizes the updated Windows Shell/Nightly paths for encryption evidence. Use these merged checks and packaging tools; do not restore older copies from preserved #427 branches.

Payroll API, commands, storage and lifecycle source are unchanged by the merge. Their exact-source test executions remain valid within their recorded boundaries; they are not relabeled as executions of unrelated incoming packaging changes. Three focused incoming-policy files passed with `node --test tests/ci-final.test.mjs tests/workflow-assets.test.mjs tests/nightly-tag-build-identity.test.mjs`; raw output is ignored at `.scratch/reviews/558-api/develop-sync-policy-tests.log`. No lock or dependencies changed, so no install or contracts rebuild is needed for this sync.

The source-frozen router debate at `119b0e8b` was cancelled before changing parent HEAD, preserving any prior result as historical evidence. Pin further router review to this refreshed source rather than asking a reader to inspect a moving tree. Do not rerun previously accepted payroll lenses automatically; only the additive router integration remains under its initial review cycle.

Next work remains integrating the UI child, completing additive-router review, and proving the connected current-route payment path without mixed exact/numeric writers. Normal exact-debt composition remains a separate concrete integration gap, not solved by the incoming packaging PRs. Verification mode stays focused-local / CI-final-pending. No publication, merge-to-develop, production database conversion or #558 completion is claimed.
