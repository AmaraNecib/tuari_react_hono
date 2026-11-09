## Pre-push hook runs the full suite and flakes on pre-existing tests: verify standalone, fix the flake in its own PR (🟠 Major)

The husky pre-push hook (`contracts build && typecheck && lint && test:api && test:web`)
re-runs the ENTIRE pipeline, so a single pre-existing flaky test blocks every push
until fixed or waived. Known instances: `home-view.test.tsx` (findBy*/timing flakes
under full-suite load, #206/#219/#222, ~50%), `sqlite-bootstrap.port.test.ts`
cross-connection write-lock contention (5s timeout, #196/#212/#259), and
`navigateMock` timing right after a multi-PR merge (see the wisdom-conflict entry).

**Always**: when the pre-push hook fails on a test you didn't touch:
1. Confirm the suite passes standalone (target file, then the full chain if cheap).
2. Prove the flake is pre-existing on base in a clean worktree
   (`git worktree add <path> <base-sha>`, install, build contracts, run the file).
3. Prefer fixing the flake in its OWN PR, merged before the blocked PR; otherwise
   push with `--no-verify` and let CI (hosted runners, same jobs) be authoritative.
   Document the waiver to the user. Never retry the suite repeatedly (~50% flake =
   wasted minutes per attempt).

