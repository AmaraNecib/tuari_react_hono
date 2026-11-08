## Rebase onto develop after sibling frontier PRs merge; rebuild contracts dist (🟠 Major)

While #251 was in flight, sibling coverage PRs #249/#250 merged into develop
(adding account/payment/rbac to the SAME vitest include). After rebasing, the
worktree's `@tuari/contracts/dist` was built from the OLD source. Auth bootstrap
tests failed with `Cannot read properties of undefined (reading 'status')` until
`pnpm --filter @tuari/contracts build` regenerated it (d.ts size told the story:
337 KB stale vs 334 KB fresh). **Always**: after rebasing a worktree onto a newer
develop, rebuild contracts before trusting test results; a failing test in a module
you didn't touch is the first sign of a stale dist.


