# #491 lane dependency ownership

Base: `f779b3cdfab6b784edce7db5d200c31b46182288`. Verification mode: focused-local / CI-final-enforced. Risk: high-assurance tooling and dependency ownership.

One worktree is the lane's canonical source and mutable build owner. The ownership preflight checks that existing root and app `node_modules` roots resolve inside that tree and that existing API/web contracts links resolve to its `packages/contracts`. Missing installation links are allowed before setup/build. This permits a clean local contracts build; the separate full preflight still requires exported build files before API/web checks.

Root and direct API, web, and contracts test, typecheck, build, and dev scripts call the ownership preflight before their tool. pnpm's immutable content store may be shared; this check does not inspect arbitrary package entry links or prove artifact freshness. Raw direct tool invocations remain outside the guard. Backup ignore behavior is unchanged.

Applied wisdom: conflicted parent manifests can poison worktree tools, so this lane uses its own pinned source tree; Turbo logs can replay another tree's paths, so focused checks run directly; stale contracts output can mask source changes, so API test entry points build contracts first. The historical advice to install in every checkout is excluded because owner selected lane-owned installs and prohibited installs in this task. Candidate: keep direct package entry-point guards aligned when adding supported package scripts.
