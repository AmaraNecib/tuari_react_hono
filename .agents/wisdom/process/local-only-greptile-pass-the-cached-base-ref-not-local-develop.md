## Local-only Greptile: pass the cached base ref, not local `develop` (🟠 Major)

On #259 the CLI's `--branch <base>` named the base to diff against. Local `develop`
(`bb144f3`) was AHEAD of the cached `origin/develop` (`6be3497`) in the worktree's ancestry,
so `--branch develop` would have made Greptile diff an enormous unrelated range instead of
the tiny test-only change. Because the repo is unreachable in local-only mode, only the
cached `origin/develop` ref matches the pinned base SHA.

**Always**: in local-only mode run `greptile review --json --branch origin/develop` (the
cached ref that resolves to your pinned base, verify with `git rev-parse origin/develop`),
and inspect the raw summary before trusting a clean 5/5: it must describe only YOUR diff.
A green exit alone is not clean; confirm `comments: []` at confidence 5.

