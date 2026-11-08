## Run git add/commit from the worktree root, never from nested scratch dirs (🟠 Major)

On #206, `cd ../..` from `.scratch/reviews/206` landed in `.scratch/`, so `git add .scratch/` staged nothing and the commit printed a confusing "On branch ci/github-hosted-runners" status (the pre-commit hook's pnpm workspace resolution surfaced the main worktree's branch). The evidence-rename commit appeared to fail and had to be re-done from the worktree root.

**Always**: `cd` to the worktree root before any `git add`/`git commit`/`git status`; verify `git status --short` shows exactly what you intend to stage.

