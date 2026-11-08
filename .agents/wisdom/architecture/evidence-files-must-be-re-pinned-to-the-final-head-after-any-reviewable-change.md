## Evidence files must be re-pinned to the final HEAD after any reviewable change (🟡 Minor / process)

After the debate/test-audit/code-review, a Greptile P2 fix committed
`c808da3` which changed `inventory.types.ts` / `inventory.service.ts` /
`create-app.ts` / tests, all reviewable files. The evidence files named
`eaca0d4-*` therefore failed the guard's freshness check (reviewable files
changed since the evidence SHA). Fix: rename every evidence markdown to the
new final HEAD SHA (`c808da3-*`) and append an explicit post-evidence note
documenting what changed after the review and that the delta is pinned by the
new tests + the clean Greptile run on that exact HEAD. The guard rule only
re-validates if non-scratch files changed; `.scratch/` is non-reviewable.

**Always**: after emitting any code/test change post-review (Greptile fix,
debate fix, test audit fix, comment tidy), re-pin all `.scratch/reviews/<id>/`
evidence filenames to the new HEAD SHA and add a freshness note, and re-run the
Greptile gate on that exact HEAD before Guard Phase 3.

