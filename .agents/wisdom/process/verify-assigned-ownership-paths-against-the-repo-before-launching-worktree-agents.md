## Verify assigned ownership paths against the repo before launching worktree agents (🟠 Major)

Running four issues in parallel (one subagent per worktree) with an exclusive
file-ownership map: the map assigned #286 → `apps/api/src/modules/chunk/` and
#274 → `apps/api/src/auth/`. **Neither directory exists**. #286's real scope was
`apps/web` (home-view + sections + vite.config.ts manualChunks); #274's real fix
was `apps/web/package.json` + `pnpm-lock.yaml`. I remapped both to the actual
issue scope in each task text and documented the deviation to the user. Result:
all three implemented PRs (#295 rbac, #296 body-limit, #300 web-perf) stayed
strictly inside their owned paths, squash-merged onto develop with ZERO conflicts
in sequence. Disjoint ownership is what makes parallel worktrees conflict-free.

**Always**: before spawning per-worktree agents, `ls`/`find` the assigned paths
and verify they match the issue's real scope; when they don't, remap to the
issue scope (documenting the change) instead of blindly passing the map through.
Never let two agents share a path; merge in dependency order and re-check
mergeability after each squash.


