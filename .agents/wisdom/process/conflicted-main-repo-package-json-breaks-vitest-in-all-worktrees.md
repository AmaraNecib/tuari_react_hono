## Conflicted main-repo package.json breaks vitest in ALL worktrees (🟠 Major)

The main checkout had a stash-merge conflict in `package.json` + `pnpm-lock.yaml`
(UU, `<<<<<<< Updated upstream` markers). esbuild bundles vitest.config.ts by
walking UP past the worktree root to the main repo's package.json, so EVERY
`pnpm --filter @tuari/web test` in any worktree failed with "Expected string
in JSON but found '<<'". The worktree agents correctly refused to touch the
parent-owned file and escalated.

**Always**: before parallel worktree runs, verify the main repo is clean
(`git status --short` shows no UU/conflict markers). A conflicted
package.json/lockfile poisons esbuild resolution for every worktree. Fix on
the parent side (resolve to HEAD/develop), then have agents retry.


